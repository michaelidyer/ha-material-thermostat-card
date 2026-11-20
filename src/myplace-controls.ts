import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';

export function isZoneActive(state?: string): boolean {
  return state !== undefined && !['off', 'unavailable', 'unknown'].includes(state);
}

export type SelectorDisplay = 'icons' | 'dropdown';

const HVAC_ICONS: Record<string, string> = {
  cool: 'mdi:snowflake', heat: 'mdi:fire', dry: 'mdi:water-percent', fan_only: 'mdi:fan',
};

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
  .choice-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 6px; }
  .choice { min-width: 0; min-height: 54px; display: flex; flex-direction: column;
    justify-content: center; align-items: center; gap: 3px; padding: 6px 3px;
    border: 1px solid var(--divider-color, #7775); border-radius: 12px;
    color: var(--primary-text-color); background: transparent; cursor: pointer; font: inherit; }
  .choice ha-icon { --mdc-icon-size: 22px; }
  .choice span { font-size: 11px; text-transform: capitalize; }
  .choice[aria-pressed="true"] { color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 15%, transparent);
    border-color: var(--primary-color); }
  .choice:disabled { opacity: .5; cursor: not-allowed; }
  .icon-controls { grid-column: 1 / -1; }
  @container (max-width: 350px) { .choice-row { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .myzone { grid-column: 1 / -1; font-size: 12px; opacity: .8; }
  .preset-warning { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
  .manual-button { min-height: 40px; border-radius: 9px; padding: 7px 12px; border: 1px solid var(--primary-color); color: var(--primary-text-color); background: transparent; cursor: pointer; }
  .manual-button:disabled { opacity: .5; }
  .error { grid-column: 1 / -1; color: var(--error-color, #cf6679); font-size: 12px; }
`;

@customElement('mt-myplace-system-controls')
export class MtMyplaceSystemControls extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @property() entity = '';
  @property() myzoneEntity = '';
  @property() manualPreset = '';
  /** Optional script for controller mode/fan commands (e.g. dump-zone handling). */
  @property() controlScript = '';
  @property() modeDisplay: SelectorDisplay = 'dropdown';
  @property() fanDisplay: SelectorDisplay = 'dropdown';
  @state() private busy = false;
  @state() private error = '';

  /** Both button and dropdown presentations use the same configurable service path. */
  private async chooseValue(value: string, operation: 'mode' | 'fan'): Promise<void> {
    if (this.busy) return;
    const system = this.hass?.states[this.entity];
    const allowed = operation === 'mode'
      ? (system?.attributes.hvac_modes as string[] | undefined) ?? []
      : (system?.attributes.fan_modes as string[] | undefined) ?? [];
    if (!allowed.includes(value)) return;
    this.busy = true;
    this.error = '';
    try {
      if (this.controlScript) {
        await this.hass.callService('script', this.controlScript.slice('script.'.length),
          { operation, value });
      } else {
        await this.hass.callService('climate', operation === 'mode' ? 'set_hvac_mode' : 'set_fan_mode',
          operation === 'mode' ? { entity_id: this.entity, hvac_mode: value }
            : { entity_id: this.entity, fan_mode: value });
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
    }
  }

  /** Manual mode is user-selected, never silently forced on state refresh. */
  private async selectManualPreset(): Promise<void> {
    if (this.busy) return;
    const system = this.hass?.states[this.entity];
    if (!this.manualPreset || !((system?.attributes.preset_modes as string[] | undefined) ?? []).includes(this.manualPreset)) return;
    this.busy = true;
    this.error = '';
    try {
      await this.hass.callService('climate', 'set_preset_mode', {
        entity_id: this.entity,
        preset_mode: this.manualPreset,
      });
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
    }
  }

  private renderSelector(
    operation: 'mode' | 'fan',
    display: SelectorDisplay,
    values: string[],
    active: string,
    disabled: boolean,
  ) {
    const title = operation === 'mode' ? 'Mode' : 'Fan';
    const labelled = operation === 'mode' ? 'Ducted HVAC mode' : 'Ducted fan speed';
    if (display === 'icons') {
      return html`<div class="icon-controls" role="group" aria-label=${labelled}>
        <label>${title}</label>
        <div class="choice-row">${values.map((value) => html`
          <button type="button" class="choice" aria-label=${`${title}: ${value.replaceAll('_', ' ')}`}
            aria-pressed=${String(value === active)} ?disabled=${disabled}
            @click=${() => void this.chooseValue(value, operation)}>
            <ha-icon icon=${operation === 'mode' ? HVAC_ICONS[value] ?? 'mdi:thermostat' : 'mdi:fan'}></ha-icon>
            <span>${value.replaceAll('_', ' ')}</span>
          </button>`)}</div>
      </div>`;
    }
    return html`<label>${title}
      <select aria-label=${labelled} .value=${values.includes(active) ? active : ''}
        ?disabled=${disabled}
        @change=${(event: Event) => void this.chooseValue((event.currentTarget as HTMLSelectElement).value, operation)}>
        ${!values.includes(active) ? html`<option value="" selected disabled>Off</option>` : ''}
        ${values.map((value) => html`<option value=${value} ?selected=${value === active}>${value.replaceAll('_', ' ')}</option>`)}
      </select>
    </label>`;
  }

  protected render() {
    const state = this.hass?.states[this.entity];
    const mode = state?.state ?? '';
    const fan = String(state?.attributes.fan_mode ?? '');
    const modes = ((state?.attributes.hvac_modes as string[] | undefined) ?? []).filter((x) => x !== 'off');
    const fans = (state?.attributes.fan_modes as string[] | undefined) ?? [];
    const myzone = this.myzoneEntity ? this.hass?.states[this.myzoneEntity]?.state : undefined;
    const preset = state?.attributes.preset_mode;
    const manual = !this.manualPreset || preset === this.manualPreset;
    const supportsManual = !!this.manualPreset && ((state?.attributes.preset_modes as string[] | undefined) ?? []).includes(this.manualPreset);
    const unavailable = !state || mode === 'unavailable' || mode === 'unknown';
    return html`<div class="controls">
      <div class="heading">Ducted AC <span class="status">${mode || 'Unavailable'}</span></div>
      ${this.renderSelector('mode', this.modeDisplay, modes, mode,
        unavailable || this.busy || mode === 'off' || modes.length === 0)}
      ${this.renderSelector('fan', this.fanDisplay, fans, fan,
        unavailable || this.busy || mode === 'off' || fans.length === 0)}
      ${!manual ? html`<div class="preset-warning">Controller is not in ${this.manualPreset} mode.
        <button type="button" class="manual-button" ?disabled=${!supportsManual || this.busy}
          @click=${() => void this.selectManualPreset()}>Use ${this.manualPreset}</button>
      </div>` : ''}
      ${this.myzoneEntity && myzone && !['unknown','unavailable'].includes(myzone)
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
  @property() masterOption = '';
  @property() label = '';
  @property() systemEntity = '';
  @property() myzoneEntity = '';
  @property() manualPreset = '';
  /** Optional Home Assistant script entity called for zone shutdown. */
  @property() zoneOffScript = '';
  @property({ type: Boolean }) showMasterSelector = false;
  @state() private busy = false;
  @state() private error = '';

  private async toggle(): Promise<void> {
    const state = this.hass?.states[this.entity]?.state;
    const preset = this.hass?.states[this.systemEntity]?.attributes.preset_mode;
    if (this.busy || !this.entity || state === undefined ||
        ['unknown', 'unavailable'].includes(state) || (this.manualPreset && preset !== this.manualPreset)) return;
    const on = isZoneActive(state);
    // MyPlace firmware owns any automatic master reassignment on zone closure.
    // Do not duplicate, pre-empt or prevent that behaviour in the card.
    this.busy = true;
    this.error = '';
    try {
      if (on && this.zoneOffScript) {
        // Script receives both entity and MyZone option; the installation
        // decides whether and how to hand over before shutting down.
        // Calling the script service directly waits for execution to finish,
        // keeping the button busy throughout the MyZone handover.
        await this.hass.callService('script', this.zoneOffScript.slice('script.'.length), {
          zone: this.masterOption || this.label,
          zone_entity: this.entity,
        });
      } else {
        await this.hass.callService('climate', on ? 'turn_off' : 'turn_on', {
          entity_id: this.entity,
        });
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
    }
  }

  private async selectMaster(): Promise<void> {
    const zoneState = this.hass?.states[this.entity]?.state;
    const selected = this.myzoneEntity ? this.hass?.states[this.myzoneEntity] : undefined;
    const preset = this.hass?.states[this.systemEntity]?.attributes.preset_mode;
    const options = (selected?.attributes.options as string[] | undefined) ?? [];
    const option = options.find((name) => name.toLowerCase() === this.masterOption.toLowerCase());
    // Only enabled zones present in the select's authoritative options may
    // become MyZone. No guesses about exact option labels.
    if (this.busy || (this.manualPreset && preset !== this.manualPreset) || !isZoneActive(zoneState) || !option || !selected ||
        selected.state === 'unknown' || selected.state === 'unavailable' ||
        selected.state.toLowerCase() === option.toLowerCase()) return;
    this.busy = true;
    this.error = '';
    try {
      await this.hass.callService('select', 'select_option', {
        entity_id: this.myzoneEntity, option,
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
    const selected = this.myzoneEntity ? this.hass?.states[this.myzoneEntity]?.state : undefined;
    const manual = !this.manualPreset || this.hass?.states[this.systemEntity]?.attributes.preset_mode === this.manualPreset;
    const mine = !!this.masterOption && selected?.toLowerCase() === this.masterOption.toLowerCase();
    const availableOptions = (this.myzoneEntity ? this.hass?.states[this.myzoneEntity]?.attributes.options as string[] | undefined : undefined) ?? [];
    const canSelectMaster = manual && on && !unknown && !!this.masterOption && availableOptions.some((name) => name.toLowerCase() === this.masterOption.toLowerCase()) &&
      selected !== 'unavailable' && selected !== 'unknown';
    return html`<div class="zone">
      <div class="zone-actions">
      <button type="button" aria-label=${`${on ? 'Turn off' : 'Turn on'} ${this.label || this.entity}`}
        aria-pressed=${String(on)} ?disabled=${unknown || !manual || this.busy || !this.entity}
        @click=${() => void this.toggle()}><ha-icon icon="mdi:power"></ha-icon>${on ? 'On' : 'Off'}</button>
      ${this.showMasterSelector
        ? html`<button class="master" type="button" aria-label=${`Set ${this.label || this.entity} as master zone`}
            title=${mine ? 'Current MyZone' : 'Make this zone MyZone'}
            aria-pressed=${String(mine)}
            ?disabled=${!canSelectMaster || this.busy || mine}
            @click=${() => void this.selectMaster()}>
            <ha-icon icon="mdi:crown"></ha-icon>
          </button>`
        : mine ? html`<span class="myzone">MyZone</span>` : ''}
      </div>
      ${dry ? html`<span class="dry">Setpoint disabled in Dry</span>` : ''}
      ${this.error ? html`<span class="error" role="alert">${this.error}</span>` : ''}
    </div>`;
  }
  static styles = css`
    :host { display: block; margin-top: 2px; }
    .zone { display: grid; justify-items: center; gap: 5px; }
    .zone-actions { display: grid; grid-template-columns: 100px 44px; grid-auto-flow: column; justify-content: center; align-items: center; column-gap: 8px; width: max-content; max-width: 100%; }
    button {
      border: 1px solid var(--divider-color, #7775); border-radius: 22px;
      background: transparent; color: var(--primary-text-color);
      min-width: 100px; min-height: 44px; padding: 7px 12px;
      display: inline-flex; gap: 6px; justify-content: center; align-items: center;
      cursor: pointer; font: inherit;
    }
    .zone-actions > button:not(.master) { width: 100px; min-width: 100px; box-sizing: border-box; }
    button[aria-pressed="true"] { background: color-mix(in srgb, var(--primary-color) 17%, transparent); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    ha-icon { --mdc-icon-size: 20px; }
    .myzone { color: var(--primary-color); font-size: 12px; }
    .master { min-width: 44px; width: 44px; height: 44px; padding: 0; box-sizing: border-box; }
    .master[aria-pressed="true"] { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); opacity: 1; }
    .master[aria-pressed="true"] ha-icon { --mdc-icon-size: 22px; }
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
