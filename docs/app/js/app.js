/* BUHAY app: plan → standards-based quotation → over-budget screening → map. */
(function () {
  'use strict';
  var E = window.BuhayEngine, ML = window.BuhayML, IMP = window.BuhayImport, Viewer = window.BuhayViewer;
  var DATA = window.BUHAY_DATA || {};
  var EMBEDDED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  // ------------------------------------------------------------------ helpers
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function peso(n, d) { return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); }
  function pesoM(n) { return '₱' + (n / 1e6).toLocaleString('en-PH', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + 'M'; }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function fmt(n, d) { return Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: d == null ? 2 : d }); }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('buhay:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('buhay:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }
  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || 'Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove();
  }
  function download(name, text, type) {
    if (EMBEDDED) { copyText(text, 'Copied to clipboard (downloads are off in this preview)'); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ------------------------------------------------------------------ state
  function archetype(id) { return E.ARCHETYPES.filter(function (a) { return a.id === id; })[0]; }
  function fresh(id) { var a = archetype(id); var p = Object.assign({}, a, { province: 'Albay', year: 2025 }); delete p.id; return p; }
  var S = {
    view: 'home',
    kind: store.get('kind', 'building'),
    plans: store.get('plans', { building: fresh('sb-2s4c'), bridge: fresh('rcdg-60') }),
    tier: 'lean', qtab: 'boq',
    check: store.get('check', { amount: '', cid: '', lat: '', lon: '', edc: '', ocm: '', profit: '', vat: '' }),
    prices: store.get('prices', {}),
    saved: store.get('saved', []),
    checks: store.get('checks', []),
    mapKind: 'all', mapStatus: 'all'
  };
  function plan() { return S.plans[S.kind]; }
  function persist() { store.set('kind', S.kind); store.set('plans', S.plans); store.set('check', S.check); }
  var quoteCache = { key: '', q: null };
  function getQuote(p) {
    p = p || plan();
    var key = JSON.stringify([p, S.prices]);
    if (quoteCache.key === key) return quoteCache.q;
    var q = E.quote(p, { prices: S.prices });
    quoteCache = { key: key, q: q };
    return q;
  }
  function screenFor(p, q, amount) {
    if (!DATA.models) return null;
    return ML.screen(DATA.models, p.kind === 'bridge' ? 'bridge' : 'building', E.features(p), amount, q.fair);
  }
  function planSummary(p) {
    if (p.kind === 'bridge') {
      var b = E.normalizeBridge(p);
      return E.SUPERSTRUCTURES[b.superstructure].label + ' · ' + fmt(b.totalLength, 1) + ' m · ' + b.spans + ' span' + (b.spans > 1 ? 's' : '') + ' · ' + fmt(b.carriageway) + ' m carriageway · ' + b.province;
    }
    var n = E.normalizeBuilding(p);
    return E.BUILDING_TYPES[n.type].label + ' · ' + n.storeys + ' storey' + (n.storeys > 1 ? 's' : '') + ' · ' + fmt(n.footprintArea * n.storeys, 0) + ' m² GFA · ' + n.province;
  }

  // ------------------------------------------------------------------ icons & nav
  var ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    quote: '<rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    check: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.8 12 2.3 2.3 4.3-4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    map: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    library: '<path d="M4 5.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4V5.5ZM20 5.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6V5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    building: '<path d="M4 20V9l8-5 8 5v11M9 20v-5h6v5M8 10.5h2M14 10.5h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
    bridge: '<path d="M2 15h20M4 15c2-5 5-7.5 8-7.5s6 2.5 8 7.5M7 15v4M17 15v4M12 7.5V15M8.5 9.8V15M15.5 9.8V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>'; }
  var TABS = [['home', 'Home'], ['quote', 'Quote'], ['check', 'Check'], ['map', 'Map'], ['library', 'Library']];
  function renderNav() {
    var html = TABS.map(function (t) { return '<button class="tab" type="button" data-go="' + t[0] + '"' + (S.view === t[0] ? ' aria-current="page"' : '') + '>' + icon(t[0]) + '<span>' + t[1] + '</span></button>'; }).join('');
    $('#tabsTop').innerHTML = html; $('#tabsBottom').innerHTML = html;
  }
  function go(view) {
    S.view = view;
    if (location.hash.slice(1) !== view) { try { history.replaceState(null, '', '#' + view); } catch (e) { /* ignore */ } }
    renderNav();
    var v = $('#view');
    ({ home: renderHome, quote: renderQuote, check: renderCheck, map: renderMap, library: renderLibrary }[view] || renderHome)(v);
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ fields
  var YEARS = [2022, 2023, 2024, 2025, 2026];
  function opts(o) { return Object.keys(o).map(function (k) { return [k, o[k].label || k]; }); }
  var PROV = Object.keys(E.PROVINCES).map(function (k) { return [k, k]; });
  var FIELDS = {
    building: [
      { k: 'name', l: 'Project name', t: 'text', wide: true },
      { k: 'type', l: 'Facility type', t: 'select', o: opts(E.BUILDING_TYPES), wide: true },
      { k: 'province', l: 'Province', t: 'select', o: PROV },
      { k: 'year', l: 'Price year', t: 'select', o: YEARS.map(function (y) { return [y, y]; }) },
      { k: 'length', l: 'Building length', u: 'm', step: 0.1 },
      { k: 'width', l: 'Building width', u: 'm', step: 0.1 },
      { k: 'storeys', l: 'Storeys', step: 1, min: 1, max: 12 },
      { k: 'floorHeight', l: 'Floor-to-floor height', u: 'm', step: 0.1 },
      { k: 'bayX', l: 'Column spacing (length)', u: 'm', step: 0.1 },
      { k: 'bayY', l: 'Column spacing (width)', u: 'm', step: 0.1 },
      { k: 'roof', l: 'Roof', t: 'select', o: [['steel_truss', 'Steel truss + long-span roofing'], ['rc_deck', 'RC roof deck']] },
      { k: 'soilBearing', l: 'Allowable soil bearing', u: 'kPa', step: 10 },
      { k: 'seismicZone', l: 'NSCP seismic zone', t: 'select', o: [[4, 'Zone 4 (Bicol)'], [2, 'Zone 2']] },
      { k: 'interiorWallLength', l: 'Interior walls per floor', u: 'm', step: 0.5, hint: 'optional' },
      { k: 'footprintArea', l: 'Footprint from plan', u: 'm²', step: 0.1, hint: 'optional' },
      { k: 'perimeter', l: 'Perimeter from plan', u: 'm', step: 0.1, hint: 'optional' }
    ],
    bridge: [
      { k: 'name', l: 'Project name', t: 'text', wide: true },
      { k: 'superstructure', l: 'Superstructure', t: 'select', o: opts(E.SUPERSTRUCTURES), wide: true },
      { k: 'province', l: 'Province', t: 'select', o: PROV },
      { k: 'year', l: 'Price year', t: 'select', o: YEARS.map(function (y) { return [y, y]; }) },
      { k: 'totalLength', l: 'Total length', u: 'm', step: 0.5 },
      { k: 'spans', l: 'Number of spans / cells', step: 1, min: 1, max: 20 },
      { k: 'carriageway', l: 'Carriageway width', u: 'm', step: 0.05 },
      { k: 'sidewalk', l: 'Sidewalk (each side)', u: 'm', step: 0.05 },
      { k: 'pierHeight', l: 'Pier height', u: 'm', step: 0.5 },
      { k: 'abutmentHeight', l: 'Abutment / culvert height', u: 'm', step: 0.5 },
      { k: 'foundation', l: 'Foundation', t: 'select', o: opts(E.FOUNDATIONS) },
      { k: 'pileLength', l: 'Pile length', u: 'm', step: 0.5 },
      { k: 'approachLength', l: 'Approach road (each side)', u: 'm', step: 1 },
      { k: 'waterway', l: 'Crossing', t: 'select', o: [['true', 'Over waterway'], ['false', 'Dry crossing']] }
    ]
  };
  function fieldHtml(f, val, prefix) {
    var id = (prefix || 'f_') + f.k;
    var lab = '<label for="' + id + '">' + esc(f.l) + (f.hint ? ' <span class="muted">(' + f.hint + ')</span>' : '') + '</label>';
    var inner;
    if (f.t === 'select') {
      inner = '<select id="' + id + '" data-key="' + f.k + '">' + f.o.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    } else if (f.t === 'text') {
      inner = '<input id="' + id + '" data-key="' + f.k + '" type="text" value="' + esc(val) + '" autocomplete="off">';
    } else {
      inner = '<input id="' + id + '" data-key="' + f.k + '" type="number" inputmode="decimal" step="' + (f.step || 'any') + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + ' value="' + esc(val == null ? '' : val) + '">' + (f.u ? '<span class="unit">' + f.u + '</span>' : '');
    }
    return '<div class="field' + (f.wide ? ' wide' : '') + '">' + lab + '<div class="in">' + inner + '</div></div>';
  }
  function readField(el) {
    var k = el.dataset.key, v = el.value;
    if (el.type === 'number') v = v === '' ? '' : parseFloat(v);
    if (k === 'year' || k === 'seismicZone') v = parseInt(v, 10);
    if (k === 'waterway') v = v === 'true';
    return [k, v];
  }

  // ------------------------------------------------------------------ home
  function renderHome(v) {
    var P = (DATA.projects && DATA.projects.projects) || [];
    var red = P.filter(function (p) { return p.status === 'red'; });
    var excess = red.reduce(function (s, p) { return s + Math.max(0, p.awarded - p.ceiling); }, 0);
    var q = getQuote();
    v.innerHTML =
      '<section class="hero">' +
        '<div class="stack">' +
          '<div class="eyebrow">Buildings · Bridges · DPWH & international standards</div>' +
          '<h1>Provide the plan.<br>Get the <em>fair price.</em></h1>' +
          '<p style="max-width:60ch">BUHAY reads a building or bridge plan, takes off the quantities, prices them with DPWH pay items and unit costs, and returns a lean <b>start quotation</b>, a standard fair estimate and a ceiling. Enter a contract amount and it screens for over-budgeting with a hybrid machine-learning check.</p>' +
          '<div class="row"><button class="btn sign" data-action="new" data-kind="building">' + icon('building') + ' Quote a building</button><button class="btn primary" data-action="new" data-kind="bridge">' + icon('bridge') + ' Quote a bridge</button><button class="btn" id="installBtn" hidden>Install app</button></div>' +
        '</div>' +
        '<div class="card stack">' +
          '<div class="row" style="justify-content:space-between"><div><div class="eyebrow">Current plan</div><h3>' + esc(plan().name || 'Untitled plan') + '</h3></div><button class="btn sm" data-go="quote">Open</button></div>' +
          '<div class="viewer" style="height:220px"><canvas id="homeV"></canvas></div>' +
          '<div class="row" style="justify-content:space-between"><span class="muted small">Start quotation</span><b class="mono">' + peso(q.start) + '</b></div>' +
          '<div class="row" style="justify-content:space-between"><span class="muted small">Standard fair estimate</span><b class="mono">' + peso(q.fair) + '</b></div>' +
        '</div>' +
      '</section>' +
      '<div style="height:18px"></div>' +
      '<div class="actions">' +
        '<button class="action" data-action="new" data-kind="building">' + icon('building') + '<b>Building quotation</b><span>Schools, health stations, offices, evacuation centers, markets</span></button>' +
        '<button class="action" data-action="new" data-kind="bridge">' + icon('bridge') + '<b>Bridge quotation</b><span>Box culverts, RCDG, PSCG and steel truss bridges</span></button>' +
        '<button class="action" data-go="check">' + icon('check') + '<b>Check a contract</b><span>Over-budget ratio, ML expectation, anomaly score, risk index</span></button>' +
        '<button class="action" data-go="map">' + icon('map') + '<b>Project map</b><span>Bicol Region V projects coloured by risk</span></button>' +
      '</div>' +
      '<div style="height:18px"></div>' +
      (P.length ? '<div class="card stack"><div class="row" style="justify-content:space-between"><h3>Benchmark screening</h3><span class="pill low">Simulated data</span></div>' +
        '<div class="stats">' +
          '<div class="stat"><b>' + P.length + '</b><span>projects screened (160 buildings, 140 bridges)</span></div>' +
          '<div class="stat"><b>' + red.length + '</b><span>high-risk flags (BRI ≥ 30)</span></div>' +
          '<div class="stat"><b>' + pesoM(excess) + '</b><span>above the ceiling estimate in flagged projects</span></div>' +
        '</div><p class="small muted">Demo records come from the research benchmark (SBD-300). They are simulated, not real DPWH contracts.</p></div>' : '') +
      (S.saved.length ? '<div style="height:18px"></div><div class="card stack"><h3>My saved plans</h3><div class="list">' + S.saved.slice(0, 4).map(savedItem).join('') + '</div></div>' : '');
    var vw = new Viewer($('#homeV')); vw.set(q.tiers.standard.geometry);
    setupInstall();
  }

  // ------------------------------------------------------------------ quote
  function renderQuote(v) {
    var refs = E.ARCHETYPES.filter(function (a) { return a.kind === S.kind; });
    var savedOf = S.saved.filter(function (s) { return s.plan.kind === S.kind; });
    v.innerHTML =
      '<div class="grid2">' +
        '<div class="card stack no-print" id="planCard">' +
          '<div class="row" style="justify-content:space-between"><h2>Plan</h2>' +
            '<div class="seg" role="group" aria-label="Asset type"><button type="button" data-kind-set="building" aria-pressed="' + (S.kind === 'building') + '">Building</button><button type="button" data-kind-set="bridge" aria-pressed="' + (S.kind === 'bridge') + '">Bridge</button></div></div>' +
          '<div class="field wide"><label for="refPlan">Start from a reference or saved plan</label><div class="in"><select id="refPlan"><option value="">Choose a plan…</option>' +
            '<optgroup label="Reference plans">' + refs.map(function (a) { return '<option value="ref:' + a.id + '">' + esc(a.name) + '</option>'; }).join('') + '</optgroup>' +
            (savedOf.length ? '<optgroup label="My saved plans">' + savedOf.map(function (s) { return '<option value="saved:' + s.id + '">' + esc(s.plan.name) + '</option>'; }).join('') + '</optgroup>' : '') +
          '</select></div></div>' +
          '<div class="row"><label class="btn sm">Import plan file (DXF / JSON)<input type="file" id="planFile" accept=".dxf,.json,.buhay"></label>' +
            (S.kind === 'building' ? '<button type="button" class="btn sm ghost" data-action="sample-dxf">Try the sample DXF</button>' : '') + '</div>' +
          '<div id="importNote"></div>' +
          '<form class="fields" id="planForm" onsubmit="return false">' + FIELDS[S.kind].map(function (f) { return fieldHtml(f, displayValue(f)); }).join('') + '</form>' +
          '<div class="row"><button type="button" class="btn primary" data-action="save-plan">Save plan</button><button type="button" class="btn" data-go="check">Check a contract →</button></div>' +
        '</div>' +
        '<div class="stack" id="quoteOut"></div>' +
      '</div>';
    $('#planForm').addEventListener('input', onPlanInput);
    $('#planForm').addEventListener('change', onPlanInput);
    $('#refPlan').addEventListener('change', function (e) {
      var val = e.target.value; if (!val) return;
      var p;
      if (val.indexOf('ref:') === 0) p = fresh(val.slice(4));
      else p = JSON.parse(JSON.stringify(S.saved.filter(function (s) { return s.id === val.slice(6); })[0].plan));
      p.province = p.province || plan().province; p.year = p.year || plan().year;
      S.plans[S.kind] = p; persist(); renderQuote(v); toast('Loaded: ' + p.name);
    });
    $('#planFile').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) readPlanFile(f); });
    renderQuoteOut();
  }
  // show the engine's default for fields the plan leaves empty (optional take-off fields stay blank)
  function displayValue(f) {
    var v = plan()[f.k];
    if (v !== undefined && v !== null && v !== '') return v;
    if (f.hint === 'optional') return '';
    var n = S.kind === 'bridge' ? E.normalizeBridge(plan()) : E.normalizeBuilding(plan());
    return f.k === 'waterway' ? String(n.waterway) : n[f.k];
  }
  var inputTimer = null;
  function onPlanInput(e) {
    if (!e.target.dataset.key) return;
    var kv = readField(e.target); plan()[kv[0]] = kv[1];
    persist();
    clearTimeout(inputTimer); inputTimer = setTimeout(renderQuoteOut, 120);
  }
  function readPlanFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var res = IMP.parse(file.name, String(r.result));
        applyImport(res, file.name);
      } catch (err) {
        $('#importNote').innerHTML = '<div class="note bad">Could not read ' + esc(file.name) + ': ' + esc(err.message) + '</div>';
      }
    };
    r.readAsText(file);
  }
  function applyImport(res, name) {
    if (res.source === 'DXF') {
      S.kind = 'building';
      var p = Object.assign({}, S.plans.building, {
        name: (S.plans.building.name || 'Imported plan').replace(/ \(from .*\)$/, '') + ' (from ' + name + ')',
        length: res.length, width: res.width, footprintArea: res.footprintArea, perimeter: res.perimeter,
        interiorWallLength: res.interiorWallLength || ''
      });
      S.plans.building = p; persist(); go('quote');
      $('#importNote').innerHTML = '<div class="note">Read <b>' + esc(name) + '</b> (' + esc(res.units) + ', ' + res.entities + ' entities). Outline ' + fmt(res.footprintArea) + ' m², perimeter ' + fmt(res.perimeter) + ' m, interior walls ' + fmt(res.interiorWallLength) + ' m per floor. Set the storeys, floor height and column spacing to finish the plan.</div>';
    } else {
      S.kind = res.kind; S.plans[res.kind] = res; persist(); go('quote');
      $('#importNote').innerHTML = '<div class="note">Loaded plan file <b>' + esc(name) + '</b>.</div>';
    }
  }

  function renderQuoteOut() {
    var out = $('#quoteOut'); if (!out) return;
    var p = plan(), q = getQuote(), t = q.tiers[S.tier], unit = t.metrics.unit;
    var ml = screenFor(p, q, 0);
    var tierBtn = function (key, label, tag) {
      var x = q.tiers[key];
      return '<button type="button" class="tier' + (key === 'lean' ? ' start' : '') + '" data-tier="' + key + '" aria-pressed="' + (S.tier === key) + '">' +
        (tag ? '<span class="tag">' + tag + '</span>' : '') + '<span class="eyebrow">' + label + '</span><span class="amt">' + pesoM(x.abc.total) + '</span>' +
        '<span class="small muted">' + peso(x.perUnit) + ' per ' + esc(unit) + '</span></button>';
    };
    var abc = t.abc;
    out.innerHTML =
      '<div class="card stack">' +
        '<div><div class="eyebrow">' + (q.kind === 'bridge' ? 'Bridge' : 'Building') + ' quotation · ' + esc(E.PROVINCES[q.plan.province] ? q.plan.province : '') + ' · ' + q.plan.year + ' prices</div><h2>' + esc(p.name || 'Untitled plan') + '</h2><p class="small muted">' + esc(planSummary(p)) + '</p></div>' +
        '<div class="tiers">' + tierBtn('lean', 'Lean', 'Start quotation') + tierBtn('standard', 'Standard fair estimate') + tierBtn('ceiling', 'Ceiling') + '</div>' +
        '<p class="small muted">The start quotation is ' + pct(q.savingsVsStandard) + ' below the standard estimate and keeps ' + (q.kind === 'bridge' ? 'code-minimum reinforcement and the DPWH / AASHTO design proportions' : 'NSCP minimum reinforcement and PD 1096 light requirements') + '. A contract above the ceiling (' + pct(q.ceiling / q.fair - 1) + ' over standard) is flagged.</p>' +
      '</div>' +
      '<div class="split">' +
        '<div class="card"><div class="viewer"><canvas id="v3d" aria-label="3D model of the plan"></canvas><span class="hint">Drag to rotate · scroll to zoom · double-click to reset</span></div></div>' +
        '<div class="card stack"><h3>Approved Budget for the Contract</h3><div class="small muted">' + esc(t.tierLabel) + '</div>' +
          '<dl class="kv"><dt>Estimated direct cost (EDC)</dt><dd>' + peso(abc.edc) + '</dd>' +
          '<dt>OCM ' + pct(abc.ocmRate, 0) + '</dt><dd>' + peso(abc.ocm) + '</dd>' +
          '<dt>Contractor\'s profit ' + pct(abc.profitRate, 0) + '</dt><dd>' + peso(abc.profit) + '</dd>' +
          '<dt>VAT ' + pct(abc.vatRate, 0) + ' of (EDC + OCM + profit)</dt><dd>' + peso(abc.vat) + '</dd>' +
          '<dt class="total">Total ABC</dt><dd class="total">' + peso(abc.total) + '</dd></dl>' +
          '<p class="small muted">Indirect costs follow DPWH D.O. 197 s. 2016, kept in D.O. 30 s. 2025.</p>' +
          (ml ? '<div class="note small">Historical model (XGBoost) expects about <b class="mono">' + pesoM(ml.xgb) + '</b> for a project like this (80% band ' + pesoM(ml.band[0]) + ' – ' + pesoM(ml.band[1]) + ').</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card stack">' +
        '<div class="subtabs" role="tablist">' + [['boq', 'Bill of quantities'], ['qty', 'Quantities'], ['std', 'Standards & checks']].map(function (s) { return '<button type="button" role="tab" data-qtab="' + s[0] + '" aria-selected="' + (S.qtab === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div>' +
        '<div id="subOut">' + subtab(q, t) + '</div>' +
        '<div class="row no-print"><button type="button" class="btn sm" data-action="export-csv">' + (EMBEDDED ? 'Copy BOQ (CSV)' : 'Export BOQ (CSV)') + '</button>' +
          '<button type="button" class="btn sm" data-action="export-plan">' + (EMBEDDED ? 'Copy plan file' : 'Export plan file') + '</button>' +
          '<button type="button" class="btn sm" data-action="copy-summary">Copy summary</button>' +
          (EMBEDDED ? '' : '<button type="button" class="btn sm" data-action="print">Print / save PDF</button>') + '</div>' +
      '</div>';
    var vw = new Viewer($('#v3d')); vw.set(t.geometry);
  }
  function subtab(q, t) {
    if (S.qtab === 'qty') {
      var Q = t.quantities, items = [];
      var lab = { concrete_m3: ['Concrete', 'm³'], rebar_kg: ['Reinforcing steel', 'kg'], formwork_m2: ['Formwork', 'm²'], chb_m2: ['CHB masonry', 'm²'], roof_m2: ['Roof area', 'm²'],
        steel_kg: ['Structural steel', 'kg'], excavation_m3: ['Excavation', 'm³'], columns: ['Column segments', 'pcs'], footings: ['Footings', 'pcs'], doors: ['Doors', 'sets'],
        windows_m2: ['Windows', 'm²'], girder_m: ['PSC girders', 'm'], pile_m: ['Piling', 'm'], piles: ['Piles', 'pcs'] };
      Object.keys(Q).forEach(function (k) { if (Q[k] > 0 && lab[k]) items.push('<div class="q"><b>' + fmt(Q[k], k.indexOf('kg') > 0 ? 0 : 1) + '</b><span>' + lab[k][0] + ' (' + lab[k][1] + ')</span></div>'); });
      return '<div class="qgrid" style="margin-top:12px">' + items.join('') + '</div>';
    }
    if (S.qtab === 'std') {
      return '<div class="stack" style="margin-top:12px">' + t.notes.map(function (n) { return '<div class="note ' + (n.level === 'warn' ? 'warn' : '') + '">' + esc(n.text) + '</div>'; }).join('') +
        '<h3>Standards applied</h3><ul class="small">' + q.standards.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
        '<p class="small muted">Unit costs: ' + esc(q.priceBasis) + '. Edit them in Library → Unit price book to match the latest DPWH DUPA or regional price data.</p></div>';
    }
    var rows = [], groups = {};
    t.boq.forEach(function (l) { (groups[l.group] = groups[l.group] || []).push(l); });
    Object.keys(groups).sort().forEach(function (g) {
      var sub = 0;
      rows.push('<tr class="group"><td colspan="6">' + esc(g) + '</td></tr>');
      groups[g].forEach(function (l) {
        sub += l.amount;
        rows.push('<tr><td class="mono small code">' + esc(l.item) + '</td><td>' + esc(l.desc) + '</td><td class="n">' + fmt(l.qty) + '</td><td>' + esc(l.unit) + '</td><td class="n">' + fmt(l.rate) + '</td><td class="n">' + fmt(l.amount, 0) + '</td></tr>');
      });
      rows.push('<tr><td></td><td class="muted small">Subtotal</td><td></td><td></td><td></td><td class="n"><b>' + fmt(sub, 0) + '</b></td></tr>');
    });
    rows.push('<tr class="sum"><td></td><td>Estimated direct cost</td><td></td><td></td><td></td><td class="n">' + fmt(t.abc.edc, 0) + '</td></tr>');
    return '<div class="tablewrap" style="max-height:520px;margin-top:10px"><table><thead><tr><th>Item</th><th>Description</th><th class="n">Qty</th><th>Unit</th><th class="n">Unit cost ₱</th><th class="n">Amount ₱</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function boqCSV(q, t) {
    var lines = [['Item', 'Description', 'Quantity', 'Unit', 'Unit cost (PHP)', 'Amount (PHP)', 'Part']];
    t.boq.forEach(function (l) { lines.push([l.item, l.desc, l.qty, l.unit, l.rate, l.amount, l.group]); });
    lines.push([], ['', 'Estimated direct cost', '', '', '', t.abc.edc.toFixed(2)], ['', 'OCM', '', '', '', t.abc.ocm.toFixed(2)], ['', 'Profit', '', '', '', t.abc.profit.toFixed(2)], ['', 'VAT', '', '', '', t.abc.vat.toFixed(2)], ['', 'Total ABC', '', '', '', t.abc.total.toFixed(2)]);
    return lines.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
  }
  function summaryText(p, q) {
    return 'BUHAY quotation — ' + (p.name || 'Untitled plan') + '\n' + planSummary(p) + '\n' +
      'Start quotation (lean): ' + peso(q.start) + '\nStandard fair estimate: ' + peso(q.fair) + '\nCeiling (flag above): ' + peso(q.ceiling) + '\n' +
      'Basis: DPWH pay items, NSCP 2015, D.O. 197 s. 2016 / D.O. 30 s. 2025 indirect costs; ' + q.priceBasis + '.';
  }

  // ------------------------------------------------------------------ check
  function renderCheck(v) {
    var p = plan(), c = S.check;
    v.innerHTML =
      '<div class="grid2">' +
        '<div class="card stack" id="checkForm">' +
          '<h2>Check a contract</h2>' +
          '<div class="note">Plan being screened: <b>' + esc(p.name || 'Untitled plan') + '</b><br><span class="small muted">' + esc(planSummary(p)) + '</span><br><button type="button" class="btn sm ghost" data-go="quote" style="margin-top:6px">Edit plan</button></div>' +
          '<form class="fields" id="checkFields" onsubmit="return false">' +
            fieldHtml({ k: 'amount', l: 'Contract amount (ABC or awarded)', u: '₱', step: 1000, wide: true }, c.amount, 'c_') +
            fieldHtml({ k: 'cid', l: 'Contract ID', t: 'text', hint: 'optional' }, c.cid, 'c_') +
            fieldHtml({ k: 'lat', l: 'Latitude', step: 0.0001, hint: 'optional' }, c.lat, 'c_') +
            fieldHtml({ k: 'lon', l: 'Longitude', step: 0.0001, hint: 'optional' }, c.lon, 'c_') +
          '</form>' +
          '<details class="more"><summary>Check the ABC markups (OCM, profit, VAT)</summary><form class="fields" id="markupFields" onsubmit="return false" style="margin-top:8px">' +
            fieldHtml({ k: 'edc', l: 'Submitted EDC', u: '₱', step: 1000, wide: true }, c.edc, 'c_') +
            fieldHtml({ k: 'ocm', l: 'OCM', u: '%', step: 0.5 }, c.ocm, 'c_') +
            fieldHtml({ k: 'profit', l: 'Profit', u: '%', step: 0.5 }, c.profit, 'c_') +
            fieldHtml({ k: 'vat', l: 'VAT', u: '%', step: 0.5 }, c.vat, 'c_') +
          '</form></details>' +
          '<div class="row"><span class="small muted">Examples:</span><button type="button" class="btn sm" data-action="example" data-mult="0.98">Fair bid</button><button type="button" class="btn sm" data-action="example" data-mult="1.18">Slightly high</button><button type="button" class="btn sm" data-action="example" data-mult="1.6">Padded</button></div>' +
          '<div class="row"><button type="button" class="btn primary" data-action="save-check">Save to my checks</button><button type="button" class="btn" data-go="map">View on map</button></div>' +
        '</div>' +
        '<div class="stack" id="checkOut"></div>' +
      '</div>' +
      '<div style="height:14px"></div>' +
      '<div class="card stack"><h3>Line-item check</h3><p class="small muted">Paste the contractor\'s bill of quantities as CSV (item, description, unit, quantity, unit cost). Each unit cost is compared with the BUHAY all-in rate (direct cost × location × OCM, profit and VAT).</p>' +
        '<div class="field"><label for="boqText">Contractor BOQ (CSV)</label><div class="in"><textarea id="boqText" spellcheck="false" placeholder="Item,Description,Unit,Quantity,Unit cost"></textarea></div></div>' +
        '<div class="row"><label class="btn sm">Upload CSV<input type="file" id="boqFile" accept=".csv,.txt"></label><button type="button" class="btn sm" data-action="boq-example">Load example</button><button type="button" class="btn sm primary" data-action="boq-compare">Compare unit costs</button></div>' +
        '<div id="boqOut"></div></div>';
    var onC = function (e) { if (!e.target.dataset.key) return; S.check[e.target.dataset.key] = e.target.value; persist(); renderCheckOut(); };
    $('#checkFields').addEventListener('input', onC); $('#markupFields').addEventListener('input', onC);
    $('#boqFile').addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { $('#boqText').value = r.result; compareBoq(); }; r.readAsText(f); });
    renderCheckOut();
  }
  function gauge(val, status) {
    var a = Math.min(100, Math.max(0, val)) / 100, R = 46, C = 2 * Math.PI * R * 0.75;
    var col = { green: 'var(--ok)', amber: 'var(--warn)', red: 'var(--bad)' }[status] || 'var(--accent)';
    return '<svg class="gauge" viewBox="0 0 112 112" role="img" aria-label="BUHAY Risk Index ' + val.toFixed(0) + ' of 100">' +
      '<circle cx="56" cy="56" r="' + R + '" fill="none" stroke="var(--line)" stroke-width="10" stroke-dasharray="' + C + ' 999" transform="rotate(135 56 56)" stroke-linecap="round"/>' +
      '<circle cx="56" cy="56" r="' + R + '" fill="none" stroke="' + col + '" stroke-width="10" stroke-dasharray="' + (C * a) + ' 999" transform="rotate(135 56 56)" stroke-linecap="round"/>' +
      '<text x="56" y="58" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="26" font-weight="600" fill="var(--ink)">' + val.toFixed(0) + '</text>' +
      '<text x="56" y="78" text-anchor="middle" font-size="10" fill="var(--muted)" letter-spacing="1.5">RISK INDEX</text></svg>';
  }
  function strip(q, ml, amount) {
    var W = 520, H = 128, lo = Math.min(q.start, ml ? ml.band[0] : q.start, amount) * 0.9, hi = Math.max(q.ceiling, ml ? ml.band[1] : 0, amount) * 1.06;
    var x = function (v) { return 20 + (v - lo) / (hi - lo) * (W - 40); };
    var tick = function (v, label, y, anchor) { return '<line x1="' + x(v) + '" x2="' + x(v) + '" y1="34" y2="62" stroke="var(--ink)" stroke-width="1"/><text x="' + x(v) + '" y="' + y + '" font-size="11" text-anchor="' + (anchor || 'middle') + '">' + label + '</text>'; };
    var s = '<svg class="strip" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Contract amount compared with BUHAY estimates">' +
      '<rect x="' + x(q.start) + '" y="40" width="' + (x(q.fair * 1.10) - x(q.start)) + '" height="16" fill="var(--ok)" opacity="0.35"/>' +
      '<rect x="' + x(q.fair * 1.10) + '" y="40" width="' + Math.max(0, x(q.ceiling) - x(q.fair * 1.10)) + '" height="16" fill="var(--warn)" opacity="0.45"/>' +
      '<rect x="' + x(q.ceiling) + '" y="40" width="' + (W - 20 - x(q.ceiling)) + '" height="16" fill="var(--bad)" opacity="0.30"/>' +
      tick(q.start, 'Lean ' + pesoM(q.start), 28, 'start') + tick(q.fair, 'Standard ' + pesoM(q.fair), 76) + tick(q.ceiling, 'Ceiling ' + pesoM(q.ceiling), 28, 'end');
    if (ml) s += '<rect x="' + x(ml.band[0]) + '" y="88" width="' + (x(ml.band[1]) - x(ml.band[0])) + '" height="8" rx="4" fill="var(--accent)" opacity="0.5"/><circle cx="' + x(ml.xgb) + '" cy="92" r="4" fill="var(--accent)"/><text x="' + x(ml.xgb) + '" y="112" font-size="11" text-anchor="middle" fill="var(--muted)">ML expected ' + pesoM(ml.xgb) + '</text>';
    s += '<path d="M' + x(amount) + ' 30 L' + (x(amount) - 6) + ' 20 L' + (x(amount) + 6) + ' 20 Z" fill="var(--ink)"/><line x1="' + x(amount) + '" x2="' + x(amount) + '" y1="30" y2="66" stroke="var(--ink)" stroke-width="2.5"/>' +
      '<text x="' + Math.min(W - 60, Math.max(60, x(amount))) + '" y="13" font-size="12" font-weight="700" text-anchor="middle">Contract ' + pesoM(amount) + '</text></svg>';
    return s;
  }
  function renderCheckOut() {
    var out = $('#checkOut'); if (!out) return;
    var p = plan(), q = getQuote(), amount = parseFloat(S.check.amount);
    if (!(amount > 0)) {
      out.innerHTML = '<div class="card stack"><h3>Enter a contract amount</h3><p class="muted">BUHAY compares it with the lean, standard and ceiling estimates of this plan (' + pesoM(q.start) + ' · ' + pesoM(q.fair) + ' · ' + pesoM(q.ceiling) + '), with the historical-model expectation and with the anomaly detector. Use an example button to see a result.</p></div>';
      return;
    }
    var a = E.assess(q, amount), ml = screenFor(p, q, amount);
    var status = ml ? ml.status : (a.status === 'red' ? 'red' : a.status === 'amber' ? 'amber' : 'green');
    if (a.status === 'red') status = 'red';
    var title = { red: 'Over-budget flag', amber: 'For review', green: 'Within the fair range' }[status];
    var lines = [];
    lines.push(pesoM(amount) + ' is <b>' + (a.deviation >= 0 ? pct(a.deviation) + ' above' : pct(-a.deviation) + ' below') + '</b> the BUHAY standard estimate' + (ml ? ' and ' + (ml.mlRatio >= 1 ? pct(ml.mlRatio - 1) + ' above' : pct(1 - ml.mlRatio) + ' below') + ' the historical-model expectation.' : '.'));
    if (a.excessOverCeiling > 0) lines.push('It exceeds the ceiling estimate by <b class="mono">' + peso(a.excessOverCeiling) + '</b>.');
    if (a.status === 'low') lines.push('The amount is well below the fair range. Check that the scope, specifications and quality requirements are complete.');
    var mk = null;
    if (S.check.edc || S.check.ocm || S.check.profit || S.check.vat) {
      var edc = parseFloat(S.check.edc) || q.tiers.standard.abc.edc;
      mk = E.checkMarkups(edc, S.check.ocm !== '' ? parseFloat(S.check.ocm) / 100 : null, S.check.profit !== '' ? parseFloat(S.check.profit) / 100 : null, S.check.vat !== '' ? parseFloat(S.check.vat) / 100 : null);
    }
    var shapHtml = '';
    if (ml) {
      var maxAbs = Math.max.apply(null, ml.shap.map(function (s) { return Math.abs(s.phi); })) || 1;
      shapHtml = '<div class="card stack"><h3>Why the model expects ' + pesoM(ml.xgb) + '</h3><p class="small muted">SHAP values from the XGBoost model: how much each plan feature pushes the expected cost up or down from the average project (' + pesoM(ml.shapBase) + ').</p>' +
        ml.shap.slice(0, 7).map(function (s) {
          var w = Math.abs(s.phi) / maxAbs * 50, left = s.phi >= 0 ? 50 : 50 - w;
          return '<div class="shap-row"><span>' + esc(s.label) + ' <span class="muted mono small">' + fmt(s.value, 2) + '</span></span><div class="shap-bar"><i style="left:' + left + '%;width:' + w + '%;background:' + (s.phi >= 0 ? 'var(--bad)' : 'var(--accent)') + '"></i></div><span class="mono small" style="text-align:right">' + (s.pct >= 0 ? '+' : '') + pct(s.pct, 0) + '</span></div>';
        }).join('') + '</div>';
    }
    out.innerHTML =
      '<div class="verdict ' + status + '">' + gauge(ml ? ml.bri : Math.min(100, Math.max(0, (a.obr - 1) * 100)), status) +
        '<div class="stack" style="gap:6px"><span class="pill ' + status + '">' + title + '</span><h3>' + esc(S.check.cid || p.name || 'Contract') + '</h3><p>' + lines.join(' ') + '</p></div></div>' +
      '<div class="card stack"><svg style="display:none"></svg>' + strip(q, ml, amount) +
        '<div class="metrics">' +
          '<div class="metric"><b>' + a.obr.toFixed(3) + '</b><span>Over-budget ratio (vs. standard)</span></div>' +
          (ml ? '<div class="metric"><b>' + ml.mlRatio.toFixed(3) + '</b><span>Actual ÷ ML expected</span></div><div class="metric"><b>' + ml.iso.toFixed(3) + '</b><span>Isolation Forest score' + (ml.isoAnomalous ? ' (unusual)' : '') + '</span></div><div class="metric"><b>' + ml.bri.toFixed(1) + '</b><span>BUHAY Risk Index (flag ≥ 30)</span></div>' : '') +
        '</div>' +
        (ml ? '<p class="small muted">Primary anomaly driver: <b>' + esc(ml.driver.label) + '</b> (z = ' + ml.driver.z.toFixed(2) + '). Risk index parts: over-budget ' + ml.briParts.obr.toFixed(1) + ' + model residual ' + ml.briParts.ml.toFixed(1) + ' + isolation ' + ml.briParts.iso.toFixed(1) + '.</p>' : '') +
      '</div>' +
      (mk ? '<div class="card stack"><h3>ABC markup check</h3>' + (mk.ok ? '<div class="note">Markups are within the DPWH caps for this EDC bracket (OCM ' + pct(mk.caps.ocm, 0) + ', profit ' + pct(mk.caps.profit, 0) + ', VAT 5%).</div>' : mk.issues.map(function (i) { return '<div class="note bad">' + esc(i) + '</div>'; }).join('')) + '</div>' : '') +
      shapHtml +
      '<div class="card"><div class="viewer" style="height:240px"><canvas id="checkV"></canvas><span class="hint">Model tinted by screening result</span></div></div>' +
      '<div class="note small">BUHAY is a screening tool. A flag means the contract deserves a closer look by the implementing office, COA, the Office of the Ombudsman or the Independent Commission for Infrastructure (EO 94 s. 2025). It is not proof of irregularity.</div>';
    var vw = new Viewer($('#checkV')); vw.set(q.tiers.standard.geometry, status);
  }

  // line-item check against the price book
  var MATCH = [
    [/rebar|reinforc|deformed bar/i, ['rebar', 'rebar_b']], [/form ?work|falsework/i, ['form']],
    [/bored pile/i, ['pile_bore']], [/pile/i, ['pile_rc']], [/girder.*(type ?iv|aashto iv)/i, ['pscg4']], [/girder.*(type ?iii)/i, ['pscg3']],
    [/bearing/i, ['bearing']], [/expansion joint/i, ['expjoint']], [/railing/i, ['rail_steel', 'railing']], [/riprap/i, ['riprap']], [/pccp|portland cement concrete pavement/i, ['pccp']],
    [/lean concrete|seal/i, ['lean']], [/slab on grade/i, ['concsog']], [/concrete/i, ['conc21', 'conc_sub']],
    [/150 ?mm chb|chb.*150|6" ?chb|chb.*6"/i, ['chb150']], [/chb|hollow block/i, ['chb100']], [/plaster/i, ['plaster']], [/paint/i, ['paint']],
    [/excavat/i, ['excav', 'sexc']], [/backfill|embankment/i, ['backfill', 'sbackfill']], [/gravel/i, ['gravel']],
    [/truss|purlin/i, ['truss']], [/roofing|metal sheet|long.?span/i, ['roofing']], [/ceiling/i, ['ceiling']], [/tile/i, ['floortile']],
    [/door/i, ['door']], [/window/i, ['window']], [/structural steel/i, ['steel_b', 'truss']], [/termite|soil poison/i, ['termite']], [/clearing/i, ['clear', 'clear_b']]
  ];
  function matchPrice(code, desc, kind) {
    var c = String(code || '').replace(/^item\s*/i, '').replace(/\s+/g, '').toLowerCase();
    var ids = Object.keys(E.PRICE_BOOK);
    for (var i = 0; i < ids.length; i++) {
      var ref = E.PRICE_BOOK[ids[i]][0].replace(/\s+/g, '').toLowerCase();
      if (c && ref !== '—' && c === ref) return ids[i];
    }
    var text = code + ' ' + desc;
    for (var j = 0; j < MATCH.length; j++) if (MATCH[j][0].test(text)) {
      var cand = MATCH[j][1];
      if (cand.length > 1 && kind === 'bridge') return cand[1];
      return cand[0];
    }
    return null;
  }
  function compareBoq() {
    var text = $('#boqText').value, out = $('#boqOut');
    var rows = IMP.parseCSV(text);
    if (rows.length < 2) { out.innerHTML = '<div class="note warn">Paste at least a header row and one item row.</div>'; return; }
    var head = rows[0].map(function (h) { return h.toLowerCase(); });
    var col = function (re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; };
    var ci = col(/item|code|pay/), di = col(/desc/), ui = col(/^unit$|unit\b(?!.*cost)/), qi = col(/qty|quant/), ri = col(/unit ?cost|unit ?price|rate/);
    if (ri < 0) { out.innerHTML = '<div class="note warn">No unit-cost column found. Name it "Unit cost".</div>'; return; }
    var p = plan(), q = getQuote(), abc = q.tiers.standard.abc;
    var loc = E.PROVINCES[q.plan.province].factor * (E.YEAR_INDEX[q.plan.year] || 1);
    var markup = (1 + abc.ocmRate + abc.profitRate) * (1 + abc.vatRate);
    var flagged = 0, excess = 0;
    var body = rows.slice(1).map(function (r) {
      var rate = parseFloat(String(r[ri] || '').replace(/[₱,\s]/g, '')), qty = qi >= 0 ? parseFloat(String(r[qi]).replace(/,/g, '')) : NaN;
      var id = matchPrice(ci >= 0 ? r[ci] : '', di >= 0 ? r[di] : '', p.kind);
      if (!id || !(rate > 0)) return '<tr><td class="mono small">' + esc(ci >= 0 ? r[ci] : '') + '</td><td>' + esc(di >= 0 ? r[di] : '') + '</td><td class="n">' + (rate > 0 ? fmt(rate) : '') + '</td><td class="n muted">—</td><td class="n muted">—</td><td><span class="pill low">No match</span></td></tr>';
      var base = (S.prices[id] != null ? S.prices[id] : E.PRICE_BOOK[id][3]);
      if (!(base > 0)) return '';
      var allIn = base * loc * markup, ratio = rate / allIn;
      var st = ratio > 1.25 ? 'red' : ratio > 1.10 ? 'amber' : 'green';
      if (st === 'red') { flagged++; if (qty > 0) excess += (rate - allIn * 1.10) * qty; }
      return '<tr><td class="mono small">' + esc(ci >= 0 ? r[ci] : '') + '</td><td>' + esc(di >= 0 ? r[di] : '') + '<div class="small muted">matched: ' + esc(E.PRICE_BOOK[id][1]) + '</div></td><td class="n">' + fmt(rate) + ' / ' + esc(ui >= 0 ? r[ui] : E.PRICE_BOOK[id][2]) + '</td><td class="n">' + fmt(allIn) + '</td><td class="n">' + (ratio >= 1 ? '+' : '') + pct(ratio - 1) + '</td><td><span class="pill ' + st + '">' + { red: 'Overpriced', amber: 'Review', green: 'OK' }[st] + '</span></td></tr>';
    }).join('');
    out.innerHTML = '<div class="note ' + (flagged ? 'bad' : '') + '">' + flagged + ' item' + (flagged === 1 ? '' : 's') + ' priced more than 25% above the BUHAY all-in rate' + (excess > 0 ? '; about <b class="mono">' + peso(excess) + '</b> above a 10% tolerance' : '') + '.</div>' +
      '<div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Item</th><th>Description</th><th class="n">Contractor rate ₱</th><th class="n">BUHAY all-in ₱</th><th class="n">Variance</th><th>Status</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function exampleBoq() {
    var q = getQuote(), t = q.tiers.standard, abc = t.abc, mk = (1 + abc.ocmRate + abc.profitRate) * (1 + abc.vatRate);
    var pad = [1.02, 1.6, 0.97, 1.15, 1.05, 1.9, 1.0, 1.08];
    var lines = ['Item,Description,Unit,Quantity,Unit cost'];
    t.boq.filter(function (l) { return l.unit !== 'l.s.' && matchPrice(l.item, l.desc, q.kind) && E.PRICE_BOOK[matchPrice(l.item, l.desc, q.kind)][3] > 0; }).slice(0, 8).forEach(function (l, i) {
      lines.push(['"' + l.item + '"', '"' + l.desc.replace(/"/g, '') + '"', l.unit, l.qty, (l.rate * mk * pad[i % pad.length]).toFixed(2)].join(','));
    });
    $('#boqText').value = lines.join('\n'); compareBoq();
  }

  // ------------------------------------------------------------------ map
  var map = null;
  function renderMap(v) {
    v.innerHTML =
      '<div class="stack">' +
        '<div class="row" style="justify-content:space-between"><div><h2>Project map</h2><p class="muted small">Bicol Region V · tap a pin to open the project</p></div>' +
          '<div class="row"><div class="seg" role="group" aria-label="Asset filter">' + [['all', 'All'], ['building', 'Buildings'], ['bridge', 'Bridges']].map(function (o) { return '<button type="button" data-mapkind="' + o[0] + '" aria-pressed="' + (S.mapKind === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
          '<div class="field"><div class="in"><select id="mapStatus" aria-label="Risk filter"><option value="all">All risk levels</option><option value="red"' + (S.mapStatus === 'red' ? ' selected' : '') + '>High risk only</option><option value="amber"' + (S.mapStatus === 'amber' ? ' selected' : '') + '>For review only</option><option value="green"' + (S.mapStatus === 'green' ? ' selected' : '') + '>Within range only</option></select></div></div></div></div>' +
        '<div class="note warn small">Demo pins are the simulated research benchmark (SBD-300), not real DPWH contracts. Your saved checks appear with a dark outline.</div>' +
        '<div id="map" role="region" aria-label="Map of screened projects"></div>' +
        '<div class="legend"><span><i style="background:var(--bad)"></i>High risk (BRI ≥ 30)</span><span><i style="background:var(--warn)"></i>For review (20–30)</span><span><i style="background:var(--ok)"></i>Within range</span><span><i style="background:var(--surface);border:2px solid var(--ink)"></i>My checks</span></div>' +
        '<div class="card stack"><h3>Highest risk index</h3><div class="list" id="riskList"></div></div>' +
      '</div>';
    $('#mapStatus').addEventListener('change', function (e) { S.mapStatus = e.target.value; drawMap(); });
    drawMap();
  }
  function allPins() {
    var P = ((DATA.projects && DATA.projects.projects) || []).map(function (p) { return Object.assign({ demo: true }, p); });
    S.checks.forEach(function (c) { if (c.lat && c.lon) P.push({ id: c.cid || c.id, kind: c.plan.kind, label: c.plan.name, province: c.plan.province, year: c.plan.year, lat: +c.lat, lon: +c.lon, plan: c.plan, awarded: c.amount, fair: c.fair, ceiling: c.ceiling, obr: c.obr, bri: c.bri, status: c.status, mine: true, checkId: c.id }); });
    return P.filter(function (p) { return (S.mapKind === 'all' || p.kind === S.mapKind) && (S.mapStatus === 'all' || p.status === S.mapStatus); });
  }
  function drawMap() {
    var el = $('#map'); if (!el || typeof L === 'undefined') return;
    if (map) { map.remove(); map = null; }
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView([13.25, 123.55], 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
    if (DATA.geo) {
      L.geoJSON(DATA.geo, { style: { color: '#1f5fad', weight: 1.2, fillColor: '#1f5fad', fillOpacity: 0.06 },
        onEachFeature: function (f, layer) { layer.bindTooltip(f.properties.name, { sticky: true }); } }).addTo(map);
    }
    var css = getComputedStyle(document.documentElement);
    var COL = { red: css.getPropertyValue('--bad').trim() || '#c22f27', amber: css.getPropertyValue('--warn').trim() || '#b97800', green: css.getPropertyValue('--ok').trim() || '#1d8a4c' };
    var pins = allPins();
    pins.forEach(function (p) {
      var m = L.circleMarker([p.lat, p.lon], { radius: p.mine ? 8 : (p.status === 'red' ? 7 : 5), color: p.mine ? '#13213a' : '#ffffff', weight: p.mine ? 3 : 1, fillColor: COL[p.status] || '#888', fillOpacity: 0.92 });
      m.bindPopup('<b>' + esc(p.label) + '</b><br><span class="mono small">' + esc(p.id) + '</span> · ' + esc(p.province) + ' · ' + p.year +
        '<br>Contract ' + pesoM(p.awarded) + ' · BUHAY standard ' + pesoM(p.fair) + '<br>Over-budget ratio <b>' + Number(p.obr).toFixed(2) + '</b> · Risk index <b>' + Number(p.bri).toFixed(0) + '</b>' +
        (p.demo ? '<br><span class="muted small">Simulated benchmark record</span>' : '') +
        '<br><button type="button" class="btn sm primary" style="margin-top:8px" data-action="open-pin" data-pin="' + esc(p.id) + '">Open in Check</button>');
      m.addTo(map);
    });
    map.whenReady(function () { setTimeout(function () { map.invalidateSize(); }, 50); });
    var top = pins.slice().sort(function (a, b) { return b.bri - a.bri; }).slice(0, 8);
    $('#riskList').innerHTML = top.length ? top.map(function (p) {
      return '<div class="item"><div><b>' + esc(p.label) + '</b><div class="small muted"><span class="mono">' + esc(p.id) + '</span> · ' + esc(p.province) + ' · ratio ' + Number(p.obr).toFixed(2) + ' · ' + pesoM(p.awarded) + '</div></div><div class="row"><span class="pill ' + p.status + '">BRI ' + Number(p.bri).toFixed(0) + '</span><button type="button" class="btn sm" data-action="open-pin" data-pin="' + esc(p.id) + '">Open</button></div></div>';
    }).join('') : '<p class="muted">No projects match the filter.</p>';
  }
  function openPin(id) {
    var p = allPins().concat(((DATA.projects && DATA.projects.projects) || [])).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    var plan2 = Object.assign({}, p.plan, { name: p.label + (p.mine ? '' : ' (' + p.id + ')') });
    S.kind = p.kind; S.plans[p.kind] = plan2;
    S.check = { amount: p.awarded, cid: p.id, lat: p.lat, lon: p.lon, edc: '', ocm: '', profit: '', vat: '' };
    persist(); go('check');
  }

  // ------------------------------------------------------------------ library
  function savedItem(s) {
    var q = getQuote(s.plan);
    return '<div class="item"><div><b>' + esc(s.plan.name) + '</b><div class="small muted">' + esc(planSummary(s.plan)) + ' · start ' + pesoM(q.start) + '</div></div><div class="row"><button type="button" class="btn sm" data-action="use-saved" data-id="' + s.id + '">Use</button><button type="button" class="btn sm ghost" data-action="del-saved" data-id="' + s.id + '" aria-label="Delete">✕</button></div></div>';
  }
  function renderLibrary(v) {
    var ref = function (kind) {
      return E.ARCHETYPES.filter(function (a) { return a.kind === kind; }).map(function (a) {
        var p = fresh(a.id), q = getQuote(p);
        return '<div class="item"><div><b>' + esc(a.name) + '</b><div class="small muted">' + esc(planSummary(p)) + '</div><div class="small mono">Start ' + pesoM(q.start) + ' · standard ' + pesoM(q.fair) + ' · ceiling ' + pesoM(q.ceiling) + '</div></div><button type="button" class="btn sm" data-action="use-ref" data-id="' + a.id + '">Use</button></div>';
      }).join('');
    };
    var ids = Object.keys(E.PRICE_BOOK).filter(function (k) { return E.PRICE_BOOK[k][3] > 0; });
    v.innerHTML =
      '<div class="stack">' +
        '<div class="card stack"><h2>Reference plans</h2><p class="small muted">Previous-plan library: typical configurations of DPWH-implemented school buildings, health facilities, offices, evacuation centers, markets, culverts and bridges. Pick one and adjust it to your project.</p>' +
          '<h3>Buildings</h3><div class="list">' + ref('building') + '</div><h3>Bridges</h3><div class="list">' + ref('bridge') + '</div></div>' +
        '<div class="card stack"><h2>My saved plans</h2>' + (S.saved.length ? '<div class="list">' + S.saved.map(savedItem).join('') + '</div>' : '<p class="muted">Plans you save from the Quote screen appear here, stored on this device.</p>') + '</div>' +
        '<div class="card stack"><h2>My checks</h2>' + (S.checks.length ? '<div class="list">' + S.checks.map(function (c) {
          return '<div class="item"><div><b>' + esc(c.cid || c.plan.name) + '</b><div class="small muted">' + esc(c.plan.name) + ' · ' + pesoM(c.amount) + ' · ratio ' + Number(c.obr).toFixed(2) + '</div></div><div class="row"><span class="pill ' + c.status + '">BRI ' + Number(c.bri).toFixed(0) + '</span><button type="button" class="btn sm" data-action="open-check" data-id="' + c.id + '">Open</button><button type="button" class="btn sm ghost" data-action="del-check" data-id="' + c.id + '" aria-label="Delete">✕</button></div></div>';
        }).join('') + '</div>' : '<p class="muted">Screened contracts you save appear here and on the map.</p>') + '</div>' +
        '<div class="card stack"><div class="row" style="justify-content:space-between"><h2>Unit price book</h2><button type="button" class="btn sm" data-action="reset-prices">Reset to defaults</button></div>' +
          '<p class="small muted">' + esc(E.PRICE_BASIS) + '. Replace these with your office\'s DUPA or the latest regional price data; every quotation updates.</p>' +
          '<div class="tablewrap" style="max-height:460px"><table><thead><tr><th>Pay item</th><th>Description</th><th>Unit</th><th class="n">Rate ₱</th></tr></thead><tbody>' +
          ids.map(function (k) { var b = E.PRICE_BOOK[k], val = S.prices[k] != null ? S.prices[k] : b[3]; return '<tr><td class="mono small">' + esc(b[0]) + '</td><td>' + esc(b[1]) + '</td><td>' + esc(b[2]) + '</td><td class="n"><input type="number" step="1" min="0" data-price="' + k + '" value="' + val + '" aria-label="Rate for ' + esc(b[1]) + '" style="width:110px;text-align:right;font:inherit;border:1px solid var(--line);border-radius:6px;padding:4px 6px;background:' + (S.prices[k] != null ? 'var(--warn-bg)' : 'var(--surface-2)') + ';color:var(--ink)"></td></tr>'; }).join('') +
          '</tbody></table></div></div>' +
        '<div class="card stack"><h2>About BUHAY</h2>' +
          '<p>BUHAY (Buildings-and-Bridges Unit-cost Hybrid Analytics and Yardstick) is the working system of the study <i>BUHAY: A Blueprint-Driven Quantity Take-Off and Hybrid Machine Learning System for Standards-Based Start Quotations and Over-Budget Detection in Public Buildings and Bridges</i>.</p>' +
          '<p class="small">Method: parametric quantity take-off from the plan → DPWH pay items and unit costs → ABC with D.O. 197 s. 2016 / D.O. 30 s. 2025 indirect costs → lean, standard and ceiling tiers. Screening combines the over-budget ratio with an XGBoost cost model (with SHAP explanations), a Multiple Linear Regression baseline and an Isolation Forest into the BUHAY Risk Index.</p>' +
          '<p class="small">Supports SDG 9.1 (resilient infrastructure), SDG 11.5 (disaster-resilient facilities), SDG 16.5, 16.6 and 16.10 (anti-corruption, accountable institutions, access to information), SDG 12.7 (sustainable public procurement) and SDG 4.a (school facilities).</p>' +
          '<p class="small"><b>Lead researcher:</b> Enrique Miguel C. Buban.</p>' +
          '<p class="small muted">Version ' + E.VERSION + '. Data stays on this device. ' + (DATA.models ? 'Models: ' + esc(DATA.models.generated) + '.' : 'Model files not loaded: quotations work, ML screening is off.') + '</p></div>' +
      '</div>';
    v.querySelectorAll('[data-price]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var k = inp.dataset.price, val = parseFloat(inp.value);
        if (val > 0 && val !== E.PRICE_BOOK[k][3]) S.prices[k] = val; else delete S.prices[k];
        store.set('prices', S.prices); quoteCache.key = ''; toast('Rate updated');
        inp.style.background = S.prices[k] != null ? 'var(--warn-bg)' : 'var(--surface-2)';
      });
    });
  }

  // ------------------------------------------------------------------ actions
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-action],[data-kind-set],[data-tier],[data-qtab],[data-mapkind]');
    if (!t) return;
    if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); return; }
    if (t.dataset.kindSet) { S.kind = t.dataset.kindSet; persist(); go('quote'); return; }
    if (t.dataset.tier) { S.tier = t.dataset.tier; renderQuoteOut(); return; }
    if (t.dataset.qtab) { S.qtab = t.dataset.qtab; renderQuoteOut(); return; }
    if (t.dataset.mapkind) { S.mapKind = t.dataset.mapkind; document.querySelectorAll('[data-mapkind]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mapkind === S.mapKind); }); drawMap(); return; }
    var a = t.dataset.action, p = plan(), q;
    if (a === 'new') { S.kind = t.dataset.kind; persist(); go('quote'); }
    else if (a === 'sample-dxf') {
      var text = DATA.sampleDxf;
      if (text) applyImport(IMP.parse('sample-plan.dxf', text), 'sample-plan.dxf');
    }
    else if (a === 'save-plan') {
      var id = 'p' + Date.now().toString(36);
      S.saved.unshift({ id: id, plan: JSON.parse(JSON.stringify(p)), saved: new Date().toISOString() });
      store.set('saved', S.saved); toast('Plan saved to Library');
    }
    else if (a === 'export-csv') { q = getQuote(); download((p.name || 'buhay').replace(/[^\w-]+/g, '_') + '_BOQ_' + S.tier + '.csv', boqCSV(q, q.tiers[S.tier]), 'text/csv'); }
    else if (a === 'export-plan') { download((p.name || 'plan').replace(/[^\w-]+/g, '_') + '.buhay.json', JSON.stringify({ buhay: E.VERSION, plan: p }, null, 2), 'application/json'); }
    else if (a === 'copy-summary') { copyText(summaryText(p, getQuote()), 'Summary copied'); }
    else if (a === 'print') { window.print(); }
    else if (a === 'example') { q = getQuote(); S.check.amount = Math.round(q.fair * parseFloat(t.dataset.mult)); persist(); $('#c_amount').value = S.check.amount; renderCheckOut(); }
    else if (a === 'save-check') {
      var amt = parseFloat(S.check.amount); if (!(amt > 0)) { toast('Enter a contract amount first'); return; }
      q = getQuote(); var as = E.assess(q, amt), ml = screenFor(p, q, amt);
      var st = ml ? ml.status : as.status; if (as.status === 'red') st = 'red';
      S.checks.unshift({ id: 'c' + Date.now().toString(36), cid: S.check.cid, lat: S.check.lat, lon: S.check.lon, amount: amt, plan: JSON.parse(JSON.stringify(p)),
        fair: q.fair, ceiling: q.ceiling, obr: as.obr, bri: ml ? ml.bri : 0, status: st === 'low' ? 'green' : st, saved: new Date().toISOString() });
      store.set('checks', S.checks); toast('Saved to My checks' + (S.check.lat && S.check.lon ? ' and the map' : ''));
    }
    else if (a === 'boq-compare') compareBoq();
    else if (a === 'boq-example') exampleBoq();
    else if (a === 'open-pin') openPin(t.dataset.pin);
    else if (a === 'use-ref') { var r = fresh(t.dataset.id); S.kind = r.kind; S.plans[r.kind] = r; persist(); go('quote'); }
    else if (a === 'use-saved' || a === 'del-saved') {
      var sv = S.saved.filter(function (s) { return s.id === t.dataset.id; })[0];
      if (a === 'use-saved' && sv) { S.kind = sv.plan.kind; S.plans[sv.plan.kind] = JSON.parse(JSON.stringify(sv.plan)); persist(); go('quote'); }
      else { S.saved = S.saved.filter(function (s) { return s.id !== t.dataset.id; }); store.set('saved', S.saved); go(S.view); }
    }
    else if (a === 'open-check' || a === 'del-check') {
      var ck = S.checks.filter(function (c) { return c.id === t.dataset.id; })[0];
      if (a === 'open-check' && ck) { S.kind = ck.plan.kind; S.plans[ck.plan.kind] = JSON.parse(JSON.stringify(ck.plan)); S.check = { amount: ck.amount, cid: ck.cid, lat: ck.lat, lon: ck.lon, edc: '', ocm: '', profit: '', vat: '' }; persist(); go('check'); }
      else { S.checks = S.checks.filter(function (c) { return c.id !== t.dataset.id; }); store.set('checks', S.checks); go(S.view); }
    }
    else if (a === 'reset-prices') { S.prices = {}; store.set('prices', S.prices); quoteCache.key = ''; go('library'); toast('Default rates restored'); }
  });

  // theme
  function applyTheme(t) { if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
  var theme = store.get('theme', 'system'); applyTheme(theme);
  $('#themeBtn').addEventListener('click', function () {
    theme = { system: 'dark', dark: 'light', light: 'system' }[theme]; applyTheme(theme); store.set('theme', theme);
    toast('Theme: ' + theme); if (S.view === 'map') drawMap();
  });

  // install & offline
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; setupInstall(); });
  function setupInstall() {
    var b = $('#installBtn'); if (!b || !deferredInstall) return;
    b.hidden = false;
    b.onclick = function () { deferredInstall.prompt(); deferredInstall.userChoice.then(function () { deferredInstall = null; b.hidden = true; }); };
  }
  if ('serviceWorker' in navigator && !EMBEDDED && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache unavailable */ });
  }

  window.addEventListener('hashchange', function () { var h = location.hash.slice(1); if (h && h !== S.view && TABS.some(function (t) { return t[0] === h; })) go(h); });
  var start = location.hash.slice(1);
  go(TABS.some(function (t) { return t[0] === start; }) ? start : 'home');
}());
