import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCard } from 'custom-card-helpers';
import type { MaterialThermostatCard } from './material-thermostat-card';
import type { MaterialThermostatCardConfig } from './types';
import { isZoneActive, type SelectorDisplay } from './myplace-controls';

export const DUCTED_CARD_TYPE = 'material-ducted-thermostat-card';

export interface DuctedZoneConfig {
  entity: string;
  name?: string;
  /** Exact option label from the configured master select entity. */
  master_option?: string;
}

export interface DuctedGridCardConfig {
  type: string;
  zones: DuctedZoneConfig[];
  /** Number of fixed columns, or 'auto' for width-based layout. */
  columns?: 1 | 2 | 3 | 4 | 'auto';
  /** Minimum grid-cell width for auto layout, in pixels. */
  min_zone_width?: number;
  /** Space between thermostat cards, in pixels. */
  gap?: number;
  dial_style?: 'halo' | 'minimal' | 'google';
  /** Maximum dial diameter in pixels; shrinks on narrow screens. */
  dial_size?: number;
  system_entity?: string;
  myzone_entity?: string;
  /** Optional script entity used for safe zone shutdown/handover. */
  zone_off_script?: string;
  /** Optional script for activating zones, including system startup. */
  zone_on_script?: string;
  /** Optional script for system mode/fan (retains site-specific dump zone rules). */
  control_script?: string;
  /** Optional controller preset required for manual zone controls. */
  manual_preset?: string;
  /** Shared mode and fan presentation (independently configurable). */
  mode_display?: SelectorDisplay;
  fan_display?: SelectorDisplay;
  /** Show a per-zone crown button for selecting and indicating MyZone. */
  show_master_selector?: boolean;
}

/**
 * Composes unmodified Material Thermostat Card instances.
 * Each instance retains its own temperature debounce, optimistic target and
 * service call binding, avoiding cross-zone setpoint contamination.
 *
 * Controller entities, manual preset and master option names come from dashboard
 * YAML. The component does not embed installation-specific entity IDs.
 */
@customElement('material-ducted-thermostat-card')
export class MaterialDuctedThermostatCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private _config?: DuctedGridCardConfig;
  private _applied = new WeakMap<MaterialThermostatCard, string>();

  /**
   * The original thermostat owns the climate commands. A scoped style removes
   * individual card surfaces and bounds the dial without modifying upstream.
   * This depends on the current Material Thermostat Card internal CSS classes.
   */
  private _styleCompactChild(child: MaterialThermostatCard): void {
    const root = child.shadowRoot;
    if (!root || root.querySelector('style[data-ducted-compact]')) return;
    const style = document.createElement('style');
    style.dataset.ductedCompact = '';
    style.textContent = ":host { display: block; min-width: 0; }\nha-card { background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; }\n.header { min-height: 40px !important; }\n.name { font-size: 17px !important; padding: 0 40px !important; }\n.more { width: 40px !important; height: 40px !important; }\n.body { margin-top: 0 !important; }\n.dial-wrap { width: min(100%, var(--ducted-dial-size, clamp(160px, 23cqw, 260px))) !important; margin-inline: auto !important; }\nmt-circular-dial { width: 100%; }";
    root.appendChild(style);
    // Keep the +/- targets usable when the responsive dial becomes small.
    // These selectors are scoped to this embedded dial only.
    const dial = root.querySelector<HTMLElement>('mt-circular-dial');
    if (dial?.shadowRoot && !dial.shadowRoot.querySelector('style[data-ducted-targets]')) {
      const targetStyle = document.createElement('style');
      targetStyle.dataset.ductedTargets = '';
      targetStyle.textContent = '.adjust { width: 48% !important; } .step { width: clamp(34px, 19cqi, 42px) !important; height: clamp(34px, 19cqi, 42px) !important; }';
      dial.shadowRoot.appendChild(targetStyle);
    }
  }

  public setConfig(config: DuctedGridCardConfig): void {
    if (!Array.isArray(config.zones) || config.zones.length === 0) {
      throw new Error('Specify at least one climate zone');
    }
    const entities = config.zones.map((zone) => zone.entity);
    if (entities.some((entity) => typeof entity !== 'string' || !entity.startsWith('climate.'))) {
      throw new Error('Every zone must reference a climate.* entity');
    }
    if (new Set(entities).size !== entities.length) {
      throw new Error('Duplicate zone entities are not supported');
    }
    if (config.columns !== undefined &&
        config.columns !== 'auto' &&
        ![1, 2, 3, 4].includes(config.columns)) {
      throw new Error('columns must be 1, 2, 3, 4 or auto');
    }
    if (config.min_zone_width !== undefined &&
        (!Number.isFinite(config.min_zone_width) || config.min_zone_width < 160 || config.min_zone_width > 800)) {
      throw new Error('min_zone_width must be between 160 and 800');
    }
    if (config.gap !== undefined && (!Number.isFinite(config.gap) || config.gap < 0 || config.gap > 64)) {
      throw new Error('gap must be between 0 and 64');
    }
    if (config.dial_size !== undefined &&
        (!Number.isFinite(config.dial_size) || config.dial_size < 140 || config.dial_size > 320)) {
      throw new Error('dial_size must be between 140 and 320 pixels');
    }
    for (const display of [config.mode_display, config.fan_display]) {
      if (display !== undefined && display !== 'icons' && display !== 'dropdown') {
        throw new Error('mode_display and fan_display must be icons or dropdown');
      }
    }
    if (config.show_master_selector !== undefined && typeof config.show_master_selector !== 'boolean') {
      throw new Error('show_master_selector must be a boolean');
    }
    if (config.zones.some((zone) => zone.master_option !== undefined &&
        (typeof zone.master_option !== 'string' || !zone.master_option.trim()))) {
      throw new Error('master_option must be a non-empty string');
    }
    if (config.system_entity !== undefined && !config.system_entity.startsWith('climate.')) {
      throw new Error('system_entity must reference climate.*');
    }
    if (config.myzone_entity !== undefined && !config.myzone_entity.startsWith('select.')) {
      throw new Error('myzone_entity must reference select.*');
    }
    if (config.control_script !== undefined &&
        (typeof config.control_script !== 'string' || !config.control_script.startsWith('script.'))) {
      throw new Error('control_script must reference script.*');
    }
    if (config.zone_on_script !== undefined &&
        (typeof config.zone_on_script !== 'string' || !config.zone_on_script.startsWith('script.'))) {
      throw new Error('zone_on_script must reference script.*');
    }
    if (config.zone_off_script !== undefined &&
        (typeof config.zone_off_script !== 'string' || !config.zone_off_script.startsWith('script.'))) {
      throw new Error('zone_off_script must reference script.*');
    }
    if ((config.zone_off_script || config.zone_on_script) && config.zones.some((zone) => !zone.master_option)) {
      throw new Error('Every zone needs master_option when a zone script is configured');
    }
    if (config.manual_preset !== undefined && !config.manual_preset.trim()) {
      throw new Error('manual_preset must be non-empty');
    }
    if (config.show_master_selector && !config.myzone_entity) {
      throw new Error('show_master_selector requires myzone_entity');
    }
    this._config = {
      ...config,
      zones: config.zones.map((zone) => ({ ...zone })),
    };
  }

  public getCardSize(): number {
    const count = this._config?.zones.length ?? 1;
    const cols = this._config?.columns === 'auto' ? 2 : (this._config?.columns ?? 2);
    return Math.ceil(count / cols) * 7;
  }

  public getGridOptions(): { columns: number; min_columns: number; rows: 'auto' } {
    return { columns: 12, min_columns: 6, rows: 'auto' };
  }

  protected updated(): void {
    if (!this._config || !this.hass) return;
    const children = this.renderRoot.querySelectorAll<MaterialThermostatCard>('material-thermostat-card');
    children.forEach((child) => {
      const entity = child.dataset.entity;
      const zone = this._config!.zones.find((item) => item.entity === entity);
      if (!zone) return;
      const childConfig: MaterialThermostatCardConfig = {
        type: 'custom:material-thermostat-card',
        entity: zone.entity,
        name: zone.name,
        dial_style: this._config!.dial_style,
        features: [],
      };
      const signature = JSON.stringify(childConfig);
      if (this._applied.get(child) !== signature) {
        child.setConfig(childConfig);
        this._applied.set(child, signature);
      }
      child.style.setProperty('--ducted-dial-size', this._config!.dial_size === undefined
        ? 'clamp(160px, 23cqw, 260px)'
        : `${this._config!.dial_size}px`);
      child.hass = this.hass;
      void child.updateComplete.then(() => {
        this._styleCompactChild(child);
        const systemState = this.hass?.states[this._config?.system_entity ?? '']?.state;
        const zoneState = this.hass?.states[zone.entity]?.state;
        const dial = child.shadowRoot?.querySelector('mt-circular-dial') as
          (HTMLElement & { disabled: boolean }) | null;
        if (dial) dial.disabled = systemState === 'dry' && isZoneActive(zoneState);
      });
    });
  }

  protected render() {
    if (!this._config) return html``;
    const cols = this._config.columns ?? 2;
    const minWidth = this._config.min_zone_width ?? 260;
    const gap = this._config.gap ?? 12;
    const dialSize = this._config.dial_size ?? 260;
    const cellWidth = dialSize + 24;
    const panelWidth = cols === 'auto' ? 1024 : cellWidth * cols + gap * (cols - 1) + 32;
    const columns = cols === 'auto'
      ? `repeat(auto-fit, minmax(min(100%, ${minWidth}px), 1fr))`
      : `repeat(${cols}, minmax(0, 1fr))`;

    return html`<ha-card style=${`max-width: ${panelWidth}px`}>
      ${this._config.system_entity ? html`<mt-myplace-system-controls
        .hass=${this.hass}
        .entity=${this._config.system_entity ?? ''}
        .myzoneEntity=${this._config.myzone_entity ?? ''}
        .manualPreset=${this._config.manual_preset ?? ''}
        .controlScript=${this._config.control_script ?? ''}
        .modeDisplay=${this._config.mode_display ?? 'dropdown'}
        .fanDisplay=${this._config.fan_display ?? 'dropdown'}
      ></mt-myplace-system-controls>` : ''}
      <div class="zones" style=${`grid-template-columns: ${columns}; gap: ${gap}px`}>
      ${this._config.zones.map((zone) => html`
        <div class="zone">
          <material-thermostat-card data-entity=${zone.entity}></material-thermostat-card>
          <mt-myplace-zone-power
            .hass=${this.hass}
            .entity=${zone.entity}
            .masterOption=${zone.master_option ?? ''}
            .label=${zone.name ?? zone.entity}
            .systemEntity=${this._config?.system_entity ?? ''}
            .myzoneEntity=${this._config?.myzone_entity ?? ''}
            .manualPreset=${this._config?.manual_preset ?? ''}
            .zoneOffScript=${this._config?.zone_off_script ?? ''}
            .zoneOnScript=${this._config?.zone_on_script ?? ''}
            .showMasterSelector=${this._config?.show_master_selector ?? false}
          ></mt-myplace-zone-power>
        </div>
      `)}
    </div>
    </ha-card>`;
  }

  static styles = css`
    :host { display: block; container-type: inline-size; }
    ha-card { padding: 16px; box-sizing: border-box; margin-inline: auto; width: 100%; }
    .zones { display: grid; align-items: start; min-width: 0; margin-inline: auto; }
    material-thermostat-card { display: block; min-width: 0; }
    .zone { min-width: 0; display: grid; align-items: start; justify-items: stretch; }
    mt-myplace-zone-power { justify-self: center; }
    @container (max-width: 560px) {
      .zones { grid-template-columns: minmax(0, 1fr) !important; }
    }
  `;
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: DUCTED_CARD_TYPE,
  name: 'Material Ducted Thermostat (experimental)',
  description: 'Grid of independent Material Thermostat dials for ducted zones.',
  preview: false,
});

declare global {
  interface HTMLElementTagNameMap {
    'material-ducted-thermostat-card': MaterialDuctedThermostatCard;
  }
}
