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
}

/**
 * Composes unmodified Material Thermostat Card instances.
 * Each instance retains its own temperature debounce, optimistic target and
 * service call binding, avoiding cross-zone setpoint contamination.
 *
 * This first milestone intentionally does NOT implement MyZone/zone power
 * commands. Existing climate.set_temperature behavior remains unchanged.
 */
@customElement(DUCTED_CARD_TYPE)
export class MaterialDuctedThermostatCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private _config?: DuctedGridCardConfig;
  private _applied = new WeakMap<MaterialThermostatCard, string>();

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
      child.hass = this.hass;
    });
  }

  protected render() {
    if (!this._config) return html``;
    const cols = this._config.columns ?? 2;
    const minWidth = this._config.min_zone_width ?? 260;
    const gap = this._config.gap ?? 12;
    const columns = cols === 'auto'
      ? `repeat(auto-fit, minmax(min(100%, ${minWidth}px), 1fr))`
      : `repeat(${cols}, minmax(0, 1fr))`;

    return html`<div class="zones" style=${`grid-template-columns: ${columns}; gap: ${gap}px`}>
      ${this._config.zones.map((zone) => html`
        <material-thermostat-card data-entity=${zone.entity}></material-thermostat-card>
      `)}
    </div>`;
  }

  static styles = css`
    :host { display: block; }
    .zones { display: grid; align-items: start; min-width: 0; }
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
