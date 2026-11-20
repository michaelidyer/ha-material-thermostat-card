import { expect } from '@open-wc/testing';
import '../../src/material-thermostat-card';
import '../../src/material-ducted-thermostat-card';
import type { MaterialDuctedThermostatCard } from '../../src/material-ducted-thermostat-card';
import { makeHass, climateState } from '../helpers';

// Chromium can report a benign ResizeObserver loop while four nested dials
// establish their sizes. The original card's test suite suppresses this exact
// browser warning; keep the same narrowly scoped handling here.
window.addEventListener('error', (event) => {
  if (/ResizeObserver loop/.test(event.message)) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
});

const zones = [
  { entity: 'climate.ac_guest', name: 'Guest' },
  { entity: 'climate.ac_master', name: 'Master' },
  { entity: 'climate.ac_mike_s_den', name: 'Office' },
  { entity: 'climate.ac_will_s_music', name: 'Music' },
];

describe('material-ducted-thermostat-card', () => {
  let card: MaterialDuctedThermostatCard;

  afterEach(() => card?.remove());

  it('validates zones, duplicate entities and column count', () => {
    const el = document.createElement('material-ducted-thermostat-card') as MaterialDuctedThermostatCard;
    expect(() => el.setConfig({ type: 'custom:material-ducted-thermostat-card', zones: [] })).to.throw();
    expect(() => el.setConfig({ type: 'custom:material-ducted-thermostat-card', zones: [zones[0], zones[0]] })).to.throw();
    expect(() => el.setConfig({ type: 'custom:material-ducted-thermostat-card', zones, columns: 5 as any })).to.throw();
  });

  it('renders four independent thermostat instances in a two-column grid', async () => {
    card = document.createElement('material-ducted-thermostat-card') as MaterialDuctedThermostatCard;
    card.setConfig({ type: 'custom:material-ducted-thermostat-card', zones, columns: 2 });
    card.hass = makeHass(Object.fromEntries(zones.map((z) => [z.entity, {
      ...climateState(), entity_id: z.entity,
    }])));
    document.body.appendChild(card);
    await card.updateComplete;
    const grid = card.shadowRoot!.querySelector('.zones') as HTMLElement;
    expect(grid.style.gridTemplateColumns).to.equal('repeat(2, minmax(0px, 1fr))');
    const children = [...card.shadowRoot!.querySelectorAll('material-thermostat-card')] as any[];
    expect(children).to.have.length(4);
    expect(children.map((child) => child._config.entity)).to.deep.equal(zones.map((z) => z.entity));
    expect(children.map((child) => child._config.name)).to.deep.equal(zones.map((z) => z.name));
    expect(new Set(children)).to.have.property('size', 4);
  });

  it('supports a one-column layout and auto columns', async () => {
    card = document.createElement('material-ducted-thermostat-card') as MaterialDuctedThermostatCard;
    card.setConfig({ type: 'custom:material-ducted-thermostat-card', zones, columns: 1 });
    card.hass = makeHass({});
    document.body.appendChild(card);
    await card.updateComplete;
    const grid = card.shadowRoot!.querySelector('.zones') as HTMLElement;
    expect(grid.style.gridTemplateColumns).to.equal('repeat(1, minmax(0px, 1fr))');
    card.setConfig({ type: 'custom:material-ducted-thermostat-card', zones, columns: 'auto', min_zone_width: 210 });
    await card.updateComplete;
    expect(grid.style.gridTemplateColumns).to.contain('auto-fit');
  });
  it('uses a single parent surface and scales embedded dials without changing the original card', async () => {
    card = document.createElement('material-ducted-thermostat-card') as MaterialDuctedThermostatCard;
    card.setConfig({ type: 'custom:material-ducted-thermostat-card', zones, columns: 2, dial_size: 176 });
    card.hass = makeHass(Object.fromEntries(zones.map((z) => [z.entity, {
      ...climateState(), entity_id: z.entity,
    }])));
    document.body.appendChild(card);
    await card.updateComplete;
    expect(card.shadowRoot!.querySelectorAll('ha-card')).to.have.length(1);
    const panel = card.shadowRoot!.querySelector('ha-card') as HTMLElement;
    expect(panel.style.maxWidth).to.equal('444px');
    const children = [...card.shadowRoot!.querySelectorAll('material-thermostat-card')] as any[];
    await Promise.all(children.map((child) => child.updateComplete));
    expect(children).to.have.length(4);
    for (const child of children) {
      expect(child.style.getPropertyValue('--ducted-dial-size')).to.equal('176px');
      expect(child.shadowRoot.querySelectorAll('style[data-ducted-compact]')).to.have.length(1);
      const dial = child.shadowRoot.querySelector('mt-circular-dial');
      expect(dial.shadowRoot.querySelectorAll('style[data-ducted-targets]')).to.have.length(1);
    }
    // Repeat a hass update: style injection should remain idempotent.
    card.hass = makeHass(card.hass.states);
    await card.updateComplete;
    await Promise.all(children.map((child) => child.updateComplete));
    for (const child of children) {
      expect(child.shadowRoot.querySelectorAll('style[data-ducted-compact]')).to.have.length(1);
    }
  });

  it('rejects invalid dial sizes', () => {
    const el = document.createElement('material-ducted-thermostat-card') as MaterialDuctedThermostatCard;
    expect(() => el.setConfig({
      type: 'custom:material-ducted-thermostat-card', zones, dial_size: 100,
    })).to.throw('dial_size must be between');
  });


  it('defaults to responsive sizing and a bounded panel for fixed columns', async () => {
    card = document.createElement('material-ducted-thermostat-card') as MaterialDuctedThermostatCard;
    card.setConfig({ type: 'custom:material-ducted-thermostat-card', zones, columns: 2 });
    card.hass = makeHass(Object.fromEntries(zones.map((z) => [z.entity, {
      ...climateState(), entity_id: z.entity,
    }])));
    document.body.appendChild(card);
    await card.updateComplete;
    const panel = card.shadowRoot!.querySelector('ha-card') as HTMLElement;
    expect(panel.style.maxWidth).to.equal('612px');
    const children = [...card.shadowRoot!.querySelectorAll('material-thermostat-card')] as any[];
    expect(children[0].style.getPropertyValue('--ducted-dial-size'))
      .to.equal('clamp(160px, 23cqw, 260px)');
  });

  it('keeps active zone setpoint dials disabled during system Dry mode', async () => {
    card = document.createElement('material-ducted-thermostat-card') as MaterialDuctedThermostatCard;
    card.setConfig({ type: 'custom:material-ducted-thermostat-card', zones, columns: 2, system_entity: 'climate.ac' });
    card.hass = makeHass({
      'climate.ac': climateState({}, 'dry'),
      'climate.ac_guest': climateState({}, 'cool'),
      'climate.ac_master': climateState({}, 'off'),
      'climate.ac_mike_s_den': climateState({}, 'off'),
      'climate.ac_will_s_music': climateState({}, 'off'),
    });
    document.body.appendChild(card);
    await card.updateComplete;
    const children = [...card.shadowRoot!.querySelectorAll('material-thermostat-card')] as any[];
    await Promise.all(children.map((child) => child.updateComplete));
    await Promise.resolve();
    expect(children[0].shadowRoot.querySelector('mt-circular-dial').disabled).to.equal(true);
    expect(children[1].shadowRoot.querySelector('mt-circular-dial').disabled).to.equal(false);
    card.hass = makeHass({
      ...card.hass.states,
      'climate.ac': climateState({}, 'cool'),
    });
    await card.updateComplete;
    await Promise.all(children.map((child) => child.updateComplete));
    await Promise.resolve();
    expect(children[0].shadowRoot.querySelector('mt-circular-dial').disabled).to.equal(false);
  });

});
