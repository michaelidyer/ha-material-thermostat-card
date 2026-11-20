import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCard } from 'custom-card-helpers';
import type { MaterialThermostatCard } from './material-thermostat-card';
import type { MaterialThermostatCardConfig } from './types';

export const DUCTED_CARD_TYPE = 'material-ducted-thermostat-card';

export interface DuctedZoneConfig {
  entity: string;
  name?: string;
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
}

/**
 * Composes unmodified Material Thermostat Card instances.
 * Each instance retains its own temperature debounce, optimistic target and
 * service call binding, avoiding cross-zone setpoint contamination.
 *
 * This first milestone intentionally does NOT implement MyZone/zone power
 * commands. Existing climate.set_temperature behavior remains unchanged.
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
    style.textContent = ":host { display: block; min-width: 0; }\nha-card { background: transparent !important; background-color: transparent !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; }\n.header { min-height: 28px !important; }\n.name { font-size: 14px !important; padding: 0 28px !important; }\n.more { width: 28px !important; height: 28px !important; }\n.body { margin-top: 0 !important; }\n.dial-wrap { width: min(100%, var(--ducted-dial-size, 180px)) !important; margin-inline: auto !important; }\nmt-circular-dial { width: 100%; }";
    root.appendChild(style);
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
      child.style.setProperty('--ducted-dial-size', `${this._config!.dial_size ?? 180}px`);
      child.hass = this.hass;
      void child.updateComplete.then(() => this._styleCompactChild(child));
    });
  }

  protected render() {
    if (!this._config) return html``;
    const cols = this._config.columns ?? 2;
    const minWidth = this._config.min_zone_width ?? 260;
    const gap = this._config.gap ?? 12;
    const dialSize = this._config.dial_size ?? 180;
    const cellWidth = dialSize + 24;
    const columns = cols === 'auto'
      ? `repeat(auto-fit, minmax(min(100%, ${minWidth}px), 1fr))`
      : `repeat(${cols}, minmax(0, 1fr))`;

    return html`<ha-card>
      <div class="zones" style=${`grid-template-columns: ${columns}; gap: ${gap}px; max-width: ${cols === "auto" ? "none" : cellWidth * cols + gap * (cols - 1) + "px"}`}>
      ${this._config.zones.map((zone) => html`
        <material-thermostat-card data-entity=${zone.entity}></material-thermostat-card>
      `)}
    </div>
    </ha-card>`;
  }

  static styles = css`
    :host { display: block; }
    ha-card { padding: 16px; box-sizing: border-box; }
    .zones { display: grid; align-items: start; min-width: 0; margin-inline: auto; }
    material-thermostat-card { display: block; min-width: 0; }
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
