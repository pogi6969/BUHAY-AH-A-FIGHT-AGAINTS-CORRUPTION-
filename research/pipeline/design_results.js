// Design-generator results for the paper: template library, budget-to-design scenarios,
// school budget frontier, bridge type selection and solver timing.
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'docs', 'app', 'js', 'engine.js'));
const D = require(path.join(__dirname, '..', '..', 'docs', 'app', 'js', 'designs.js'));

const capText = d => {
  const c = d.capacity, p = [];
  if (c.classrooms) p.push(`${c.classrooms} classrooms`); if (c.beds) p.push(`${c.beds} beds`);
  if (c.consult && !c.beds) p.push(`${c.consult} consult rooms`); if (c.staff) p.push(`${c.staff} staff`);
  if (c.persons) p.push(`${c.persons} persons`); if (c.stalls) p.push(`${c.stalls} stalls`);
  return p.join(', ') || '—';
};
const templates = D.TEMPLATES.map(t => {
  const d = D.build(t), q = D.quote(d);
  return { id: t.id, name: t.name, usage: t.usage, N: d.N, L: d.L, W: d.W, gfa: d.gfa, cap: capText(d), capacity: d.capacity,
    rooms: d.rooms.filter(r => r.cat !== 'void').length, start: q.start, fair: q.fair, ceiling: q.ceiling, perM2: q.fair / d.gfa,
    checks: d.checks.length, passed: d.checks.filter(c => c.ok).length };
});
const bridges = D.BRIDGE_TEMPLATES.map(b => { const q = E.quote(b.plan); return { id: b.id, name: b.name, start: q.start, fair: q.fair, perM: q.fair / b.plan.totalLength }; });

const usages = ['school', 'health', 'office', 'evacuation', 'market', 'dorm'];
const budgets = [10e6, 25e6, 50e6, 80e6];
const scenarios = [];
for (const u of usages) for (const B of budgets) {
  const t0 = process.hrtime.bigint();
  const r = D.fromBudget(u, B, { basis: 'start', maxLength: 60 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const best = r.options[0];
  scenarios.push({ usage: u, label: D.USAGE[u].label, capLabel: D.USAGE[u].capLabel, budget: B, evaluations: r.evaluations, ms, options: r.options.length,
    best: best ? { k: best.k, N: best.N, cost: best.cost, util: best.cost / B, L: best.design.L, W: best.design.W, gfa: best.design.gfa } : null });
}
// school frontier: best classrooms per storey count, and the 1-storey-only baseline
const frontier = [];
for (let B = 6e6; B <= 80e6 + 1; B += 2e6) {
  const row = { budget: B };
  for (let N = 1; N <= 4; N++) {
    const r = D.fromBudget('school', B, { basis: 'start', maxLength: 60, maxStoreys: N });
    row['n' + N] = r.options.length ? Math.max(...r.options.map(o => o.k)) : 0;
  }
  frontier.push(row);
}
const gain = frontier.map(r => r.n4 - r.n1);
// bridges: recommended type by gap
const gaps = [6, 12, 20, 30, 45, 60, 90, 120];
const bridgeSel = gaps.map(g => {
  const o = D.bridgeOptions({ gap: g, lanes: 2, pierHeight: 6, abutmentHeight: 5, pileLength: 15 });
  const r = o[0];
  return { gap: g, options: o.length, type: E.SUPERSTRUCTURES[r.type].label, spans: r.spans, span: r.span, fair: r.quote.fair, perM: r.quote.fair / g,
    second: o[1] ? { type: E.SUPERSTRUCTURES[o[1].type].label, spans: o[1].spans, fair: o[1].quote.fair } : null };
});
// timing of the full school search (median of 50)
const times = [];
for (let i = 0; i < 50; i++) { const t0 = process.hrtime.bigint(); D.fromBudget('school', 50e6, { maxLength: 60 }); times.push(Number(process.hrtime.bigint() - t0) / 1e6); }
times.sort((a, b) => a - b);
console.log(JSON.stringify({ templates, bridges, scenarios, frontier, avgGain: gain.reduce((a, b) => a + b, 0) / gain.length, maxGain: Math.max(...gain),
  bridgeSel, medianMs: times[25], spaces: Object.keys(D.SPACES).length, usages: Object.keys(D.USAGE).length }));
