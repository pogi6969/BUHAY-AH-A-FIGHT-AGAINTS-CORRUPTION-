/*
 * BUHAY-AH plan import: reads a floor plan in DXF (ASCII, R12–2018) or a BUHAY-AH plan file (.buhay.json)
 * and returns the plan parameters the cost engine needs.
 * DXF: the largest closed polyline is taken as the building outline (footprint area and perimeter);
 * lines and polylines on layers named like WALL / PARTITION are measured as interior walls.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BuhayImport = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UNIT_TO_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };

  function pairs(text) {
    var lines = text.split(/\r?\n/), out = [];
    for (var i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
    return out;
  }

  function shoelace(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  }
  function pathLen(pts, closed) {
    var s = 0, n = pts.length;
    for (var i = 0; i < n - 1 + (closed ? 1 : 0); i++) { var p = pts[i], q = pts[(i + 1) % n]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); }
    return s;
  }

  function parseDXF(text, opts) {
    opts = opts || {};
    var P = pairs(text), units = null, ents = [], i = 0, inEnt = false, cur = null, layers = {};
    for (i = 0; i < P.length; i++) {
      var c = P[i][0], v = P[i][1];
      if (c === 9 && v === '$INSUNITS' && P[i + 1]) units = parseInt(P[i + 1][1], 10);
      if (c === 2 && v === 'ENTITIES') inEnt = true;
      if (c === 0 && v === 'ENDSEC' && inEnt) { if (cur) ents.push(cur); cur = null; inEnt = false; }
      if (!inEnt || (c === 0 && v === 'ENDSEC')) continue;
      if (c === 0) {
        if (cur && cur.type === 'POLYLINE' && v === 'VERTEX') { cur.inVertex = true; continue; }
        if (cur && cur.type === 'POLYLINE' && v === 'SEQEND') { ents.push(cur); cur = null; continue; }
        if (cur) ents.push(cur);
        cur = { type: v, layer: '0', pts: [], flags: 0 };
        continue;
      }
      if (!cur) continue;
      if (c === 8 && !cur.inVertex) { cur.layer = v; layers[v] = (layers[v] || 0) + 1; }
      if (c === 70 && !cur.inVertex) cur.flags = parseInt(v, 10);
      if (c === 10 && !(cur.type === 'POLYLINE' && !cur.inVertex)) cur.pts.push([parseFloat(v), 0]);
      if (c === 20 && cur.pts.length && !(cur.type === 'POLYLINE' && !cur.inVertex)) cur.pts[cur.pts.length - 1][1] = parseFloat(v);
      if (c === 11) cur.end = [parseFloat(v), 0];
      if (c === 21 && cur.end) cur.end[1] = parseFloat(v);
    }
    if (cur) ents.push(cur);

    var polys = [], wallLen = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ents.forEach(function (e) {
      var pts = e.type === 'LINE' && e.end ? [e.pts[0], e.end] : e.pts;
      pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
      var isWall = /wall|partition|pader/i.test(e.layer);
      if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && pts.length >= 3) {
        var first = pts[0], last = pts[pts.length - 1];
        var closed = (e.flags & 1) === 1 || (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6);
        if (closed) polys.push({ pts: pts, area: shoelace(pts), per: pathLen(pts, true), layer: e.layer, wall: isWall });
        else if (isWall) wallLen += pathLen(pts, false);
      } else if (e.type === 'LINE' && isWall && e.end) {
        wallLen += Math.hypot(e.end[0] - e.pts[0][0], e.end[1] - e.pts[0][1]);
      }
    });
    if (!polys.length) throw new Error('No closed polyline found. Draw the building outline as a closed polyline (LWPOLYLINE).');
    polys.sort(function (a, b) { return b.area - a.area; });
    var outline = polys[0];
    polys.slice(1).forEach(function (p) { if (p.wall) wallLen += p.per; });

    var ox = outline.pts.map(function (q) { return q[0]; }), oy = outline.pts.map(function (q) { return q[1]; });
    var oL = Math.max.apply(null, ox) - Math.min.apply(null, ox), oW = Math.max.apply(null, oy) - Math.min.apply(null, oy);
    var extent = Math.max(maxX - minX, maxY - minY);
    var k = UNIT_TO_M[units] || (extent > 500 ? 0.001 : 1);
    var area = outline.area * k * k, per = outline.per * k;
    var interior = wallLen * k;
    if (opts.doubleLineWalls !== false) interior = interior / 2;
    // exterior walls drawn on the wall layer are not interior partitions
    if (interior > per * 0.9) interior -= per; else interior = Math.max(0, interior);
    return {
      source: 'DXF', footprintArea: round(area), perimeter: round(per),
      length: round(Math.max(oL, oW) * k), width: round(Math.min(oL, oW) * k),
      interiorWallLength: round(Math.max(0, interior)),
      units: units ? ({ 1: 'inches', 2: 'feet', 4: 'millimetres', 5: 'centimetres', 6: 'metres' }[units] || 'unit ' + units) : (k === 1 ? 'metres (assumed)' : 'millimetres (assumed)'),
      entities: ents.length, layers: Object.keys(layers), closedPolylines: polys.length
    };
  }

  function round(x) { return Math.round(x * 100) / 100; }

  function parseJSON(text) {
    var o = JSON.parse(text);
    var plan = o.plan || o;
    if (plan.kind !== 'building' && plan.kind !== 'bridge') throw new Error('Plan file needs "kind": "building" or "bridge".');
    plan.source = 'BUHAY-AH plan file';
    return plan;
  }

  function parse(name, text, opts) {
    if (/\.dxf$/i.test(name) || /^\s*0\s*\r?\n\s*SECTION/.test(text)) return Object.assign({ kind: 'building' }, parseDXF(text, opts));
    return parseJSON(text);
  }

  // Minimal CSV reader (quoted fields supported) for contractor BOQs
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',' || ch === '\t') { row.push(f); f = ''; }
      else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (ch !== '\r') f += ch;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  }

  return { parse: parse, parseDXF: parseDXF, parseJSON: parseJSON, parseCSV: parseCSV };
}));
