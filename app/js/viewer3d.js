/*
 * BUHAY-AH parametric 3D viewer: builds a building, bridge, airfield or port model straight from the plan
 * geometry returned by the cost engine and draws it on a 2D canvas (orthographic projection,
 * painter's algorithm, flat shading). Drag to orbit, scroll or pinch to zoom, double-tap to reset.
 */
(function (root) {
  'use strict';

  function V(x, y, z) { return [x, y, z]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  function Scene() { this.faces = []; }
  Scene.prototype.face = function (pts, color, alpha) { this.faces.push({ p: pts, c: color, a: alpha == null ? 1 : alpha }); };
  Scene.prototype.box = function (x, y, z, dx, dy, dz, color, alpha) {
    var a = V(x, y, z), b = V(x + dx, y, z), c = V(x + dx, y + dy, z), d = V(x, y + dy, z),
        e = V(x, y, z + dz), f = V(x + dx, y, z + dz), g = V(x + dx, y + dy, z + dz), h = V(x, y + dy, z + dz);
    this.face([a, b, c, d], color, alpha); this.face([e, h, g, f], color, alpha);
    this.face([a, e, f, b], color, alpha); this.face([b, f, g, c], color, alpha);
    this.face([c, g, h, d], color, alpha); this.face([d, h, e, a], color, alpha);
  };
  // square-section member between two points (truss chords, diagonals, railings)
  Scene.prototype.member = function (p1, p2, w, color) {
    var d = norm(sub(p2, p1)), up = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    var u = norm(cross(d, up)), v = norm(cross(d, u)), r = w / 2;
    function off(p, s, t) { return [p[0] + (u[0] * s + v[0] * t) * r, p[1] + (u[1] * s + v[1] * t) * r, p[2] + (u[2] * s + v[2] * t) * r]; }
    var c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      this.face([off(p1, c[i][0], c[i][1]), off(p1, c[j][0], c[j][1]), off(p2, c[j][0], c[j][1]), off(p2, c[i][0], c[i][1])], color);
    }
  };
  Scene.prototype.cylinder = function (cx, cy, z, r, h, color) {
    var n = 10, pts = [];
    for (var i = 0; i < n; i++) pts.push([cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]);
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      this.face([V(a[0], a[1], z), V(b[0], b[1], z), V(b[0], b[1], z + h), V(a[0], a[1], z + h)], color);
    }
    this.face(pts.map(function (p) { return V(p[0], p[1], z + h); }), color);
  };

  var PAL = {
    concrete: '#b9bec6', slab: '#c9ced6', column: '#8c95a3', wall: '#e9e4d8', roof: '#3f6d9e', ground: '#cfd8c4',
    deck: '#9aa1ab', asphalt: '#4a4f57', girder: '#a7aeb8', steel: '#c4561f', water: '#5b9bd5', soil: '#a68b65', rail: '#d9dde3',
    pcc: '#c8ccd2', grass: '#9fbf86', mark: '#ffffff', light: '#e3a51a', rock: '#8d8577', fender: '#26292e', glass: '#8fb8de'
  };
  var TINT = { green: '#2f9e5b', amber: '#e0a100', red: '#d03b2f' };

  function buildBuilding(s, g, tint) {
    var L = g.L, W = g.W, N = g.N, h = g.h, cb = g.colB, H = N * h;
    s.box(-3, -3, -0.12, L + 6, W + 6, 0.12, PAL.ground);
    s.box(0, 0, 0, L, W, 0.10, PAL.slab);
    for (var k = 0; k < N; k++) {
      for (var i = 0; i < g.gx; i++) for (var j = 0; j < g.gy; j++) {
        s.box(i * g.sx - cb / 2, j * g.sy - cb / 2, k * h, cb, cb, h, tint || PAL.column);
      }
      var top = (k + 1) * h;
      if (k < N - 1 || g.roof === 'rc_deck') s.box(-0.3, -0.3, top - g.ts, L + 0.6, W + 0.6, g.ts, PAL.slab);
      else s.box(-0.15, -0.15, top - g.beamD, L + 0.3, W + 0.3, g.beamD, PAL.concrete);
      // exterior walls with a window band
      var sill = k * h + 0.9, head = k * h + Math.max(2.1, h - g.beamD - 0.1);
      [[0, 0, L, 0.15], [0, W - 0.15, L, 0.15]].forEach(function (w) {
        s.box(w[0], w[1], k * h + 0.1, w[2], w[3], sill - k * h - 0.1, PAL.wall);
        s.box(w[0], w[1], head, w[2], w[3], top - g.beamD - head, PAL.wall, 0.95);
      });
      [[0, 0, 0.15, W], [L - 0.15, 0, 0.15, W]].forEach(function (w) {
        s.box(w[0], w[1], k * h + 0.1, w[2], w[3], top - g.beamD - k * h - 0.1, PAL.wall);
      });
    }
    // glazed facade band (terminals) and site works in front of the building: pavement, loading canopy
    if (g.glass) s.box(0.2, -0.05, 0.3, L - 0.4, 0.1, Math.min(H, h) - 0.6, PAL.glass, 0.85);
    if (g.pave > 0) {
      var PL = Math.max(L, 30), PD = g.pave / PL;
      s.box(0, -PD - 1.5, 0, PL, PD, 0.12, PAL.asphalt);
      for (var mx = 3; mx < PL; mx += 3.5) s.box(mx, -6.5, 0.12, 0.12, 5, 0.01, PAL.mark);
      if (g.canopy > 0) {
        var CD = Math.min(PD, g.canopy / PL), ch = 4.2;
        for (var px = 0; px <= PL + 0.01; px += 6) { s.box(px - 0.1, -CD - 1.5, 0, 0.2, 0.2, ch, PAL.column); s.box(px - 0.1, -1.7, 0, 0.2, 0.2, ch, PAL.column); }
        s.box(-0.3, -CD - 1.8, ch, PL + 0.6, CD + 0.6, 0.15, tint || PAL.roof);
      }
    }
    if (g.roof !== 'rc_deck') {
      var o = 0.9, rise = (W / 2 + o) * Math.tan(18 * Math.PI / 180);
      var a = V(-o, -o, H), b = V(L + o, -o, H), c = V(L + o, W + o, H), d = V(-o, W + o, H);
      var r1 = V(-o, W / 2, H + rise), r2 = V(L + o, W / 2, H + rise);
      s.face([a, b, r2, r1], PAL.roof); s.face([d, r1, r2, c], PAL.roof);
      s.face([V(0, 0, H), V(0, W / 2, H + rise - o * Math.tan(18 * Math.PI / 180)), V(0, W, H)], PAL.wall);
      s.face([V(L, 0, H), V(L, W, H), V(L, W / 2, H + rise - o * Math.tan(18 * Math.PI / 180))], PAL.wall);
    } else {
      s.box(-0.3, -0.3, H, L + 0.6, 0.15, 0.9, PAL.concrete); s.box(-0.3, W + 0.15, H, L + 0.6, 0.15, 0.9, PAL.concrete);
      s.box(-0.3, -0.3, H, 0.15, W + 0.6, 0.9, PAL.concrete); s.box(L + 0.15, -0.3, H, 0.15, W + 0.6, 0.9, PAL.concrete);
    }
  }

  function buildBridge(s, g, tint) {
    if (g.type === 'box_culvert') {
      var tw = g.tw, ts = g.tsb, H = g.H, Lb = g.Lb, x = 0;
      s.box(-4, -3, -0.3, g.totalW + 8, Lb + 6, 0.3, PAL.soil);
      s.box(0, 0, 0, g.totalW, Lb, ts, tint || PAL.concrete);
      s.box(0, 0, H + ts, g.totalW, Lb, ts, tint || PAL.concrete);
      for (var c = 0; c <= g.n; c++) { s.box(x, 0, ts, tw, Lb, H, PAL.concrete); x += tw + g.S; }
      s.box(-4, Lb / 2 - g.cw / 2, H + 2 * ts, g.totalW + 8, g.cw, 0.12, PAL.asphalt);
      s.box(tw, -2, 0.05, g.totalW - 2 * tw, Lb + 4, 0.25, PAL.water, 0.7);
      return;
    }
    var Lt = g.Lt, n = g.n, S = g.S, Wd = g.Wd;
    var deckZ = Math.max(g.Hp, g.Ha) + 1.2;
    s.box(-12, -6, -0.4, 12, Wd + 12, deckZ - 0.6, PAL.soil);
    s.box(Lt, -6, -0.4, 12, Wd + 12, deckZ - 0.6, PAL.soil);
    s.box(0, -6, -0.6, Lt, Wd + 12, 0.35, PAL.water, 0.75);
    // abutments
    s.box(-1.5, -0.5, -0.4, 1.5, Wd + 1, deckZ, PAL.concrete);
    s.box(Lt, -0.5, -0.4, 1.5, Wd + 1, deckZ, PAL.concrete);
    // piers
    for (var p = 1; p < n; p++) {
      var px = p * S, colZ = deckZ - (g.gd || 1) - 1.4;
      var nc = g.nc || 2;
      for (var k = 0; k < nc; k++) s.cylinder(px, Wd * (k + 0.5) / nc, -0.4, (g.Dc || 1) / 2, colZ + 0.4, PAL.column);
      s.box(px - 0.75, -0.2, colZ, 1.5, Wd + 0.4, 1.4, PAL.concrete);
    }
    var deckBottom = deckZ - (g.tsd || 0.2);
    if (g.type === 'steel_truss') {
      var Ht = Math.max(5, S / 8), bays = Math.max(4, Math.round(S / 6));
      for (var sp = 0; sp < n; sp++) {
        var x0 = sp * S;
        [0, Wd].forEach(function (y) {
          var bw = S / bays;
          for (var b = 0; b < bays; b++) {
            var xa = x0 + b * bw, xb = xa + bw;
            s.member(V(xa, y, deckZ), V(xb, y, deckZ), 0.35, tint || PAL.steel);
            s.member(V(xa, y, deckZ + Ht), V(xb, y, deckZ + Ht), 0.35, tint || PAL.steel);
            s.member(V(xa, y, deckZ), V(xa, y, deckZ + Ht), 0.25, tint || PAL.steel);
            s.member(b < bays / 2 ? V(xa, y, deckZ) : V(xb, y, deckZ), b < bays / 2 ? V(xb, y, deckZ + Ht) : V(xa, y, deckZ + Ht), 0.25, tint || PAL.steel);
          }
          s.member(V(x0 + S, y, deckZ), V(x0 + S, y, deckZ + Ht), 0.25, tint || PAL.steel);
        });
        for (var b2 = 0; b2 <= bays; b2 += 2) s.member(V(x0 + b2 * S / bays, 0, deckZ + Ht), V(x0 + b2 * S / bays, Wd, deckZ + Ht), 0.2, tint || PAL.steel);
      }
    } else {
      var ng = g.ng || 4, gd = g.gd || 1;
      for (var i = 0; i < ng; i++) {
        var gy = 0.3 + (Wd - 0.6) * (ng === 1 ? 0.5 : i / (ng - 1));
        s.box(0, gy - 0.22, deckBottom - gd + (g.tsd || 0.2), Lt, 0.44, gd - (g.tsd || 0.2), tint || PAL.girder);
      }
    }
    s.box(0, 0, deckBottom, Lt, Wd, g.tsd || 0.2, PAL.deck);
    s.box(0, (Wd - g.cw) / 2, deckZ, Lt, g.cw, 0.05, PAL.asphalt);
    s.box(-12, (Wd - g.cw) / 2, deckZ - 0.6, 10.5, g.cw, 0.62, PAL.asphalt);
    s.box(Lt + 1.5, (Wd - g.cw) / 2, deckZ - 0.6, 10.5, g.cw, 0.62, PAL.asphalt);
    [0.1, Wd - 0.1].forEach(function (y) {
      s.member(V(0, y, deckZ + 1.0), V(Lt, y, deckZ + 1.0), 0.12, PAL.rail);
      for (var x = 0; x <= Lt + 0.01; x += Math.max(2, Lt / 30)) s.member(V(x, y, deckZ), V(x, y, deckZ + 1.0), 0.12, PAL.rail);
    });
  }

  // runway / taxiway / apron: shown with the length compressed so the slab, shoulders and markings stay readable
  function buildAirfield(s, g, tint) {
    var apron = g.facility === 'apron';
    var L = apron ? g.L : Math.min(g.L, Math.max(120, g.W * 8)), W = g.W, sh = g.sh, strip = Math.max(g.strip || 0, W + 2 * sh + 10);
    s.box(-10, -strip / 2, -0.4, L + 20, strip, 0.3, PAL.grass);
    if (sh > 0) s.box(0, -W / 2 - sh, -0.1, L, W + 2 * sh, 0.1, PAL.asphalt);
    s.box(0, -W / 2, -0.1, L, W, Math.max(0.25, g.pcc), tint || PAL.pcc);
    var top = Math.max(0.25, g.pcc) - 0.1;
    if (g.facility === 'runway') {
      for (var x = 8; x < L - 8; x += 12) s.box(x, -0.3, top, 6, 0.6, 0.02, PAL.mark);
      for (var i = 0; i < 6; i++) { var y = -W / 2 + W * (i + 0.5) / 6 - 0.4; s.box(1, y, top, 5, 0.8, 0.02, PAL.mark); s.box(L - 6, y, top, 5, 0.8, 0.02, PAL.mark); }
    } else if (g.facility === 'taxiway') s.box(0, -0.15, top, L, 0.3, 0.02, PAL.light);
    else for (var st = 0; st < Math.max(1, Math.floor(L / 30)); st++) s.box((st + 0.5) * L / Math.max(1, Math.floor(L / 30)) - 0.15, -W / 2 + 4, top, 0.3, W - 8, 0.02, PAL.light);
    if (g.lights) for (var lx = 0; lx <= L; lx += Math.max(4, L / 20)) { s.box(lx, -W / 2 - 0.8, 0, 0.4, 0.4, 0.5, PAL.light); s.box(lx, W / 2 + 0.4, 0, 0.4, 0.4, 0.5, PAL.light); }
    if (g.masts) for (var m = 0; m < g.masts; m++) s.box((m + 0.5) * L / g.masts, W / 2 + 3, 0, 0.6, 0.6, 18, PAL.column);
  }

  // open-type pier or wharf: piles from the seabed to the deck, beams, deck slab, fenders, causeway and RoRo ramp
  function buildPort(s, g, tint) {
    var L = g.L, W = g.W, D = g.depth, dk = g.deck, cw = Math.min(g.causeway || 0, 60);
    s.box(-cw - 10, -10, -D - 1, L + cw + 30, W + 20, 0.6, PAL.soil);
    s.box(-cw - 10, -10, -0.05, L + cw + 30, W + 20, 0.05, PAL.water, 0.45);
    var nB = Math.min(g.nBents, 40), nP = Math.min(g.nPer, 8);
    for (var i = 0; i < nB; i++) for (var j = 0; j < nP; j++) {
      var x = i * L / Math.max(1, nB - 1), y = j * W / Math.max(1, nP - 1);
      if (g.steel) s.cylinder(x, y, -D - 0.5, 0.4, D + dk - 1.1, PAL.column); else s.box(x - 0.3, y - 0.3, -D - 0.5, 0.6, 0.6, D + dk - 1.1, PAL.concrete);
    }
    for (var b = 0; b < nB; b++) s.box(b * L / Math.max(1, nB - 1) - 0.6, -0.3, dk - 1.6, 1.2, W + 0.6, 1.2, PAL.concrete);
    s.box(-0.3, -0.3, dk - 0.4, L + 0.6, W + 0.6, 0.4, tint || PAL.slab);
    var faces = g.facility === 'pier' ? [-0.7, W + 0.3] : [W + 0.3];
    faces.forEach(function (y) { for (var f = 0; f < Math.max(2, Math.ceil(L / 12)); f++) s.box((f + 0.5) * L / Math.max(2, Math.ceil(L / 12)) - 0.6, y, dk - 1.8, 1.2, 0.4, 1.5, PAL.fender); });
    for (var bl = 0; bl < Math.max(2, Math.ceil(L / 15)); bl++) s.cylinder((bl + 0.5) * L / Math.max(2, Math.ceil(L / 15)), W - 0.6, dk, 0.25, 0.6, PAL.steel);
    if (cw > 0) {
      var hb = 0.6 * D + dk;
      s.face([[-cw, -6, -0.6 * D], [0, -6, -0.6 * D], [0, W / 2 - 4, dk], [-cw, W / 2 - 4, dk]], PAL.rock);
      s.face([[-cw, W + 6, -0.6 * D], [-cw, W / 2 + 4, dk], [0, W / 2 + 4, dk], [0, W + 6, -0.6 * D]], PAL.rock);
      s.box(-cw, W / 2 - 4, dk - 0.3, cw, 8, 0.3, PAL.asphalt);
      if (hb < 0) hb = 0;
    }
    if (g.roro) s.face([[L, W / 2 - 4, dk], [L + 18, W / 2 - 4, 0.3], [L + 18, W / 2 + 4, 0.3], [L, W / 2 + 4, dk]], PAL.deck);
  }

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, Math.round(r * f)); g = Math.min(255, Math.round(g * f)); b = Math.min(255, Math.round(b * f));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function Viewer(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.yaw = -0.75; this.pitch = 0.55; this.zoom = 1; this.scene = new Scene();
    var self = this, drag = null, pinch = null;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: self.yaw, pitch: self.pitch }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      self.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
      self.pitch = Math.max(0.05, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.008));
      self.draw();
    });
    canvas.addEventListener('pointerup', function () { drag = null; });
    canvas.addEventListener('pointercancel', function () { drag = null; });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); self.zoom = Math.max(0.4, Math.min(4, self.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); self.draw(); }, { passive: false });
    canvas.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { drag = null; pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: self.zoom }; } }, { passive: true });
    canvas.addEventListener('touchmove', function (e) { if (pinch && e.touches.length === 2) { var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); self.zoom = Math.max(0.4, Math.min(4, pinch.z * d / pinch.d)); self.draw(); } }, { passive: true });
    canvas.addEventListener('touchend', function () { pinch = null; });
    canvas.addEventListener('dblclick', function () { self.yaw = -0.75; self.pitch = 0.55; self.zoom = 1; self.draw(); });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { self.draw(); }).observe(canvas);
  }
  Viewer.prototype.set = function (geometry, tintKey) {
    var s = new Scene(), tint = tintKey ? TINT[tintKey] : null;
    if (geometry.kind === 'bridge') buildBridge(s, geometry, tint);
    else if (geometry.kind === 'airfield') buildAirfield(s, geometry, tint);
    else if (geometry.kind === 'port') buildPort(s, geometry, tint);
    else buildBuilding(s, geometry, tint);
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    s.faces.forEach(function (f) { f.p.forEach(function (p) { for (var i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } }); });
    this.center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    this.radius = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 || 1;
    this.scene = s; this.draw();
  };
  Viewer.prototype.draw = function () {
    var c = this.c, ctx = this.ctx, dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var cen = this.center || [0, 0, 0], k = Math.min(w, h) / (2.15 * this.radius) * this.zoom;
    function proj(p) {
      var x = p[0] - cen[0], y = p[1] - cen[1], z = p[2] - cen[2];
      var x1 = x * cy - y * sy, y1 = x * sy + y * cy;
      var y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
      return [w / 2 + x1 * k, h / 2 - z2 * k, y2];
    }
    var light = norm([-0.4, -0.7, 0.9]);
    var list = this.scene.faces.map(function (f) {
      var P = f.p.map(proj), depth = 0;
      P.forEach(function (q) { depth += q[2]; });
      var nrm = norm(cross(sub(f.p[1], f.p[0]), sub(f.p[2], f.p[0])));
      var l = Math.abs(nrm[0] * light[0] + nrm[1] * light[1] + nrm[2] * light[2]);
      return { P: P, d: depth / P.length, col: shade(f.c, 0.62 + 0.45 * l), a: f.a };
    });
    list.sort(function (a, b) { return b.d - a.d; });
    ctx.lineJoin = 'round';
    list.forEach(function (f) {
      ctx.beginPath(); ctx.moveTo(f.P[0][0], f.P[0][1]);
      for (var i = 1; i < f.P.length; i++) ctx.lineTo(f.P[i][0], f.P[i][1]);
      ctx.closePath();
      ctx.globalAlpha = f.a; ctx.fillStyle = f.col; ctx.fill();
      ctx.globalAlpha = Math.min(1, f.a) * 0.35; ctx.strokeStyle = 'rgba(20,30,45,0.6)'; ctx.lineWidth = 0.6; ctx.stroke();
    });
    ctx.globalAlpha = 1;
  };

  root.BuhayViewer = Viewer;
}(typeof self !== 'undefined' ? self : this));
