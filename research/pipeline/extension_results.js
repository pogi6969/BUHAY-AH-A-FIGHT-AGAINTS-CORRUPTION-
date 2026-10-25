// Extension study: hospitals, airport / seaport / land transport terminals, airfield pavements and port structures.
// 1) prices the extension templates and checks their space standards,
// 2) runs budget-to-design for the new usages,
// 3) builds SBD-EXT, a 180-project simulated benchmark with hidden variation and injected overpricing
//    (same generator settings as SBD-300), and measures quotation accuracy and standards-based detection.
// Usage: node research/pipeline/extension_results.js  -> research/outputs/extension_results.json, research/figures/svg/*.svg
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'docs', 'app', 'js', 'engine.js'));
const D = require(path.join(ROOT, 'docs', 'app', 'js', 'designs.js'));

// deterministic random numbers (mulberry32) and the distributions used by simulate.py
let seed = 2026;
function rand() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function unif(a, b) { return a + (b - a) * rand(); }
function normal(m, s) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function pick(list, w) { const r = rand() * (w ? w.reduce((a, b) => a + b, 0) : list.length); let c = 0; for (let i = 0; i < list.length; i++) { c += w ? w[i] : 1; if (r < c) return list[i]; } return list[list.length - 1]; }
function step(a, b, s) { return a + s * Math.floor(rand() * (Math.floor((b - a) / s) + 1)); }

const PROVINCES = ['Albay', 'Camarines Sur', 'Camarines Norte', 'Sorsogon', 'Masbate', 'Catanduanes'];
const PROV_W = [0.24, 0.30, 0.12, 0.14, 0.12, 0.08];
const YEARS = [2022, 2023, 2024, 2025];

function hidden(kind) {
  const price = {};
  ['concrete', 'rebar', 'formwork', 'earth', 'masonry', 'finish', 'roof', 'steel', 'mepf', 'openings', 'pile', 'girder', 'misc', 'general'].forEach(c => { price[c] = Math.exp(normal(0, 0.07)); });
  const qty = { rebar: normal(1, 0.10), concrete: normal(1, 0.06), formwork: normal(1, 0.08), earth: Math.max(0.7, normal(1.05, 0.15)),
    masonry: normal(1, 0.07), steel: normal(1, 0.08), mepf: normal(1, 0.10), pile: kind === 'port' ? unif(0.95, 1.35) : 1 };
  return { price, qty };
}

// ------------------------------------------------------------------ project generators
function building(usage, k, N, name) {
  const d = D.build(Object.assign(D.programFor(usage, k, N), { name }));
  return d.plan;
}
const GEN = {
  hospital: () => { const k = step(10, 250, 5); const N = Math.min(5, Math.max(1, Math.ceil(k / 50) + (rand() < 0.5 ? 0 : 1))); return { cls: 'Hospitals', plan: building('hospital', k, N, 'Hospital ' + k + ' beds') }; },
  airport: () => { const k = step(50, 1000, 50); const N = k > 300 ? 2 : 1; return { cls: 'Airport terminals', plan: building('airport', k, N, 'Airport terminal ' + k + ' PHP') }; },
  seaport: () => { const k = step(60, 1080, 60); const N = k > 600 ? 2 : 1; return { cls: 'Seaport terminals', plan: building('seaport', k, N, 'Seaport terminal ' + k + ' pax') }; },
  terminal: () => {
    const u = pick(['jeepterm', 'uvterm', 'busterm'], [0.4, 0.3, 0.3]);
    const k = u === 'busterm' ? step(4, 30, 1) : step(6, 50, 2);
    return { cls: 'Land transport terminals', plan: building(u, k, k > (u === 'busterm' ? 20 : 36) ? 2 : 1, D.USAGE[u].label + ' ' + k + ' bays') };
  },
  airfield: () => {
    const f = pick(['runway', 'taxiway', 'apron'], [0.45, 0.25, 0.30]), ac = pick(['code_b', 'turboprop', 'jet'], [0.3, 0.5, 0.2]);
    const A = E.AIRCRAFT[ac];
    let L, W;
    if (f === 'runway') { L = rand() < 0.4 ? unif(200, 800) : ac === 'code_b' ? unif(600, 1000) : ac === 'turboprop' ? unif(900, 1800) : unif(1800, 2600); W = A.rwyW; }
    else if (f === 'taxiway') { L = unif(150, 900); W = A.twyW; }
    else { L = unif(60, 200); W = unif(50, 120); }
    return { cls: 'Airfield pavements', plan: { kind: 'airfield', facility: f, aircraft: ac, length: Math.round(L / 10) * 10, width: Math.round(W * 2) / 2, name: f + ' ' + Math.round(L) + ' m' } };
  },
  port: () => {
    const f = rand() < 0.57 ? 'pier' : 'wharf';
    const plan = f === 'pier'
      ? { facility: f, length: Math.round(unif(20, 80)), width: Math.round(unif(6, 20)), waterDepth: +unif(2, 8).toFixed(1), causeway: rand() < 0.3 ? Math.round(unif(30, 120)) : 0, roro: rand() < 0.3 }
      : { facility: f, length: Math.round(unif(40, 150)), width: Math.round(unif(12, 25)), waterDepth: +unif(5, 11).toFixed(1) };
    plan.pileType = rand() < 0.4 ? 'steel_pipe' : 'pc_spun';
    return { cls: 'Port structures', plan: Object.assign({ kind: 'port', name: f + ' ' + plan.length + ' m' }, plan) };
  }
};
const MIX = [['hospital', 30], ['airport', 20], ['seaport', 20], ['terminal', 40], ['airfield', 35], ['port', 35]];

function metrics(rows) {
  const n = rows.length;
  const ape = rows.map(r => Math.abs(r.fair - r.awarded) / r.awarded);
  const mean = rows.reduce((s, r) => s + r.awarded, 0) / n;
  const ssr = rows.reduce((s, r) => s + Math.pow(r.awarded - r.fair, 2), 0), sst = rows.reduce((s, r) => s + Math.pow(r.awarded - mean, 2), 0);
  return {
    n, mape: 100 * ape.reduce((a, b) => a + b, 0) / n, r2: 1 - ssr / sst,
    leanBelow: 100 * rows.filter(r => r.start <= r.awarded).length / n,
    ceilingCovers: 100 * rows.filter(r => r.ceiling >= r.awarded).length / n,
    leanSaving: 100 * rows.reduce((s, r) => s + (1 - r.start / r.fair), 0) / n
  };
}
function auc(rows, score) {
  const pos = rows.filter(r => r.injected), neg = rows.filter(r => !r.injected);
  if (!pos.length || !neg.length) return null;
  let s = 0;
  pos.forEach(p => neg.forEach(q => { const a = score(p), b = score(q); s += a > b ? 1 : a === b ? 0.5 : 0; }));
  return s / (pos.length * neg.length);
}
function detect(rows, flag, score) {
  const tp = rows.filter(r => r.injected && flag(r)).length, fp = rows.filter(r => !r.injected && flag(r)).length, fn = rows.filter(r => r.injected && !flag(r)).length;
  const P = tp + fp ? tp / (tp + fp) : 0, R = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, precision: P, recall: R, f1: P + R ? 2 * P * R / (P + R) : 0, auc: auc(rows, score) };
}

function main() {
  const t0 = Date.now();
  // ---------------- templates and checks
  const extTemplates = D.TEMPLATES.slice(41).map(t => {
    const d = D.build(t), q = E.quote(d.plan);
    return { id: t.id, name: t.name, usage: t.usage, N: d.N, L: d.L, W: d.W, gfa: d.gfa, capacity: d.capacity, site: d.site && d.site.pave ? { pave: d.site.pave, canopy: d.site.canopy, bays: d.site.bays } : null,
      start: q.start, fair: q.fair, ceiling: q.ceiling, perUnit: q.tiers.standard.perUnit, unit: q.tiers.standard.metrics.unit, checks: d.checks.length, passed: d.checks.filter(c => c.ok).length };
  });
  const allChecks = D.TEMPLATES.map(t => D.build(t).checks);
  const civil = D.AIRFIELD_TEMPLATES.concat(D.PORT_TEMPLATES).map(t => {
    const q = E.quote(t.plan);
    return { id: t.id, name: t.name, kind: t.plan.kind, start: q.start, fair: q.fair, ceiling: q.ceiling, perUnit: q.tiers.standard.perUnit, unit: q.tiers.standard.metrics.unit, quantities: q.tiers.standard.quantities };
  });

  // ---------------- budget-to-design for the new usages
  const budgets = { hospital: [75e6, 150e6, 300e6], airport: [100e6, 300e6, 600e6], seaport: [30e6, 60e6, 120e6], jeepterm: [20e6, 40e6, 80e6], uvterm: [20e6, 40e6, 80e6], busterm: [20e6, 40e6, 80e6] };
  const scenarios = [];
  Object.keys(budgets).forEach(u => budgets[u].forEach(B => {
    const s = process.hrtime.bigint();
    const r = D.fromBudget(u, B);
    const ms = Number(process.hrtime.bigint() - s) / 1e6;
    const b = r.options[0];
    scenarios.push({ usage: u, label: D.USAGE[u].label, capLabel: D.USAGE[u].capLabel, budget: B, evaluations: r.evaluations, ms, options: r.options.length,
      best: b ? { k: b.k, N: b.N, cost: b.cost, util: b.cost / B, L: b.design.L, W: b.design.W, gfa: b.design.gfa } : null });
  }));

  // ---------------- SBD-EXT simulated benchmark
  const rows = [];
  MIX.forEach(([g, n]) => { for (let i = 0; i < n; i++) {
    const p = GEN[g]();
    p.plan.province = pick(PROVINCES, PROV_W); p.plan.year = pick(YEARS);
    const kind = p.plan.kind === 'airfield' || p.plan.kind === 'port' ? p.plan.kind : 'building';
    const declared = E.quote(p.plan), truth = E.compute(p.plan, 'standard', { adjust: hidden(kind) }).abc.total;
    rows.push({ id: 'EXT-' + String(rows.length + 1).padStart(3, '0'), group: g, cls: p.cls, kind, name: p.plan.name, start: declared.start, fair: declared.fair, ceiling: declared.ceiling, trueCost: truth });
  } });
  const n = rows.length, idx = rows.map((_, i) => i).sort(() => rand() - 0.5), nA = Math.round(0.12 * n);
  rows.forEach(r => { r.market = Math.exp(normal(-0.02, 0.045)); r.markup = 1; r.injected = false; r.severity = ''; });
  idx.slice(0, nA).forEach((j, k) => { const r = rows[j]; r.injected = true; r.markup = k % 2 === 0 ? unif(1.20, 1.40) : unif(1.40, 2.10); r.severity = k % 2 === 0 ? 'moderate' : 'severe'; });
  idx.slice(nA, nA + Math.round(0.04 * n)).forEach(j => { rows[j].markup = unif(0.78, 0.88); rows[j].severity = 'low-bid'; });
  rows.forEach(r => { r.awarded = r.trueCost * r.market * r.markup; r.obr = r.awarded / r.fair; r.bri = 100 * Math.min(1, Math.max(0, (r.obr - 1) / 0.5)); });

  const classes = ['Hospitals', 'Airport terminals', 'Seaport terminals', 'Land transport terminals', 'Airfield pavements', 'Port structures'];
  const byClass = classes.map(c => {
    const rr = rows.filter(r => r.cls === c), fairRows = rr.filter(r => !r.injected);
    return { cls: c, n: rr.length, injected: rr.filter(r => r.injected).length,
      range: [Math.min(...rr.map(r => r.awarded)), Math.max(...rr.map(r => r.awarded))],
      accuracy: metrics(fairRows),
      rule: detect(rr, r => r.awarded > r.ceiling, r => r.obr),
      index: detect(rr, r => r.bri >= 30, r => r.bri) };
  });
  const fairAll = rows.filter(r => !r.injected);
  const overall = { n, injected: nA, accuracy: metrics(fairAll), rule: detect(rows, r => r.awarded > r.ceiling, r => r.obr), index: detect(rows, r => r.bri >= 30, r => r.bri) };

  const out = {
    generated: new Date().toISOString().slice(0, 10), engine: E.VERSION,
    counts: { spaces: Object.keys(D.SPACES).length, buildingTemplates: D.TEMPLATES.length, newBuildingTemplates: extTemplates.length, bridgeTemplates: D.BRIDGE_TEMPLATES.length,
      airfieldTemplates: D.AIRFIELD_TEMPLATES.length, portTemplates: D.PORT_TEMPLATES.length, usages: Object.keys(D.USAGE).length,
      checks: allChecks.reduce((s, c) => s + c.length, 0), checksPassed: allChecks.reduce((s, c) => s + c.filter(x => x.ok).length, 0),
      extChecks: extTemplates.reduce((s, t) => s + t.checks, 0), extPassed: extTemplates.reduce((s, t) => s + t.passed, 0) },
    templates: extTemplates, civil, scenarios,
    medianMs: scenarios.map(s => s.ms).sort((a, b) => a - b)[Math.floor(scenarios.length / 2)],
    benchmark: { byClass, overall, sample: rows.slice(0, 12).map(r => ({ id: r.id, cls: r.cls, name: r.name, fair: r.fair, awarded: r.awarded, injected: r.injected })) },
    rows: rows.map(r => ({ id: r.id, cls: r.cls, kind: r.kind, name: r.name, start: r.start, fair: r.fair, ceiling: r.ceiling, awarded: r.awarded, injected: r.injected, severity: r.severity, obr: r.obr }))
  };
  fs.writeFileSync(path.join(ROOT, 'research', 'outputs', 'extension_results.json'), JSON.stringify(out, null, 1));
  // CSV of the benchmark
  const csv = ['id,class,kind,name,start_quotation,standard_estimate,ceiling,awarded_cost,injected_overpricing,severity,over_budget_ratio']
    .concat(rows.map(r => [r.id, r.cls, r.kind, '"' + r.name + '"', r.start.toFixed(2), r.fair.toFixed(2), r.ceiling.toFixed(2), r.awarded.toFixed(2), r.injected ? 1 : 0, r.severity, r.obr.toFixed(4)].join(',')));
  fs.writeFileSync(path.join(ROOT, 'research', 'data', 'buhay_sbd_ext180.csv'), csv.join('\n') + '\n');

  // drawings for the paper
  const svgDir = path.join(ROOT, 'research', 'figures', 'svg');
  fs.mkdirSync(svgDir, { recursive: true });
  const tplById = id => D.TEMPLATES.find(t => t.id === id);
  fs.writeFileSync(path.join(svgDir, 'plan_hospital_l2.svg'), D.planSVG(D.build(tplById('hosp-l2-100')), 0));
  fs.writeFileSync(path.join(svgDir, 'plan_airport.svg'), D.planSVG(D.build(tplById('ap-400-2s')), 0));
  fs.writeFileSync(path.join(svgDir, 'plan_seaport.svg'), D.planSVG(D.build(tplById('sp-360')), 0));
  fs.writeFileSync(path.join(svgDir, 'plan_terminal.svg'), D.planSVG(D.build(tplById('itt-36')), 0));
  fs.writeFileSync(path.join(svgDir, 'airfield_runway.svg'), D.airfieldSVG(D.AIRFIELD_TEMPLATES.find(t => t.id === 'af-rwy-c').plan));
  fs.writeFileSync(path.join(svgDir, 'airfield_apron.svg'), D.airfieldSVG(D.AIRFIELD_TEMPLATES.find(t => t.id === 'af-apron4').plan));
  fs.writeFileSync(path.join(svgDir, 'port_roro.svg'), D.portSVG(D.PORT_TEMPLATES.find(t => t.id === 'pt-roro').plan));
  fs.writeFileSync(path.join(svgDir, 'port_fish.svg'), D.portSVG(D.PORT_TEMPLATES.find(t => t.id === 'pt-fish').plan));

  console.log('extension:', out.counts, 'benchmark', n, 'projects,', nA, 'injected;', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  byClass.forEach(c => console.log(c.cls.padEnd(26), 'n', c.n, 'inj', c.injected, 'MAPE', c.accuracy.mape.toFixed(2), 'R2', c.accuracy.r2.toFixed(4), 'rule R', c.rule.recall.toFixed(3), 'P', c.rule.precision.toFixed(3), 'AUC', (c.rule.auc || 0).toFixed(3), '| idx R', c.index.recall.toFixed(3), 'P', c.index.precision.toFixed(3)));
  console.log('overall MAPE', overall.accuracy.mape.toFixed(2), 'R2', overall.accuracy.r2.toFixed(4), 'lean<=', overall.accuracy.leanBelow.toFixed(1), 'ceil', overall.accuracy.ceilingCovers.toFixed(1), 'rule', JSON.stringify(overall.rule), 'index', JSON.stringify(overall.index));
  scenarios.forEach(s => console.log(s.usage, s.budget / 1e6, s.best ? s.best.k + '/' + s.best.N + ' ' + (s.best.cost / 1e6).toFixed(1) : '-', s.evaluations, s.ms.toFixed(1) + 'ms'));
}
main();
