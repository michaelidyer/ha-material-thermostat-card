import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';

export const MYPLACE_ZONE_NAMES: Record<string, string> = {
  'climate.ac_guest': 'Guest',
  'climate.ac_master': 'Master',
  'climate.ac_mike_s_den': "Mike's Den",
  'climate.ac_will_s_music': "Will's Music",
};

/**
 * These functions intentionally call existing HA scripts, not native climate
 * services. Zone handover and last-zone logic remain in the proven scripts.
 */
export async function myplaceScript(
  hass: HomeAssistant,
  service: 'ducted_ac_control' | 'ducted_ac_zone_on' | 'ducted_ac_zone_off',
  data: Record<string, string>,
): Promise<void> {
  await hass.callService('script', service, data);
}

export function isZoneActive(state?: string): boolean {
  return state !== undefined && !['off', 'unavailable', 'unknown'].includes(state);
}

const controlStyles = css`
  :host { display: block; }
  .controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; margin-bottom: 14px; }
  .heading { grid-column: 1 / -1; display: flex; justify-content: space-between; font-weight: 600; }
  .status { font-size: 12px; font-weight: 400; opacity: .75; text-transform: capitalize; }
  label { display: grid; gap: 5px; font-size: 13px; }
  select {
    width: 100%; box-sizing: border-box; min-height: 44px;
    padding: 8px 10px; border-radius: 10px;
    color: var(--primary-text-color); background: var(--card-background-color, var(--ha-card-background, #292929));
    border: 1px solid var(--divider-color, #7775);
    font: inherit; text-transform: capitalize;
  }
  select:disabled { opacity: .5; }
  .myzone { grid-column: 1 / -1; font-size: 12px; opacity: .8; }
  .error { grid-column: 1 / -1; color: var(--error-color, #cf6679); font-size: 12px; }
`;

@customElement('mt-myplace-system-controls')
export class MtMyplaceSystemControls extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @property() entity = 'climate.ac';
  @property() myzoneEntity = 'select.ac_myzone';
  @state() private busy = false;
  @state() private error = '';

  private async choose(event: Event, operation: 'mode' | 'fan'): Promise<void> {
    if (this.busy) return;
    const select = event.currentTarget as HTMLSelectElement;
    const value = select.value;
    const system = this.hass?.states[this.entity];
    const allowed = operation === 'mode'
      ? (system?.attributes.hvac_modes as string[] | undefined) ?? []
      : (system?.attributes.fan_modes as string[] | undefined) ?? [];
    // The existing control script has no verified 'off' operation.
    if (!allowed.includes(value) ||
        (operation === 'mode' && !['cool', 'heat', 'dry', 'fan_only'].includes(value))) return;
    this.busy = true;
    this.error = '';
    try {
      await myplaceScript(this.hass, 'ducted_ac_control', { operation, value });
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
    }
  }

  protected render() {
    const state = this.hass?.states[this.entity];
    const mode = state?.state ?? '';
    const fan = String(state?.attributes.fan_mode ?? '');
    const modes = ((state?.attributes.hvac_modes as string[] | undefined) ?? [])
      .filter((x) => ['cool', 'heat', 'dry', 'fan_only'].includes(x));
    const fans = (state?.attributes.fan_modes as string[] | undefined) ?? [];
    const myzone = this.hass?.states[this.myzoneEntity]?.state;
    const unavailable = !state || mode === 'unavailable' || mode === 'unknown';
    return html`<div class="controls">
      <div class="heading">Ducted AC <span class="status">${mode || 'Unavailable'}</span></div>
      <label>Mode
        <select aria-label="Ducted HVAC mode" .value=${modes.includes(mode) ? mode : ''}
          ?disabled=${unavailable || this.busy || mode === 'off' || modes.length === 0}
          @change=${(e: Event) => void this.choose(e, 'mode')}>
          ${!modes.includes(mode) ? html`<option value="" selected disabled>Off</option>` : ''}
          ${modes.map((x) => html`<option value=${x} ?selected=${x === mode}>${x.replaceAll('_', ' ')}</option>`)}
        </select>
      </label>
      <label>Fan
        <select aria-label="Ducted fan speed" .value=${fan}
          ?disabled=${unavailable || this.busy || mode === 'off' || fans.length === 0}
          @change=${(e: Event) => void this.choose(e, 'fan')}>
          ${fans.map((x) => html`<option value=${x} ?selected=${x === fan}>${x}</option>`)}
        </select>
      </label>
      ${myzone && !['unknown','unavailable'].includes(myzone)
        ? html`<div class="myzone">MyZone: ${myzone}</div>` : ''}
      ${this.error ? html`<div role="alert" class="error">${this.error}</div>` : ''}
    </div>`;
  }
  static styles = controlStyles;
}

@customElement('mt-myplace-zone-power')
export class MtMyplaceZonePower extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @property() entity = '';
  @property() scriptZone = '';
  @property() label = '';
  @property() systemEntity = 'climate.ac';
  @property() myzoneEntity = 'select.ac_myzone';
  @state() private busy = false;
  @state() private error = '';

  private async toggle(): Promise<void> {
    const state = this.hass?.states[this.entity]?.state;
    if (this.busy || !this.scriptZone || state === undefined || ['unknown', 'unavailable'].includes(state)) return;
    this.busy = true;
    this.error = '';
    try {
      await myplaceScript(this.hass, isZoneActive(state) ? 'ducted_ac_zone_off' : 'ducted_ac_zone_on', {
        zone: this.scriptZone,
      });
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
    }
  }

  protected render() {
    const state = this.hass?.states[this.entity]?.state;
    const on = isZoneActive(state);
    const unknown = state === undefined || state === 'unknown' || state === 'unavailable';
    const dry = this.hass?.states[this.systemEntity]?.state === 'dry' && on;
    const selected = this.hass?.states[this.myzoneEntity]?.state;
    const mine = selected?.toLowerCase() === this.scriptZone.toLowerCase();
    return html`<div class="zone">
      <button type="button" aria-label=${`${on ? 'Turn off' : 'Turn on'} ${this.label || this.scriptZone}`}
        aria-pressed=${String(on)} ?disabled=${unknown || this.busy || !this.scriptZone}
        @click=${() => void this.toggle()}><ha-icon icon="mdi:power"></ha-icon>${on ? 'On' : 'Off'}</button>
      ${mine ? html`<span class="myzone">MyZone</span>` : ''}
      ${dry ? html`<span class="dry">Setpoint disabled in Dry</span>` : ''}
      ${this.error ? html`<span class="error" role="alert">${this.error}</span>` : ''}
    </div>`;
  }
  static styles = css`
    :host { display: block; margin-top: 2px; }
    .zone { display: grid; justify-items: center; gap: 5px; }
    button {
      border: 1px solid var(--divider-color, #7775); border-radius: 22px;
      background: transparent; color: var(--primary-text-color);
      min-width: 100px; min-height: 44px; padding: 7px 12px;
      display: inline-flex; gap: 6px; justify-content: center; align-items: center;
      cursor: pointer; font: inherit;
    }
    button[aria-pressed="true"] { background: color-mix(in srgb, var(--primary-color) 17%, transparent); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    ha-icon { --mdc-icon-size: 20px; }
    .myzone { color: var(--primary-color); font-size: 12px; }
    .dry { font-size: 12px; opacity: .75; }
    .error { color: var(--error-color, #cf6679); font-size: 12px; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'mt-myplace-system-controls': MtMyplaceSystemControls;
    'mt-myplace-zone-power': MtMyplaceZonePower;
  }
}
