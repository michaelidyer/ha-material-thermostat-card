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
    const children = [...card.shadowRoot!.querySelectorAll('material-thermostat-card')] as any[];
    await Promise.all(children.map((child) => child.updateComplete));
    expect(children).to.have.length(4);
    for (const child of children) {
      expect(child.style.getPropertyValue('--ducted-dial-size')).to.equal('176px');
      expect(child.shadowRoot.querySelectorAll('style[data-ducted-compact]')).to.have.length(1);
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

});
