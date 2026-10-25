// Prices the reference plans and a sample BOQ for the paper tables.
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'docs', 'app', 'js', 'engine.js'));
const arche = E.ARCHETYPES.map(a => {
  const q = E.quote(Object.assign({ province: 'Albay', year: 2025 }, a));
  const s = q.tiers.standard;
  return { id: a.id, kind: a.kind, name: a.name, start: q.start, fair: q.fair, ceiling: q.ceiling,
           unit: s.metrics.unit, perUnit: s.perUnit, length: s.metrics.length || null, quantities: s.quantities, save: q.savingsVsStandard };
});
const sample = E.quote(Object.assign({ province: 'Albay', year: 2025 }, E.ARCHETYPES.find(a => a.id === 'sb-2s4c')));
const bsample = E.quote(Object.assign({ province: 'Albay', year: 2025 }, E.ARCHETYPES.find(a => a.id === 'rcdg-60')));
const pick = q => ({ boq: q.tiers.standard.boq, abc: q.tiers.standard.abc, groups: q.tiers.standard.groups, lean: q.tiers.lean.abc, ceil: q.tiers.ceiling.abc });
console.log(JSON.stringify({ arche, sample: pick(sample), bsample: pick(bsample), priceBook: E.PRICE_BOOK, indirect: E.INDIRECT_TABLE, standards: E.STANDARDS }));
