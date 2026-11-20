import { expect } from '@open-wc/testing';
import '../../src/myplace-controls';
import {
  isZoneActive,
  MYPLACE_ZONE_NAMES,
  myplaceScript,
} from '../../src/myplace-controls';
import { makeHass, climateState, entityState } from '../helpers';

describe('MyPlace controls', () => {
  it('maps script labels independently of display names', () => {
    expect(MYPLACE_ZONE_NAMES['climate.ac_mike_s_den']).to.equal("Mike's Den");
    expect(isZoneActive('cool')).to.equal(true);
    expect(isZoneActive('off')).to.equal(false);
    expect(isZoneActive('unavailable')).to.equal(false);
    expect(isZoneActive(undefined)).to.equal(false);
  });

  it('routes a mode command through the existing ducted control script', async () => {
    const hass = makeHass({});
    await myplaceScript(hass, 'ducted_ac_control', { operation: 'mode', value: 'cool' });
    expect(hass.__calls[0]).to.deep.equal({
      domain: 'script', service: 'ducted_ac_control',
      data: { operation: 'mode', value: 'cool' }, target: undefined,
    });
  });

  it('routes zone power to the existing scripts with the correct zone name', async () => {
    const hass = makeHass({});
    await myplaceScript(hass, 'ducted_ac_zone_off', { zone: "Will's Music" });
    expect(hass.__calls[0].data).to.deep.equal({ zone: "Will's Music" });
  });

  it('renders controller selectors from the climate entity state', async () => {
    const el = document.createElement('mt-myplace-system-controls');
    el.hass = makeHass({
      'climate.ac': climateState({ fan_mode: 'auto' }, 'cool'),
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

  it('shows the Dry guard and active zone power state', async () => {
    const el = document.createElement('mt-myplace-zone-power');
    el.entity = 'climate.ac_guest';
    el.scriptZone = 'Guest';
    el.label = 'Guest';
    el.hass = makeHass({
      'climate.ac_guest': climateState({}, 'cool'),
      'climate.ac': climateState({}, 'dry'),
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
      expect(el.hass.__calls[0].service).to.equal('ducted_ac_zone_off');
      expect(el.hass.__calls[0].data).to.deep.equal({ zone: 'Guest' });
    } finally {
      el.remove();
    }
  });
});
