import { expect } from '@open-wc/testing';
import '../../src/myplace-controls';
import {
  isZoneActive,
} from '../../src/myplace-controls';
import { makeHass, climateState, entityState } from '../helpers';

describe('MyPlace controls', () => {
  it('maps script labels independently of display names', () => {
    expect(isZoneActive('cool')).to.equal(true);
    expect(isZoneActive('off')).to.equal(false);
    expect(isZoneActive('unavailable')).to.equal(false);
    expect(isZoneActive(undefined)).to.equal(false);
  });

  it('routes HVAC commands through native climate services, not local scripts', async () => {
    const el = document.createElement('mt-myplace-system-controls');
    el.entity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.entity = 'climate.ac';
    el.hass = makeHass({ 'climate.ac': climateState({}, 'cool') });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      const mode = el.shadowRoot!.querySelector('select[aria-label="Ducted HVAC mode"]') as HTMLSelectElement;
      mode.value = 'heat';
      mode.dispatchEvent(new Event('change'));
      await el.updateComplete;
      expect(el.hass.__calls[0]).to.deep.equal({
        domain: 'climate', service: 'set_hvac_mode',
        data: { entity_id: 'climate.ac', hvac_mode: 'heat' }, target: undefined,
      });
    } finally { el.remove(); }
  });

  it('renders controller selectors from the climate entity state', async () => {
    const el = document.createElement('mt-myplace-system-controls');
    el.entity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.hass = makeHass({
      'climate.ac': climateState({ fan_mode: 'auto', preset_mode: 'MyZone', preset_modes: ['MyZone', 'MyTemp', 'MyAuto'] }, 'cool'),
      'select.ac_myzone': entityState('select.ac_myzone', 'Master'),
    });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      const selects = el.shadowRoot!.querySelectorAll('select');
      expect(selects).to.have.length(2);
      expect((selects[0] as HTMLSelectElement).value).to.equal('cool');
      expect((selects[1] as HTMLSelectElement).value).to.equal('auto');
      expect(el.shadowRoot!.textContent).to.contain('MyZone: Master');
      expect([...selects[0].options].map((x) => x.value)).not.to.include('off');
    } finally {
      el.remove();
    }
  });

  it('allows closing the current MyZone and leaves handover to MyPlace', async () => {
    const el = document.createElement('mt-myplace-zone-power');
    el.systemEntity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.entity = 'climate.ac_guest';
    el.masterOption = 'Guest';
    el.label = 'Guest';
    el.hass = makeHass({
      'climate.ac_guest': climateState({}, 'cool'),
      'climate.ac': climateState({ preset_mode: 'MyZone' }, 'dry'),
      'select.ac_myzone': entityState('select.ac_myzone', 'Guest'),
    });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      const button = el.shadowRoot!.querySelector('button')!;
      expect(button.getAttribute('aria-pressed')).to.equal('true');
      expect(el.shadowRoot!.textContent).to.contain('Setpoint disabled in Dry');
      expect(el.shadowRoot!.textContent).to.contain('MyZone');
      button.click();
      await el.updateComplete;
      expect(el.hass.__calls[0]).to.deep.equal({
        domain: 'climate', service: 'turn_off',
        data: { entity_id: 'climate.ac_guest' }, target: undefined,
      });
    } finally {
      el.remove();
    }
  });
  it('renders mode icon buttons and fan dropdown independently', async () => {
    const el = document.createElement('mt-myplace-system-controls');
    el.entity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.modeDisplay = 'icons';
    el.fanDisplay = 'dropdown';
    el.hass = makeHass({ 'climate.ac': climateState({ fan_mode: 'auto' }, 'cool') });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      const buttons = el.shadowRoot!.querySelectorAll('button.choice');
      expect(buttons.length).to.equal(6);
      expect(el.shadowRoot!.querySelectorAll('select')).to.have.length(1);
      const cool = el.shadowRoot!.querySelector('button[aria-label="Mode: cool"]')!;
      expect(cool.getAttribute('aria-pressed')).to.equal('true');
      (el.shadowRoot!.querySelector('button[aria-label="Mode: heat"]') as HTMLButtonElement).click();
      await el.updateComplete;
      expect(el.hass.__calls[0].service).to.equal('set_hvac_mode');
      expect(el.hass.__calls[0].data).to.deep.equal({entity_id: 'climate.ac', hvac_mode: 'heat'});
    } finally { el.remove(); }
  });

  it('renders fan speed icon buttons using the same script command', async () => {
    const el = document.createElement('mt-myplace-system-controls');
    el.entity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.modeDisplay = 'dropdown';
    el.fanDisplay = 'icons';
    el.hass = makeHass({ 'climate.ac': climateState({ fan_mode: 'auto' }, 'cool') });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      expect(el.shadowRoot!.querySelectorAll('select')).to.have.length(1);
      const high = el.shadowRoot!.querySelector('button[aria-label="Fan: high"]') as HTMLButtonElement;
      high.click();
      await el.updateComplete;
      expect(el.hass.__calls[0].data).to.deep.equal({entity_id: 'climate.ac', fan_mode: 'high'});
    } finally { el.remove(); }
  });

  it('offers an optional crown to select an enabled zone as MyZone', async () => {
    const el = document.createElement('mt-myplace-zone-power');
    el.systemEntity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.showMasterSelector = true;
    el.entity = 'climate.ac_guest';
    el.masterOption = 'Guest';
    el.label = 'Guest';
    el.hass = makeHass({
      'climate.ac_guest': climateState({}, 'heat_cool'),
      'climate.ac': climateState({ preset_mode: 'MyZone' }, 'cool'),
      'select.ac_myzone': entityState('select.ac_myzone', 'Master', {options: ['Guest', 'Master']}),
    });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      const actions = el.shadowRoot!.querySelector('.zone-actions') as HTMLElement;
      expect(actions).to.exist;
      expect(actions.querySelectorAll('button')).to.have.length(2);
      const layout = getComputedStyle(actions);
      expect(layout.display).to.equal('grid');
      expect(layout.gridTemplateColumns).to.equal('100px 44px');
      const [power, crownButton] = [...actions.querySelectorAll('button')];
      expect(power.getBoundingClientRect().top).to.equal(crownButton.getBoundingClientRect().top);
      const crown = actions.querySelector('button.master') as HTMLButtonElement;
      expect(crown.disabled).to.equal(false);
      expect(crown.getAttribute('aria-pressed')).to.equal('false');
      crown.click();
      await el.updateComplete;
      expect(el.hass.__calls[0]).to.deep.equal({
        domain: 'select', service: 'select_option',
        data: {entity_id: 'select.ac_myzone', option: 'Guest'}, target: undefined,
      });
      el.hass = makeHass({
        'climate.ac_guest': climateState({}, 'heat_cool'),
        'climate.ac': climateState({ preset_mode: 'MyZone' }, 'cool'),
        'select.ac_myzone': entityState('select.ac_myzone', 'Guest', {options: ['Guest', 'Master']}),
      });
      await el.updateComplete;
      const marked = el.shadowRoot!.querySelector('button.master') as HTMLButtonElement;
      expect(marked.getAttribute('aria-pressed')).to.equal('true');
      expect(marked.disabled).to.equal(true);
    } finally { el.remove(); }
  });

  it('disables the MyZone selector when zone is off or not in controller options', async () => {
    const el = document.createElement('mt-myplace-zone-power');
    el.systemEntity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.showMasterSelector = true;
    el.entity = 'climate.ac_guest';
    el.masterOption = 'Guest';
    el.hass = makeHass({
      'climate.ac_guest': climateState({}, 'off'),
      'climate.ac': climateState({ preset_mode: 'MyZone' }, 'cool'),
      'select.ac_myzone': entityState('select.ac_myzone', 'Master', {options: ['Guest', 'Master']}),
    });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      expect((el.shadowRoot!.querySelector('button.master') as HTMLButtonElement).disabled).to.equal(true);
      el.hass = makeHass({
        'climate.ac_guest': climateState({}, 'heat_cool'),
        'climate.ac': climateState({ preset_mode: 'MyZone' }, 'cool'),
        'select.ac_myzone': entityState('select.ac_myzone', 'Master', {options: ['Master']}),
      });
      await el.updateComplete;
      expect((el.shadowRoot!.querySelector('button.master') as HTMLButtonElement).disabled).to.equal(true);
    } finally { el.remove(); }
  });

  it('switches zones directly without calling handover scripts', async () => {
    const el = document.createElement('mt-myplace-zone-power');
    el.systemEntity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.entity = 'climate.ac_guest';
    el.masterOption = 'Guest';
    el.hass = makeHass({
      'climate.ac_guest': climateState({}, 'heat_cool'),
      'climate.ac': climateState({ preset_mode: 'MyZone' }, 'cool'),
      'select.ac_myzone': entityState('select.ac_myzone', 'Master', {options: ['Guest', 'Master']}),
    });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      (el.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
      await el.updateComplete;
      expect(el.hass.__calls[0]).to.deep.equal({
        domain: 'climate', service: 'turn_off',
        data: { entity_id: 'climate.ac_guest' }, target: undefined,
      });
      el.hass = makeHass({
        'climate.ac_guest': climateState({}, 'off'),
        'climate.ac': climateState({ preset_mode: 'MyZone' }, 'cool'),
        'select.ac_myzone': entityState('select.ac_myzone', 'Master', {options: ['Guest', 'Master']}),
      });
      await el.updateComplete;
      (el.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
      await el.updateComplete;
      expect(el.hass.__calls[0].service).to.equal('turn_on');
    } finally { el.remove(); }
  });

  it('uses the configured zone-off script and leaves zone-on as native climate', async () => {
    const el = document.createElement('mt-myplace-zone-power');
    el.systemEntity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.entity = 'climate.ac_guest';
    el.masterOption = 'Guest';
    el.zoneOffScript = 'script.ducted_ac_zone_off';
    el.hass = makeHass({
      'climate.ac_guest': climateState({}, 'cool'),
      'climate.ac': climateState({ preset_mode: 'MyZone' }, 'cool'),
      'select.ac_myzone': entityState('select.ac_myzone', 'Guest'),
    });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      (el.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
      await el.updateComplete;
      expect(el.hass.__calls[0]).to.deep.equal({
        domain: 'script', service: 'turn_on',
        data: { entity_id: 'script.ducted_ac_zone_off',
          variables: { zone: 'Guest', zone_entity: 'climate.ac_guest' } },
        target: undefined,
      });
      el.hass = makeHass({
        'climate.ac_guest': climateState({}, 'off'),
        'climate.ac': climateState({ preset_mode: 'MyZone' }, 'cool'),
      });
      await el.updateComplete;
      (el.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
      await el.updateComplete;
      expect(el.hass.__calls[0].service).to.equal('turn_on');
      expect(el.hass.__calls[0].domain).to.equal('climate');
    } finally { el.remove(); }
  });

  it('does not allow manual controls while preset is MyTemp or MyAuto', async () => {
    const el = document.createElement('mt-myplace-zone-power');
    el.systemEntity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.entity = 'climate.ac_guest';
    el.masterOption = 'Guest';
    el.showMasterSelector = true;
    el.hass = makeHass({
      'climate.ac_guest': climateState({}, 'heat_cool'),
      'climate.ac': climateState({ preset_mode: 'MyTemp' }, 'cool'),
      'select.ac_myzone': entityState('select.ac_myzone', 'Master', {options: ['Guest', 'Master']}),
    });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      expect((el.shadowRoot!.querySelector('button.master') as HTMLButtonElement).disabled).to.equal(true);
      expect((el.shadowRoot!.querySelector('button:not(.master)') as HTMLButtonElement).disabled).to.equal(true);
    } finally { el.remove(); }
  });

  it('offers an explicit switch back to manual MyZone without changing mode automatically', async () => {
    const el = document.createElement('mt-myplace-system-controls');
    el.entity = 'climate.ac';
    el.myzoneEntity = 'select.ac_myzone';
    el.manualPreset = 'MyZone';
    el.hass = makeHass({
      'climate.ac': climateState({ preset_mode: 'MyTemp',
        preset_modes: ['MyZone', 'MyTemp', 'MyAuto'] }, 'cool'),
    });
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      expect(el.shadowRoot!.textContent).to.contain('Controller is not in MyZone mode');
      (el.shadowRoot!.querySelector('button.manual-button') as HTMLButtonElement).click();
      await el.updateComplete;
      expect(el.hass.__calls[0]).to.deep.equal({
        domain: 'climate', service: 'set_preset_mode',
        data: { entity_id: 'climate.ac', preset_mode: 'MyZone' }, target: undefined,
      });
    } finally { el.remove(); }
  });

});
