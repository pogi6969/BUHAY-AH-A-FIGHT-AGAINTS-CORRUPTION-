/*
 * BUHAY-AH cost engine — standards-based quantity take-off (QTO) and
 * Approved Budget for the Contract (ABC) builder for public buildings and bridges.
 *
 * One source of truth: the same file runs in the browser app (window.BuhayEngine)
 * and in the Node.js research pipeline (require('./engine.js')).
 *
 * Quantities follow parametric rules derived from NSCP 2015 Vol. I (buildings),
 * DPWH Standard Specifications (Vol. II 2013 highways & bridges, Vol. III 2019
 * public works structures), DPWH DGCS 2015 / Bridge Seismic Design Specifications,
 * AASHTO LRFD girder proportions, PD 1096 (National Building Code) and BP 344.
 * Indirect costs follow DPWH D.O. 197 s. 2016, carried into D.O. 30 s. 2025.
 * Unit rates are indicative direct costs (materials + labor + equipment) for
 * Bicol Region V, base Albay, 2025-Q4, and are meant to be replaced by the
 * implementing office's current DUPA / regional price data.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BuhayEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';
  var PRICE_BASIS = 'Bicol Region V, base Albay (Legazpi City), 2025-Q4, direct cost (materials + labor + equipment)';

  // ---------------------------------------------------------------- price book
  // id: [pay item ref, description, unit, rate (PHP), category]
  var PRICE_BOOK = {
    // general requirements (DPWH Part A/B)
    mobil:       ['B.9',       'Mobilization / demobilization', 'l.s.', 0, 'general'],
    osh:         ['B.7 (1)',   'Occupational safety & health program', 'l.s.', 0, 'general'],
    billboard:   ['B.5',       'Project billboard / signboard', 'each', 7500, 'general'],
    traffic:     ['B.8',       'Traffic management & detour', 'l.s.', 0, 'general'],
    survey:      ['B.3',       'Survey, staking, testing & as-built plans', 'l.s.', 0, 'general'],

    // building works — DPWH Vol. III (2019) item numbering
    clear:       ['800 (3)',   'Clearing and grubbing', 'm²', 45, 'earth'],
    excav:       ['803 (1)a',  'Structure excavation, common soil', 'm³', 380, 'earth'],
    backfill:    ['804 (1)a',  'Backfill from structure excavation, compacted', 'm³', 260, 'earth'],
    gravel:      ['804 (4)',   'Gravel fill / bedding, compacted', 'm³', 1550, 'earth'],
    termite:     ['1000 (1)',  'Soil poisoning (termite control)', 'm²', 65, 'misc'],
    conc21:      ['900 (1)c',  'Structural concrete, fc′ 20.7 MPa (3000 psi), 28 days', 'm³', 7900, 'concrete'],
    concsog:     ['900 (1)b',  'Concrete slab on grade, fc′ 17.2 MPa (2500 psi)', 'm³', 7200, 'concrete'],
    rebar:       ['902 (1)',   'Reinforcing steel bars, deformed, Gr. 40/60, incl. tie wire', 'kg', 82, 'rebar'],
    form:        ['903 (2)',   'Formworks and falseworks', 'm²', 850, 'formwork'],
    chb150:      ['1046 (3)',  'CHB masonry 150 mm, reinforced & grouted (exterior)', 'm²', 1080, 'masonry'],
    chb100:      ['1046 (2)',  'CHB masonry 100 mm (partitions)', 'm²', 880, 'masonry'],
    plaster:     ['1027 (1)',  'Cement plaster finish', 'm²', 360, 'finish'],
    paint:       ['1032 (1)',  'Painting works, masonry/concrete (acrylic, 3 coats)', 'm²', 230, 'finish'],
    truss:       ['1047 (3)',  'Structural steel trusses & purlins, fabricated & installed', 'kg', 140, 'steel'],
    roofing:     ['1013 (2)',  'Pre-painted long-span metal roofing 0.50 mm, incl. accessories', 'm²', 760, 'roof'],
    gutter:      ['1013 (5)',  'Gutters, flashing & downspouts', 'm', 950, 'roof'],
    waterproof:  ['—',         'Waterproofing membrane, RC roof deck', 'm²', 480, 'roof'],
    ceiling:     ['—',         'Ceiling: fiber-cement board on metal furring', 'm²', 1050, 'finish'],
    floortile:   ['1018 (2)',  'Ceramic floor tiles 600 × 600 mm', 'm²', 1180, 'finish'],
    floorcement: ['—',         'Cement floor topping, steel-trowel finish', 'm²', 320, 'finish'],
    floorprem:   ['—',         'Porcelain / granite floor tiles (premium)', 'm²', 1650, 'finish'],
    door:        ['1010',      'Doors complete with jamb & hardware', 'set', 13500, 'openings'],
    window:      ['1008 (1)',  'Aluminum-framed glass windows', 'm²', 6200, 'openings'],
    elec:        ['1100–1200', 'Electrical works (conduits, wires, devices, panel, fixtures)', 'm²', 0, 'mepf'],
    plumb:       ['1001–1002', 'Plumbing & sanitary works incl. fixtures', 'm²', 0, 'mepf'],
    fire:        ['—',         'Fire protection & detection (RA 9514)', 'm²', 0, 'mepf'],
    mech:        ['—',         'Mechanical / air-conditioning works', 'm²', 0, 'mepf'],
    septic:      ['—',         'RC septic tank / sewage treatment', 'unit', 0, 'mepf'],
    ramp:        ['—',         'Accessibility ramp & handrails (BP 344)', 'unit', 38000, 'misc'],
    railing:     ['1047 (5)',  'Steel railings — corridors, balconies & stairs', 'm', 4800, 'steel'],
    insulation:  ['—',         'Roof insulation, fascia & eaves soffit', 'm²', 420, 'roof'],
    canal:       ['—',         'Perimeter drainage canal with grating', 'm', 1450, 'earth'],

    // bridge works — DPWH Vol. II (2013) item numbering
    clear_b:     ['100 (1)',   'Clearing and grubbing', 'm²', 55, 'earth'],
    sexc:        ['103 (1)a',  'Structure excavation, common soil', 'm³', 420, 'earth'],
    sexc_w:      ['103 (2)',   'Structure excavation below water, incl. dewatering', 'm³', 680, 'earth'],
    cofferdam:   ['—',         'Cofferdam / sheet piling', 'each', 180000, 'earth'],
    sbackfill:   ['104 (2)',   'Structural backfill, granular, compacted', 'm³', 950, 'earth'],
    gravel_b:    ['—',         'Gravel bedding', 'm³', 1550, 'earth'],
    pile_rc:     ['400 (11)',  'Precast RC piles 450 × 450 mm, furnished & driven', 'm', 11500, 'pile'],
    pile_bore:   ['400 (17)',  'Bored piles 1.0 m Ø, drilling incl. temporary casing', 'm', 28000, 'pile'],
    pda:         ['400 (20)',  'Pile dynamic load test (PDA)', 'test', 85000, 'pile'],
    conc_deck:   ['405 (1)a',  'Structural concrete Class A — deck & girders, incl. forms', 'm³', 13500, 'concrete'],
    conc_sub:    ['405 (1)b',  'Structural concrete Class A — abutments, piers, walls, incl. forms', 'm³', 11200, 'concrete'],
    conc_ftg:    ['405 (1)c',  'Structural concrete Class A — footings, pile caps, approach slabs', 'm³', 9400, 'concrete'],
    conc_pile:   ['405 (1)d',  'Structural concrete for bored piles (tremie)', 'm³', 9200, 'concrete'],
    lean:        ['405 (2)',   'Lean concrete / seal concrete', 'm³', 6800, 'concrete'],
    rebar_b:     ['404 (1)',   'Reinforcing steel Gr. 60, incl. tie wire', 'kg', 84, 'rebar'],
    pscg3:       ['406 (1)a',  'Precast PSC girder AASHTO Type III — supply, fabricate, launch', 'm', 34000, 'girder'],
    pscg4:       ['406 (1)b',  'Precast PSC girder AASHTO Type IV — supply, fabricate, launch', 'm', 42000, 'girder'],
    pscbt:       ['406 (1)c',  'Precast PSC bulb-tee girder BT-1600 — supply, fabricate, launch', 'm', 52000, 'girder'],
    steel_b:     ['403 (1)',   'Structural steel, fabricated, painted & erected', 'kg', 210, 'steel'],
    bearing:     ['412 (1)',   'Elastomeric bearing pads', 'pc', 16500, 'misc'],
    bearing_pot: ['412 (3)',   'Pot / spherical bearings (steel spans)', 'pc', 95000, 'misc'],
    expjoint:    ['—',         'Expansion joint, strip-seal type', 'm', 26000, 'misc'],
    rail_steel:  ['401 (1)',   'Steel bridge railing', 'm', 6200, 'misc'],
    rail_conc:   ['401 (2)',   'Concrete barrier railing', 'm', 9800, 'misc'],
    scupper:     ['—',         'Deck drains / scuppers', 'pc', 2200, 'misc'],
    riprap:      ['505 (2)',   'Grouted riprap, Class A (slope protection)', 'm³', 3100, 'earth'],
    asphalt:     ['310',       'Asphalt wearing course 50 mm', 'm²', 640, 'finish'],
    pccp:        ['311 + 201', 'PCCP 230 mm on aggregate base (approaches)', 'm²', 3650, 'concrete']
  };

  // MEPF allowances (PHP per m² of gross floor area), standard tier
  var BUILDING_TYPES = {
    school:     { label: 'School building (classrooms)',          elec: 1600, plumb: 1400,  mech: 0,    w: 11.0, wall: 0.11, win: 0.25, doorArea: 35, sog: 1 },
    office:     { label: 'Government office / admin building',     elec: 2100, plumb: 1300, mech: 1200, w: 11.5, wall: 0.16, win: 0.22, doorArea: 20, sog: 1 },
    health:     { label: 'Health facility (RHU / BHS / birthing)', elec: 2900, plumb: 2300, mech: 1800, w: 12.0, wall: 0.24, win: 0.20, doorArea: 15, sog: 1 },
    evacuation: { label: 'Multi-purpose hall / evacuation center', elec: 1400, plumb: 950,  mech: 0,    w: 10.0, wall: 0.05, win: 0.18, doorArea: 60, sog: 1 },
    dorm:       { label: 'Dormitory / staff housing',              elec: 1700, plumb: 1700, mech: 0,    w: 10.5, wall: 0.28, win: 0.18, doorArea: 12, sog: 1 },
    market:     { label: 'Public market',                          elec: 1500, plumb: 1400, mech: 0,    w: 13.0, wall: 0.10, win: 0.15, doorArea: 25, sog: 1 },
    court:      { label: 'Covered court / open pavilion',          elec: 650,  plumb: 250,  mech: 0,    w: 4.0,  wall: 0,    win: 0,    doorArea: 400, sog: 1, open: true }
  };
  var TYPE_INDEX = { court: 1, evacuation: 1, school: 2, market: 3, dorm: 4, office: 5, health: 6 };

  var SUPERSTRUCTURES = {
    box_culvert: { label: 'RC box culvert', idx: 1, maxSpan: 6 },
    rcdg:        { label: 'RC deck girder (RCDG)', idx: 2, maxSpan: 25 },
    pscg:        { label: 'Prestressed concrete girder (PSCG)', idx: 3, maxSpan: 45 },
    steel_truss: { label: 'Steel truss', idx: 4, maxSpan: 100 }
  };
  var FOUNDATIONS = {
    spread:      { label: 'Spread footing', idx: 1 },
    driven_pile: { label: 'Driven precast RC piles', idx: 2 },
    bored_pile:  { label: 'Bored piles (1.0 m Ø)', idx: 3 }
  };

  // Location factors relative to Albay (island provinces carry freight and barge premiums)
  var PROVINCES = {
    'Albay':           { factor: 1.00, lat: 13.17, lon: 123.60 },
    'Camarines Norte': { factor: 1.03, lat: 14.14, lon: 122.76 },
    'Camarines Sur':   { factor: 1.00, lat: 13.62, lon: 123.19 },
    'Catanduanes':     { factor: 1.12, lat: 13.70, lon: 124.25 },
    'Masbate':         { factor: 1.10, lat: 12.37, lon: 123.62 },
    'Sorsogon':        { factor: 1.03, lat: 12.97, lon: 124.01 }
  };
  // Construction cost index, 2025 = 1.00
  var YEAR_INDEX = { 2021: 0.86, 2022: 0.90, 2023: 0.94, 2024: 0.97, 2025: 1.00, 2026: 1.03, 2027: 1.06 };

  // Quotation tiers. Lean = code-minimum reinforcement and basic finishes (the "start quotation");
  // standard = typical DPWH design intensities; ceiling = upper bound of a defensible estimate.
  var TIERS = {
    lean:     { label: 'Lean start quotation', rebar: 0.80, steel: 0.92, finish: 'lean',     mepf: 0.85, osh: 0.010, mobil: 0.010, extra: 1.00 },
    standard: { label: 'Standard fair estimate', rebar: 1.00, steel: 1.00, finish: 'standard', mepf: 1.00, osh: 0.015, mobil: 0.012, extra: 1.00 },
    ceiling:  { label: 'Ceiling (maximum defensible)', rebar: 1.25, steel: 1.15, finish: 'premium',  mepf: 1.25, osh: 0.020, mobil: 0.015, extra: 1.08 }
  };

  // DPWH D.O. 197 s. 2016 / D.O. 30 s. 2025: OCM and profit as % of estimated direct cost (EDC)
  var INDIRECT_TABLE = [
    { upTo: 5e6,      ocm: 0.15, profit: 0.10 },
    { upTo: 50e6,     ocm: 0.12, profit: 0.08 },
    { upTo: 150e6,    ocm: 0.10, profit: 0.08 },
    { upTo: Infinity, ocm: 0.08, profit: 0.08 }
  ];
  var VAT_RATE = 0.05; // of (EDC + OCM + profit), per D.O. 197 s. 2016

  var STANDARDS = [
    'NSCP 2015 Vol. I — National Structural Code of the Philippines (buildings), 7th ed.',
    'DPWH Standard Specifications for Highways, Bridges and Airports, Vol. II (2013)',
    'DPWH Standard Specifications for Public Works Structures, Vol. III (2019), D.O. 42 s. 2021',
    'DPWH Design Guidelines, Criteria and Standards (DGCS) 2015 & Bridge Seismic Design Specifications',
    'AASHTO LRFD Bridge Design Specifications (girder proportions, HL-93 loading)',
    'PD 1096 National Building Code (light & ventilation) and BP 344 Accessibility Law',
    'DPWH D.O. 197 s. 2016 / D.O. 30 s. 2025 — indirect costs in the ABC',
    'ICMS 3rd ed. & ISO 15686-5 — international cost classification and life-cycle costing'
  ];

  // ------------------------------------------------------------------ helpers
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function ceilTo(x, s) { return Math.ceil(x / s - 1e-9) * s; }
  function roundTo(x, s) { return Math.round(x / s) * s; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function r2(x) { return Math.round(x * 100) / 100; }

  function rateOf(id, prices, adjust) {
    var p = PRICE_BOOK[id];
    var rate = prices && prices[id] != null ? prices[id] : p[3];
    if (adjust && adjust.price && adjust.price[p[4]] != null) rate *= adjust.price[p[4]];
    return rate;
  }

  function Boq(prices, adjust, locFactor) {
    this.lines = [];
    this.prices = prices; this.adjust = adjust; this.loc = locFactor;
  }
  Boq.prototype.add = function (group, id, qty, opts) {
    opts = opts || {};
    if (!(qty > 0)) return;
    var p = PRICE_BOOK[id];
    var rate = opts.rate != null ? opts.rate : rateOf(id, this.prices, this.adjust);
    rate *= this.loc;
    this.lines.push({
      group: group, id: id, item: p[0], desc: opts.desc || p[1], unit: opts.unit || p[2],
      qty: r2(qty), rate: r2(rate), amount: r2(qty * rate), cat: p[4]
    });
  };
  Boq.prototype.lump = function (group, id, amount, desc) {
    if (!(amount > 0)) return;
    var p = PRICE_BOOK[id];
    this.lines.push({ group: group, id: id, item: p[0], desc: desc || p[1], unit: 'l.s.', qty: 1, rate: r2(amount), amount: r2(amount), cat: p[4] });
  };
  Boq.prototype.total = function () { return this.lines.reduce(function (s, l) { return s + l.amount; }, 0); };

  function qmul(adjust, key) { return adjust && adjust.qty && adjust.qty[key] != null ? adjust.qty[key] : 1; }

  // Solve an equivalent rectangle from area and perimeter (used for DXF-imported outlines)
  function rectFrom(area, perim) {
    var s = perim / 2, disc = s * s - 4 * area;
    if (disc < 0) { var a = Math.sqrt(area); return { L: a, W: a }; }
    var L = (s + Math.sqrt(disc)) / 2; return { L: L, W: area / L };
  }

  // ---------------------------------------------------------------- buildings
  function normalizeBuilding(plan) {
    var p = Object.assign({}, plan);
    p.type = BUILDING_TYPES[p.type] ? p.type : 'school';
    p.storeys = Math.max(1, Math.round(num(p.storeys, 1)));
    p.floorHeight = clamp(num(p.floorHeight, 3.2), 2.7, 8);
    if (num(p.footprintArea, 0) > 0 && !(num(p.length, 0) > 0 && num(p.width, 0) > 0)) {
      var rr = rectFrom(num(p.footprintArea), num(p.perimeter, 4 * Math.sqrt(p.footprintArea)));
      p.length = rr.L; p.width = rr.W;
    }
    p.length = Math.max(3, num(p.length, 18));
    p.width = Math.max(3, num(p.width, 9));
    if (p.width > p.length) { var t = p.length; p.length = p.width; p.width = t; }
    p.footprintArea = num(p.footprintArea, 0) > 0 ? num(p.footprintArea) : p.length * p.width;
    p.perimeter = num(p.perimeter, 0) > 0 ? num(p.perimeter) : 2 * (p.length + p.width);
    p.bayX = clamp(num(p.bayX, 4.5), 2.5, 12);
    p.bayY = clamp(num(p.bayY, 4.5), 2.5, 12);
    p.roof = p.roof === 'rc_deck' ? 'rc_deck' : 'steel_truss';
    p.soilBearing = clamp(num(p.soilBearing, 150), 50, 600);
    p.seismicZone = num(p.seismicZone, 4) === 2 ? 2 : 4;
    p.province = PROVINCES[p.province] ? p.province : 'Albay';
    p.year = Math.round(num(p.year, 2025));
    return p;
  }

  function buildingQTO(plan, tierKey, prices, adjust) {
    var p = normalizeBuilding(plan), T = TIERS[tierKey], bt = BUILDING_TYPES[p.type];
    var loc = PROVINCES[p.province].factor * (YEAR_INDEX[p.year] || 1);
    var boq = new Boq(prices, adjust, loc), notes = [];
    var N = p.storeys, h = p.floorHeight, A = p.footprintArea, P = p.perimeter, L = p.length, W = p.width;
    var GFA = A * N;
    var zone = p.seismicZone === 4 ? 1.0 : 0.88;
    var rf = T.rebar * zone * qmul(adjust, 'rebar');
    var cf = qmul(adjust, 'concrete');

    // structural grid
    var nbx = Math.max(1, Math.round(L / p.bayX)), nby = Math.max(1, Math.round(W / p.bayY));
    var sx = L / nbx, sy = W / nby, span = bt.open ? sx : Math.max(sx, sy), shortSpan = Math.min(sx, sy);
    var gx = nbx + 1, gy = nby + 1, nCol = gx * gy;
    var colB = N <= 2 ? (h > 6 ? 0.45 : 0.30) : N <= 4 ? 0.40 : N <= 6 ? 0.50 : 0.60;
    var beamD = Math.max(0.40, ceilTo(span / 12, 0.05)), beamB = Math.max(0.25, ceilTo(beamD * 0.5, 0.05));
    var ts = shortSpan <= 4.5 ? 0.125 : 0.150;
    var beamLen = bt.open ? 2 * (L + W) : gy * L + gx * W; // per level (open pavilions: ring beams only)
    var Df = 1.5;

    // footings (isolated, sized from service load and allowable bearing)
    var Pcol = 0.75 * sx * sy * N * bt.w; // kN
    var B = Math.max(1.0, ceilTo(Math.sqrt(Pcol / p.soilBearing), 0.1));
    var tf = Math.max(0.30, ceilTo(0.25 + 0.10 * B, 0.05));

    var V = {}, F = {}, K = {};
    V.footing = nCol * B * B * tf * cf;
    V.pedestal = nCol * colB * colB * Df * cf;
    V.column = nCol * N * colB * colB * h * cf;
    var slabLevels = N - 1 + (p.roof === 'rc_deck' ? 1 : 0);
    V.beam = (slabLevels * beamLen * beamB * (beamD - ts) + (p.roof === 'rc_deck' ? 0 : beamLen * beamB * beamD)) * cf;
    V.tiebeam = beamLen * 0.25 * 0.40 * cf;
    V.slab = slabLevels * A * ts * cf;
    var nStairs = N > 1 ? (A > 250 ? 2 : 1) : 0;
    V.stair = nStairs * (N - 1) * 4.2 * cf;
    V.sog = A * 0.10;

    // reinforcement intensities, kg per m³ (standard tier, seismic zone 4)
    K.footing = V.footing * 90 * rf; K.pedestal = V.pedestal * 210 * rf; K.column = V.column * 220 * rf;
    K.beam = V.beam * 190 * rf; K.tiebeam = V.tiebeam * 140 * rf; K.slab = V.slab * 100 * rf;
    K.stair = V.stair * 100 * rf; K.sog = V.sog * 30 * rf;

    F.footing = nCol * 4 * B * tf; F.pedestal = nCol * 4 * colB * Df; F.column = nCol * N * 4 * colB * h;
    F.beam = slabLevels * beamLen * (beamB + 2 * (beamD - ts)) + (p.roof === 'rc_deck' ? 0 : beamLen * (beamB + 2 * beamD));
    F.tiebeam = beamLen * 2 * 0.40; F.slab = slabLevels * A; F.stair = V.stair * 7;
    var formTotal = 0; Object.keys(F).forEach(function (k) { formTotal += F[k]; });
    formTotal *= qmul(adjust, 'formwork');

    // earthworks
    var excav = nCol * Math.pow(B + 0.6, 2) * (Df + tf + 0.10) + beamLen * 0.6 * 0.5;
    var gravel = nCol * Math.pow(B + 0.2, 2) * 0.10 + A * 0.10;
    var backfill = Math.max(0, excav - V.footing - V.pedestal - nCol * Math.pow(B + 0.2, 2) * 0.10);

    // masonry, finishes, openings
    var clearH = Math.max(2.2, h - beamD);
    var extWallGross = bt.open ? P * 1.2 : P * clearH * N;
    var winArea = bt.open ? 0 : Math.max(bt.win * extWallGross, 0.10 * GFA); // PD 1096: windows ≥ 10% of floor area
    var nDoors = bt.open ? 2 : Math.ceil(GFA / bt.doorArea) + 2 * N;
    var extWall = Math.max(0, extWallGross - winArea - 2 * N * 2.1 * 1.8);
    var intLen = bt.open ? 0 : num(p.interiorWallLength, 0) > 0 ? num(p.interiorWallLength) * N : bt.wall * A * N;
    var intWall = intLen * clearH * 0.90 - Math.max(0, nDoors - 2 * N) * 0.9 * 2.1;
    intWall = Math.max(0, intWall);
    var plasterArea = (extWall + intWall) * 2 * 1.10;
    var ceilingArea = bt.open ? 0 : A * N * 0.95;
    var floorArea = A * N * 0.92;
    var paintArea = plasterArea + ceilingArea;

    // roof
    var roofPlan = (L + 1.8) * (W + 1.8), roofArea = roofPlan / Math.cos(18 * Math.PI / 180) * 1.05;
    var trussKg = p.roof === 'rc_deck' ? 0 : (A * (14 + 0.6 * W) + roofArea * 5.5) * T.steel * qmul(adjust, 'steel');

    // ---- BOQ lines
    var G1 = 'Part A — General requirements', G2 = 'Part B — Earthworks & site', G3 = 'Part C — Reinforced concrete works',
        G4 = 'Part D — Masonry, roofing & finishes', G5 = 'Part E — Doors & windows', G6 = 'Part F — Plumbing, electrical & mechanical (MEPF)';

    boq.add(G2, 'clear', A * 1.6);
    boq.add(G2, 'excav', excav * qmul(adjust, 'earth'));
    boq.add(G2, 'backfill', backfill * qmul(adjust, 'earth'));
    boq.add(G2, 'gravel', gravel);
    boq.add(G2, 'termite', A);
    boq.add(G2, 'canal', tierKey === 'lean' ? P : P + 8);

    var vStruct = V.footing + V.pedestal + V.column + V.beam + V.tiebeam + V.slab + V.stair;
    boq.add(G3, 'conc21', V.footing, { desc: 'Structural concrete fc′ 20.7 MPa — footings (' + nCol + ' @ ' + B.toFixed(1) + ' × ' + B.toFixed(1) + ' × ' + tf.toFixed(2) + ' m)' });
    boq.add(G3, 'conc21', V.pedestal + V.column, { desc: 'Structural concrete fc′ 20.7 MPa — columns ' + Math.round(colB * 1000) + ' × ' + Math.round(colB * 1000) + ' mm & pedestals' });
    boq.add(G3, 'conc21', V.beam + V.tiebeam, { desc: 'Structural concrete fc′ 20.7 MPa — beams ' + Math.round(beamB * 1000) + ' × ' + Math.round(beamD * 1000) + ' mm & tie beams' });
    boq.add(G3, 'conc21', V.slab, { desc: 'Structural concrete fc′ 20.7 MPa — suspended slabs ' + Math.round(ts * 1000) + ' mm' });
    boq.add(G3, 'conc21', V.stair, { desc: 'Structural concrete fc′ 20.7 MPa — stairs (' + nStairs + ' flight set' + (nStairs > 1 ? 's' : '') + ')' });
    boq.add(G3, 'concsog', V.sog, { desc: 'Concrete slab on grade 100 mm, fc′ 17.2 MPa' });
    var kgTotal = 0; Object.keys(K).forEach(function (k) { kgTotal += K[k]; });
    boq.add(G3, 'rebar', kgTotal);
    boq.add(G3, 'form', formTotal);

    var mf = qmul(adjust, 'masonry');
    boq.add(G4, 'chb150', extWall * mf);
    boq.add(G4, 'chb100', intWall * mf);
    boq.add(G4, 'plaster', plasterArea * mf);
    var paintRate = { lean: 200, standard: 230, premium: 285 }[T.finish];
    boq.add(G4, 'paint', paintArea, { rate: paintRate });
    if (p.roof === 'rc_deck') {
      boq.add(G4, 'waterproof', A * 1.05);
    } else {
      boq.add(G4, 'truss', trussKg);
      boq.add(G4, 'roofing', roofArea);
      boq.add(G4, 'gutter', 2 * (L + 1.8) + 4 * 3 * N);
      boq.add(G4, 'insulation', roofArea, { rate: { lean: 300, standard: 420, premium: 560 }[T.finish] });
    }
    if (N > 1) boq.add(G4, 'railing', (N - 1) * L * (p.type === 'school' || p.type === 'dorm' ? 1 : 0.3) + nStairs * (N - 1) * 9);
    boq.add(G4, 'ceiling', ceilingArea, { rate: { lean: 880, standard: 1050, premium: 1350 }[T.finish] });
    var floorId = bt.open ? 'floorcement' : { lean: 'floorcement', standard: 'floortile', premium: 'floorprem' }[T.finish];
    boq.add(G4, floorId, floorArea);

    boq.add(G5, 'door', nDoors, { rate: { lean: 11500, standard: 13500, premium: 17500 }[T.finish] });
    boq.add(G5, 'window', winArea, { rate: { lean: 5400, standard: 6200, premium: 7600 }[T.finish] });

    var mepf = T.mepf * qmul(adjust, 'mepf');
    boq.add(G6, 'elec', GFA, { rate: bt.elec * mepf });
    boq.add(G6, 'plumb', GFA, { rate: bt.plumb * mepf });
    var needsSprinkler = N >= 3 || p.type === 'health' || p.type === 'market' || p.type === 'dorm';
    boq.add(G6, 'fire', GFA, { rate: (needsSprinkler ? 650 : 120) * mepf, desc: needsSprinkler ? 'Fire sprinkler, alarm & detection (RA 9514)' : 'Fire extinguishers, alarm & detection (RA 9514)' });
    if (bt.mech > 0) boq.add(G6, 'mech', GFA, { rate: bt.mech * (tierKey === 'lean' ? 0.25 : mepf), desc: tierKey === 'lean' ? 'Mechanical provisions (rough-in, sleeves, outlets)' : 'Mechanical / air-conditioning works' });
    boq.add(G6, 'septic', 1, { rate: Math.min(400000, 60000 + 45 * GFA) * mepf });
    boq.add(G6, 'ramp', 1);

    // general requirements, as a share of works
    var works = boq.total() * T.extra;
    if (T.extra > 1) boq.lump(G1, 'survey', boq.total() * (T.extra - 1), 'Design contingency on scope (ceiling tier)');
    boq.lump(G1, 'mobil', works * T.mobil);
    boq.lump(G1, 'osh', works * T.osh);
    boq.add(G1, 'billboard', 2);
    boq.lump(G1, 'survey', works * 0.005);

    // checks & notes
    if (span > 8) notes.push({ level: 'warn', text: 'Beam span ' + span.toFixed(1) + ' m exceeds 8 m; beam depth set to ' + beamD.toFixed(2) + ' m (L/12). Confirm with structural design.' });
    if (N > 6) notes.push({ level: 'warn', text: 'Buildings above 6 storeys need a full NSCP structural analysis; the parametric take-off is indicative only.' });
    notes.push({ level: 'info', text: 'Columns ' + Math.round(colB * 1000) + ' mm sq (NSCP 418.7.2.1 special moment frame minimum 300 mm), slab ' + Math.round(ts * 1000) + ' mm, footing B = ' + B.toFixed(1) + ' m for qa = ' + p.soilBearing + ' kPa.' });
    notes.push({ level: 'info', text: 'Window area ' + winArea.toFixed(0) + ' m² ≥ 10% of floor area (PD 1096 natural light).' });

    return {
      boq: boq.lines,
      direct: boq.total(),
      metrics: { gfa: GFA, footprint: A, unit: 'm² GFA', unitBase: GFA },
      quantities: {
        concrete_m3: vStruct + V.sog, rebar_kg: kgTotal, formwork_m2: formTotal, chb_m2: extWall + intWall,
        roof_m2: p.roof === 'rc_deck' ? A : roofArea, steel_kg: trussKg, excavation_m3: excav,
        columns: nCol * N, footings: nCol, doors: nDoors, windows_m2: winArea
      },
      geometry: { kind: 'building', L: L, W: W, N: N, h: h, gx: gx, gy: gy, sx: sx, sy: sy, colB: colB, beamD: beamD, ts: ts, roof: p.roof, B: B },
      notes: notes,
      plan: p
    };
  }

  // ------------------------------------------------------------------ bridges
  function normalizeBridge(plan) {
    var p = Object.assign({}, plan);
    p.superstructure = SUPERSTRUCTURES[p.superstructure] ? p.superstructure : 'rcdg';
    p.spans = Math.max(1, Math.round(num(p.spans, 1)));
    p.totalLength = Math.max(2, num(p.totalLength, 20));
    p.carriageway = clamp(num(p.carriageway, 6.70), 2.0, 20);
    p.sidewalk = clamp(num(p.sidewalk, p.superstructure === 'box_culvert' ? 0 : 0.75), 0, 3);
    p.pierHeight = clamp(num(p.pierHeight, 6), 1.5, 40);
    p.abutmentHeight = clamp(num(p.abutmentHeight, p.superstructure === 'box_culvert' ? 3 : 5), 1.5, 15);
    p.foundation = FOUNDATIONS[p.foundation] ? p.foundation : (p.superstructure === 'box_culvert' ? 'spread' : 'driven_pile');
    p.pileLength = clamp(num(p.pileLength, 15), 3, 60);
    p.waterway = p.waterway === false || p.waterway === 'false' || p.waterway === 0 ? false : true;
    p.approachLength = clamp(num(p.approachLength, p.superstructure === 'box_culvert' ? 0 : 15), 0, 200);
    p.province = PROVINCES[p.province] ? p.province : 'Albay';
    p.year = Math.round(num(p.year, 2025));
    return p;
  }

  function bridgeQTO(plan, tierKey, prices, adjust) {
    var p = normalizeBridge(plan), T = TIERS[tierKey];
    var loc = PROVINCES[p.province].factor * (YEAR_INDEX[p.year] || 1);
    var boq = new Boq(prices, adjust, loc), notes = [];
    var n = p.spans, Lt = p.totalLength, S = Lt / n;
    var Wd = p.carriageway + 2 * p.sidewalk + 2 * 0.30;
    var rf = T.rebar * qmul(adjust, 'rebar'), cf = qmul(adjust, 'concrete');
    var pileF = qmul(adjust, 'pile');
    var G1 = 'Part A — General requirements', G2 = 'Part B — Earthworks & protection', G3 = 'Part C — Foundation & piling',
        G4 = 'Part D — Substructure', G5 = 'Part E — Superstructure', G6 = 'Part F — Deck, railings & approaches';
    var sup = SUPERSTRUCTURES[p.superstructure];
    var Q = { concrete_m3: 0, rebar_kg: 0, steel_kg: 0, girder_m: 0, pile_m: 0, excavation_m3: 0 };
    var geo = { kind: 'bridge', type: p.superstructure, Lt: Lt, n: n, S: S, Wd: Wd, cw: p.carriageway, Hp: p.pierHeight, Ha: p.abutmentHeight };

    if (S > sup.maxSpan) notes.push({ level: 'warn', text: sup.label + ' span ' + S.toFixed(1) + ' m exceeds its usual economic limit of ' + sup.maxSpan + ' m.' });

    if (p.superstructure === 'box_culvert') {
      var H = p.abutmentHeight, Lb = Wd + 1.0;
      var tw = 0.20 + 0.03 * S, tsb = 0.20 + 0.04 * S;
      var totalW = n * S + (n + 1) * tw;
      var vBarrel = Lb * ((n + 1) * H * tw + 2 * totalW * tsb) * cf;
      var vHead = (2 * totalW * 1.0 * 0.30 + 4 * H * 2.5 * 0.30) * cf;
      var excC = (totalW + 2) * (Lb + 2) * (H + 2 * tsb + 0.6);
      boq.add(G2, 'clear_b', (totalW + 10) * (Lb + 10));
      boq.add(G2, p.waterway ? 'sexc_w' : 'sexc', excC * qmul(adjust, 'earth'));
      boq.add(G2, 'gravel_b', (totalW + 1) * (Lb + 1) * 0.15);
      boq.add(G2, 'sbackfill', Math.max(0, excC - vBarrel - (totalW + 1) * (Lb + 1) * 0.15 - n * S * Lb * H) * 0.8);
      boq.add(G2, 'riprap', 4 * H * 2.5 * 0.45);
      boq.add(G4, 'lean', (totalW + 0.4) * (Lb + 0.4) * 0.05);
      boq.add(G5, 'conc_sub', vBarrel + vHead, { desc: 'Structural concrete Class A — box culvert barrel, headwalls & wingwalls' });
      boq.add(G5, 'rebar_b', (vBarrel + vHead) * 120 * rf);
      boq.add(G6, 'rail_steel', 2 * totalW + 4);
      Q.concrete_m3 = vBarrel + vHead; Q.rebar_kg = (vBarrel + vHead) * 120 * rf; Q.excavation_m3 = excC;
      geo.H = H; geo.tw = tw; geo.tsb = tsb; geo.Lb = Lb; geo.totalW = totalW;
    } else {
      // superstructure
      var tsd = p.superstructure === 'steel_truss' ? 0.22 : 0.20;
      var vDeck = Lt * Wd * tsd * cf + 2 * Lt * p.sidewalk * 0.20 * cf;
      var ng = 0, vGird = 0, girderId = null, gM = 0, steelKg = 0, gd = 0;
      if (p.superstructure === 'rcdg') {
        ng = Math.ceil((Wd - 0.6) / 2.1) + 1;
        gd = Math.max(0.90, ceilTo(S / 13 + 0.10, 0.05));
        var bw = S > 15 ? 0.45 : 0.40;
        vGird = ng * Lt * bw * (gd - tsd) * 1.06 * cf;
      } else if (p.superstructure === 'pscg') {
        ng = Math.ceil((Wd - 0.6) / 2.4) + 1;
        girderId = S <= 24 ? 'pscg3' : S <= 32 ? 'pscg4' : 'pscbt';
        gd = S <= 24 ? 1.14 : S <= 32 ? 1.37 : 1.60;
        gM = ng * Lt;
        vGird = vDeck * 0.08; // cast-in-place diaphragms
      } else {
        steelKg = Wd * Lt * (55 + 4.2 * S) * T.steel * qmul(adjust, 'steel');
        ng = 4; gd = Math.max(5, S / 8);
      }
      var deckRebar = vDeck * 125 * rf + vGird * (p.superstructure === 'rcdg' ? 230 : 140) * rf;
      boq.add(G5, 'conc_deck', vDeck, { desc: 'Structural concrete Class A — deck slab ' + Math.round(tsd * 1000) + ' mm & sidewalks' });
      if (vGird > 0) boq.add(G5, 'conc_deck', vGird, { desc: p.superstructure === 'rcdg' ? 'Structural concrete Class A — RC deck girders (' + ng + ' lines, ' + gd.toFixed(2) + ' m deep) & diaphragms' : 'Structural concrete Class A — diaphragms' });
      boq.add(G5, 'rebar_b', deckRebar, { desc: 'Reinforcing steel Gr. 60 — superstructure' });
      if (girderId) boq.add(G5, girderId, gM);
      if (steelKg > 0) boq.add(G5, 'steel_b', steelKg);
      if (p.superstructure === 'steel_truss') boq.add(G5, 'bearing_pot', n * 4);
      else boq.add(G5, 'bearing', n * ng * 2);
      boq.add(G5, 'expjoint', (n + 1) * Wd);

      // abutments
      var Ha = p.abutmentHeight, tsa = 0.5 + 0.06 * Ha, Bf = 0.55 * Ha + 1.2;
      var piled = p.foundation !== 'spread';
      var tfa = piled ? 1.2 : 0.8;
      var vAbStem = 2 * (Wd * (Ha * tsa + 0.3 * 1.5) + 2 * (Ha * 4.0 * 0.40 * 0.6)) * cf;
      var vAbFtg = 2 * (Wd + 1.0) * Bf * tfa * cf;
      // piers
      var nP = n - 1, Hp = p.pierHeight, nc = Wd <= 9 ? 2 : 3, Dc = 1.0 + (Hp > 8 ? 0.2 : 0);
      var vPier = nP * (Wd * 1.5 * 1.4 + nc * Math.PI / 4 * Dc * Dc * Hp) * cf;
      var capL = Math.max(Wd * 0.8, 6), capW = 4.0, capT = 1.5;
      var vPierFtg = nP * capL * capW * capT * cf;
      boq.add(G4, 'conc_sub', vAbStem, { desc: 'Structural concrete Class A — abutment stems, backwalls & wingwalls (2)' });
      if (vPier > 0) boq.add(G4, 'conc_sub', vPier, { desc: 'Structural concrete Class A — piers (' + nP + ' × ' + nc + ' columns Ø' + Dc.toFixed(1) + ' m, H ' + Hp.toFixed(1) + ' m) & copings' });
      boq.add(G3, 'conc_ftg', vAbFtg + vPierFtg, { desc: 'Structural concrete Class A — ' + (piled ? 'pile caps' : 'footings') + ' (abutments & piers)' });
      boq.add(G3, 'lean', ((Wd + 1.0) * Bf * 2 + nP * capL * capW) * 0.05);
      var subRebar = vAbStem * 110 * rf + vPier * 150 * rf + (vAbFtg + vPierFtg) * 100 * rf;
      boq.add(G4, 'rebar_b', subRebar, { desc: 'Reinforcing steel Gr. 60 — substructure & foundations' });

      // piles
      var supports = 2 + nP, pileM = 0, nPiles = 0;
      if (p.foundation === 'driven_pile') {
        nPiles = 2 * Math.ceil((Wd + 1.0) / 1.2) * 2 + nP * 2 * Math.ceil(capL / 1.5);
        pileM = nPiles * p.pileLength * pileF;
        boq.add(G3, 'pile_rc', pileM, { desc: 'Precast RC piles 450 × 450 mm, furnished & driven (' + nPiles + ' piles × ' + (p.pileLength * pileF).toFixed(1) + ' m)' });
      } else if (p.foundation === 'bored_pile') {
        nPiles = 2 * 2 * Math.ceil((Wd + 1.0) / 3.0) + nP * 2 * Math.ceil(capL / 3.5);
        pileM = nPiles * p.pileLength * pileF;
        var vBP = pileM * Math.PI / 4 * 1.0 * cf;
        boq.add(G3, 'pile_bore', pileM, { desc: 'Bored piles 1.0 m Ø, drilling incl. casing (' + nPiles + ' piles × ' + (p.pileLength * pileF).toFixed(1) + ' m)' });
        boq.add(G3, 'conc_pile', vBP);
        boq.add(G3, 'rebar_b', vBP * 130 * rf, { desc: 'Reinforcing steel Gr. 60 — bored pile cages' });
        Q.concrete_m3 += vBP; Q.rebar_kg += vBP * 130 * rf;
      }
      if (nPiles > 0) boq.add(G3, 'pda', tierKey === 'lean' ? 2 : supports);

      // earthworks & protection
      var excAb = 2 * (Wd + 2.0) * (Bf + 2.0) * (tfa + 1.0) * 1.2;
      var excPier = nP * (capL + 2) * (capW + 2) * (capT + 1.0) * 1.2;
      boq.add(G2, 'clear_b', (Lt + 2 * p.approachLength + 20) * (Wd + 10));
      boq.add(G2, 'sexc', excAb * qmul(adjust, 'earth'));
      if (excPier > 0) boq.add(G2, p.waterway ? 'sexc_w' : 'sexc', excPier * qmul(adjust, 'earth'));
      if (p.waterway && nP > 0) boq.add(G2, 'cofferdam', nP, { rate: { lean: 120000, standard: 180000, premium: 260000 }[T.finish] * loc });
      boq.add(G2, 'sbackfill', 2 * Wd * Ha * (Ha * 0.5 + 2.0));
      boq.add(G2, 'riprap', 2 * Ha * 1.5 * (Wd + 8) * 0.45);

      // deck furniture & approaches
      var vApp = 2 * Wd * 6.0 * 0.30 * cf;
      boq.add(G6, 'conc_ftg', vApp, { desc: 'Structural concrete Class A — approach slabs (2 × 6 m)' });
      boq.add(G6, 'rebar_b', vApp * 100 * rf, { desc: 'Reinforcing steel Gr. 60 — approach slabs' });
      boq.add(G6, T.finish === 'premium' ? 'rail_conc' : 'rail_steel', 2 * Lt);
      boq.add(G6, 'scupper', 2 * Math.ceil(Lt / 5));
      if (T.finish === 'premium') boq.add(G6, 'asphalt', Lt * p.carriageway);
      boq.add(G6, 'pccp', 2 * p.approachLength * (p.carriageway + 1.0));

      Q.concrete_m3 += vDeck + vGird + vAbStem + vAbFtg + vPier + vPierFtg + vApp;
      Q.rebar_kg += deckRebar + subRebar + vApp * 100 * rf;
      Q.steel_kg = steelKg; Q.girder_m = gM; Q.pile_m = pileM; Q.piles = nPiles; Q.excavation_m3 = excAb + excPier;
      geo.ng = ng; geo.gd = gd; geo.tsd = tsd; geo.nc = nc; geo.Dc = Dc; geo.nP = nP; geo.Bf = Bf;
      notes.push({ level: 'info', text: sup.label + ': ' + n + ' span' + (n > 1 ? 's' : '') + ' × ' + S.toFixed(1) + ' m, deck width ' + Wd.toFixed(2) + ' m (' + p.carriageway.toFixed(2) + ' m carriageway), ' + (ng ? ng + ' girder lines' : '') + '.' });
      notes.push({ level: 'info', text: 'Design live load HL-93 (AASHTO LRFD) / DPWH; seismic detailing per DPWH Bridge Seismic Design Specifications.' });
    }

    var works = boq.total() * T.extra;
    if (T.extra > 1) boq.lump(G1, 'survey', boq.total() * (T.extra - 1), 'Design contingency on scope (ceiling tier)');
    boq.lump(G1, 'mobil', works * (T.mobil + 0.003));
    boq.lump(G1, 'osh', works * T.osh);
    if (p.superstructure !== 'box_culvert') boq.lump(G1, 'traffic', works * 0.008);
    boq.add(G1, 'billboard', 2);
    boq.lump(G1, 'survey', works * 0.006);

    var deckArea = p.superstructure === 'box_culvert' ? geo.totalW * geo.Lb : Lt * Wd;
    return {
      boq: boq.lines, direct: boq.total(),
      metrics: { deckArea: deckArea, length: Lt, unit: p.superstructure === 'box_culvert' ? 'm² of culvert' : 'm² of deck', unitBase: deckArea },
      quantities: Q, geometry: geo, notes: notes, plan: p
    };
  }

  // ------------------------------------------------------------- indirect cost
  function indirect(edc, settings) {
    settings = settings || {};
    var row = INDIRECT_TABLE.filter(function (r) { return edc <= r.upTo; })[0];
    var ocmR = settings.ocm != null ? settings.ocm : row.ocm;
    var prR = settings.profit != null ? settings.profit : row.profit;
    var vatR = settings.vat != null ? settings.vat : VAT_RATE;
    var ocm = edc * ocmR, profit = edc * prR, vat = (edc + ocm + profit) * vatR;
    return { edc: edc, ocmRate: ocmR, profitRate: prR, vatRate: vatR, ocm: ocm, profit: profit, vat: vat, total: edc + ocm + profit + vat };
  }

  function groupTotals(lines) {
    var g = {}; lines.forEach(function (l) { g[l.group] = (g[l.group] || 0) + l.amount; });
    return Object.keys(g).sort().map(function (k) { return { group: k, amount: g[k] }; });
  }

  // ---------------------------------------------------------------- quotation
  function compute(plan, tierKey, opts) {
    opts = opts || {};
    var q = plan.kind === 'bridge' ? bridgeQTO(plan, tierKey, opts.prices, opts.adjust) : buildingQTO(plan, tierKey, opts.prices, opts.adjust);
    q.tier = tierKey; q.tierLabel = TIERS[tierKey].label;
    q.abc = indirect(q.direct, opts.indirect);
    q.groups = groupTotals(q.boq);
    q.perUnit = q.abc.total / q.metrics.unitBase;
    return q;
  }

  function quote(plan, opts) {
    var out = { version: VERSION, kind: plan.kind === 'bridge' ? 'bridge' : 'building', tiers: {} };
    ['lean', 'standard', 'ceiling'].forEach(function (t) { out.tiers[t] = compute(plan, t, opts); });
    out.plan = out.tiers.standard.plan;
    out.start = out.tiers.lean.abc.total;
    out.fair = out.tiers.standard.abc.total;
    out.ceiling = out.tiers.ceiling.abc.total;
    out.savingsVsStandard = 1 - out.start / out.fair;
    out.priceBasis = PRICE_BASIS;
    out.standards = STANDARDS;
    return out;
  }

  // Over-budget screening of a contract amount against the standards-based baseline
  function assess(q, amount) {
    var obr = amount / q.fair, ceilRatio = q.ceiling / q.fair;
    var status = obr > ceilRatio ? 'red' : obr > 1.10 ? 'amber' : obr < 0.80 ? 'low' : 'green';
    var label = { red: 'Over-budget flag', amber: 'For review', green: 'Within fair range', low: 'Below fair range (check scope / quality)' }[status];
    return { amount: amount, obr: obr, ceilingRatio: ceilRatio, deviation: obr - 1, status: status, label: label, excessOverCeiling: Math.max(0, amount - q.ceiling) };
  }

  // Check a submitted ABC's markups against the DPWH caps
  function checkMarkups(edc, ocmRate, profitRate, vatRate) {
    var row = INDIRECT_TABLE.filter(function (r) { return edc <= r.upTo; })[0], issues = [];
    if (ocmRate != null && ocmRate > row.ocm + 1e-6) issues.push('OCM ' + (ocmRate * 100).toFixed(1) + '% exceeds the ' + (row.ocm * 100) + '% cap for this EDC bracket.');
    if (profitRate != null && profitRate > row.profit + 1e-6) issues.push('Profit ' + (profitRate * 100).toFixed(1) + '% exceeds the ' + (row.profit * 100) + '% cap for this EDC bracket.');
    if (vatRate != null && vatRate > VAT_RATE + 1e-6) issues.push('VAT computed at ' + (vatRate * 100).toFixed(1) + '%; DPWH ABCs use ' + (VAT_RATE * 100) + '% of (EDC + OCM + profit).');
    return { caps: row, issues: issues, ok: issues.length === 0 };
  }

  // Features used by the machine-learning layer (must match research/pipeline)
  function features(plan) {
    if (plan.kind === 'bridge') {
      var b = normalizeBridge(plan), Wd = b.carriageway + 2 * b.sidewalk + 0.6;
      return {
        TotalLength: b.totalLength, DeckWidth: Wd, DeckArea: b.totalLength * Wd, SpanLength: b.totalLength / b.spans,
        PierHeight: b.spans > 1 ? b.pierHeight : 0, AbutmentHeight: b.abutmentHeight,
        SuperTypeIndex: SUPERSTRUCTURES[b.superstructure].idx, FoundationIndex: FOUNDATIONS[b.foundation].idx,
        PileLength: b.foundation === 'spread' ? 0 : b.pileLength,
        LocationFactor: PROVINCES[b.province].factor, YearIndex: YEAR_INDEX[b.year] || 1
      };
    }
    var p = normalizeBuilding(plan);
    return {
      GFA: p.footprintArea * p.storeys, Footprint: p.footprintArea, Storeys: p.storeys,
      Span: Math.max(p.length / Math.max(1, Math.round(p.length / p.bayX)), p.width / Math.max(1, Math.round(p.width / p.bayY))),
      FloorHeight: p.floorHeight, TypeIndex: TYPE_INDEX[p.type], RoofRC: p.roof === 'rc_deck' ? 1 : 0,
      LocationFactor: PROVINCES[p.province].factor, YearIndex: YEAR_INDEX[p.year] || 1
    };
  }

  // Reference plans ("previous plans" library): typical configurations of DPWH-implemented facilities
  var ARCHETYPES = [
    { id: 'sb-1s2c', kind: 'building', name: '1-storey 2-classroom school building', type: 'school', length: 18, width: 9, storeys: 1, floorHeight: 3.2, bayX: 4.5, bayY: 4.5, roof: 'steel_truss' },
    { id: 'sb-2s4c', kind: 'building', name: '2-storey 4-classroom school building', type: 'school', length: 18, width: 9.5, storeys: 2, floorHeight: 3.2, bayX: 4.5, bayY: 4.75, roof: 'steel_truss' },
    { id: 'sb-3s9c', kind: 'building', name: '3-storey 9-classroom school building', type: 'school', length: 27, width: 9.5, storeys: 3, floorHeight: 3.3, bayX: 4.5, bayY: 4.75, roof: 'steel_truss' },
    { id: 'sb-4s12c', kind: 'building', name: '4-storey 12-classroom school building', type: 'school', length: 36, width: 9.5, storeys: 4, floorHeight: 3.3, bayX: 4.5, bayY: 4.75, roof: 'steel_truss' },
    { id: 'bhs', kind: 'building', name: 'Barangay health station', type: 'health', length: 10, width: 8, storeys: 1, floorHeight: 3.0, bayX: 3.5, bayY: 4.0, roof: 'steel_truss' },
    { id: 'rhu-2s', kind: 'building', name: '2-storey rural health unit / birthing facility', type: 'health', length: 20, width: 12, storeys: 2, floorHeight: 3.3, bayX: 5, bayY: 4, roof: 'steel_truss' },
    { id: 'evac-600', kind: 'building', name: 'Multi-purpose evacuation center, 600 m²', type: 'evacuation', length: 30, width: 20, storeys: 1, floorHeight: 5.0, bayX: 6, bayY: 6.7, roof: 'steel_truss' },
    { id: 'office-2s', kind: 'building', name: '2-storey municipal office building', type: 'office', length: 24, width: 14, storeys: 2, floorHeight: 3.4, bayX: 6, bayY: 4.7, roof: 'steel_truss' },
    { id: 'office-3s', kind: 'building', name: '3-storey provincial office building', type: 'office', length: 36, width: 18, storeys: 3, floorHeight: 3.6, bayX: 6, bayY: 6, roof: 'rc_deck' },
    { id: 'market-1s', kind: 'building', name: 'Public market, 1-storey', type: 'market', length: 40, width: 24, storeys: 1, floorHeight: 4.5, bayX: 6.7, bayY: 6, roof: 'steel_truss' },
    { id: 'dorm-3s', kind: 'building', name: '3-storey dormitory', type: 'dorm', length: 30, width: 12, storeys: 3, floorHeight: 3.0, bayX: 5, bayY: 4, roof: 'steel_truss' },
    { id: 'bc-1', kind: 'bridge', name: 'Single-cell RC box culvert 3.0 × 3.0 m', superstructure: 'box_culvert', totalLength: 3, spans: 1, carriageway: 6.7, sidewalk: 0, abutmentHeight: 3, foundation: 'spread' },
    { id: 'bc-2', kind: 'bridge', name: 'Double-barrel RC box culvert 2 × (3.0 × 2.5 m)', superstructure: 'box_culvert', totalLength: 6, spans: 2, carriageway: 6.7, sidewalk: 0, abutmentHeight: 2.5, foundation: 'spread' },
    { id: 'rcdg-12', kind: 'bridge', name: 'Single-lane farm-to-market RCDG bridge 1 × 12 m', superstructure: 'rcdg', totalLength: 12, spans: 1, carriageway: 4.0, sidewalk: 0.5, abutmentHeight: 4, foundation: 'spread', approachLength: 10 },
    { id: 'rcdg-18', kind: 'bridge', name: 'Two-lane RCDG bridge 1 × 18 m', superstructure: 'rcdg', totalLength: 18, spans: 1, carriageway: 6.7, sidewalk: 0.75, abutmentHeight: 5, foundation: 'driven_pile', pileLength: 12 },
    { id: 'rcdg-60', kind: 'bridge', name: 'Two-lane RCDG bridge 3 × 20 m', superstructure: 'rcdg', totalLength: 60, spans: 3, carriageway: 6.7, sidewalk: 0.75, pierHeight: 6, abutmentHeight: 5.5, foundation: 'driven_pile', pileLength: 15 },
    { id: 'pscg-60', kind: 'bridge', name: 'Two-lane PSCG bridge 2 × 30 m (AASHTO Type IV)', superstructure: 'pscg', totalLength: 60, spans: 2, carriageway: 6.7, sidewalk: 1.0, pierHeight: 7, abutmentHeight: 6, foundation: 'bored_pile', pileLength: 18 },
    { id: 'pscg-140', kind: 'bridge', name: 'Two-lane PSCG bridge 4 × 35 m', superstructure: 'pscg', totalLength: 140, spans: 4, carriageway: 6.7, sidewalk: 1.0, pierHeight: 9, abutmentHeight: 6.5, foundation: 'bored_pile', pileLength: 22 },
    { id: 'truss-50', kind: 'bridge', name: 'Two-lane steel truss bridge 1 × 50 m', superstructure: 'steel_truss', totalLength: 50, spans: 1, carriageway: 6.7, sidewalk: 0.75, abutmentHeight: 7, foundation: 'bored_pile', pileLength: 20 }
  ];

  return {
    VERSION: VERSION, PRICE_BASIS: PRICE_BASIS, PRICE_BOOK: PRICE_BOOK, BUILDING_TYPES: BUILDING_TYPES, TYPE_INDEX: TYPE_INDEX,
    SUPERSTRUCTURES: SUPERSTRUCTURES, FOUNDATIONS: FOUNDATIONS, PROVINCES: PROVINCES, YEAR_INDEX: YEAR_INDEX,
    TIERS: TIERS, INDIRECT_TABLE: INDIRECT_TABLE, VAT_RATE: VAT_RATE, STANDARDS: STANDARDS, ARCHETYPES: ARCHETYPES,
    compute: compute, quote: quote, assess: assess, indirect: indirect, checkMarkups: checkMarkups, features: features,
    normalizeBuilding: normalizeBuilding, normalizeBridge: normalizeBridge
  };
}));
