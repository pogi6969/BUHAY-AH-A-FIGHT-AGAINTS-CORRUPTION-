/*
 * BUHAY-AH in-browser inference for the hybrid ML layer exported by research/pipeline/train.py:
 * Multiple Linear Regression, XGBoost (log cost) with exact TreeSHAP, Isolation Forest,
 * and the BUHAY-AH Risk Index. Works in the browser (window.BuhayML) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BuhayML = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // node layout: [feature, threshold, yes, no, missing, leaf, cover]
  function xgbTree(tree, x) {
    var i = 0, n = tree[0];
    while (n[0] >= 0) {
      var v = x[n[0]];
      i = (v === null || v === undefined || isNaN(v)) ? n[4] : (Math.fround(v) < Math.fround(n[1]) ? n[2] : n[3]);
      n = tree[i];
    }
    return n[5];
  }
  function xgbMargin(model, x) {
    var s = model.base_score;
    for (var t = 0; t < model.trees.length; t++) s += xgbTree(model.trees[t], x);
    return s;
  }

  // ---- exact path-dependent TreeSHAP (Lundberg, Erion & Lee 2018), port of the reference C++
  function extendPath(path, depth, zf, of, fi) {
    path[depth] = { f: fi, z: zf, o: of, w: depth === 0 ? 1 : 0 };
    for (var i = depth - 1; i >= 0; i--) {
      path[i + 1].w += of * path[i].w * (i + 1) / (depth + 1);
      path[i].w = zf * path[i].w * (depth - i) / (depth + 1);
    }
  }
  function unwindPath(path, depth, pi) {
    var of = path[pi].o, zf = path[pi].z, next = path[depth].w;
    for (var i = depth - 1; i >= 0; i--) {
      if (of !== 0) {
        var tmp = path[i].w;
        path[i].w = next * (depth + 1) / ((i + 1) * of);
        next = tmp - path[i].w * zf * (depth - i) / (depth + 1);
      } else {
        path[i].w = path[i].w * (depth + 1) / (zf * (depth - i));
      }
    }
    for (var j = pi; j < depth; j++) { path[j].f = path[j + 1].f; path[j].z = path[j + 1].z; path[j].o = path[j + 1].o; }
  }
  function unwoundSum(path, depth, pi) {
    var of = path[pi].o, zf = path[pi].z, next = path[depth].w, total = 0, i;
    if (of !== 0) {
      for (i = depth - 1; i >= 0; i--) {
        var tmp = next / ((i + 1) * of);
        total += tmp;
        next = path[i].w - tmp * zf * (depth - i);
      }
    } else {
      for (i = depth - 1; i >= 0; i--) total += path[i].w / (zf * (depth - i));
    }
    return total * (depth + 1);
  }
  function copyPath(p, n) { var c = new Array(n); for (var i = 0; i < n; i++) c[i] = { f: p[i].f, z: p[i].z, o: p[i].o, w: p[i].w }; return c; }
  function treeShapRec(tree, x, phi, node, depth, parent, pz, po, pf) {
    var path = copyPath(parent, depth);
    extendPath(path, depth, pz, po, pf);
    var n = tree[node];
    if (n[0] < 0) {
      for (var i = 1; i <= depth; i++) {
        var w = unwoundSum(path, depth, i), el = path[i];
        phi[el.f] += w * (el.o - el.z) * n[5];
      }
      return;
    }
    var v = x[n[0]];
    var hot = (v === null || v === undefined || isNaN(v)) ? n[4] : (Math.fround(v) < Math.fround(n[1]) ? n[2] : n[3]);
    var cold = hot === n[2] ? n[3] : n[2];
    var cover = n[6], hz = tree[hot][6] / cover, cz = tree[cold][6] / cover, iz = 1, io = 1;
    var k = 0;
    for (; k <= depth; k++) if (path[k].f === n[0]) break;
    if (k !== depth + 1) { iz = path[k].z; io = path[k].o; unwindPath(path, depth, k); depth -= 1; }
    treeShapRec(tree, x, phi, hot, depth + 1, path, hz * iz, io, n[0]);
    treeShapRec(tree, x, phi, cold, depth + 1, path, cz * iz, 0, n[0]);
  }
  function treeMean(tree) {
    function rec(i) { var n = tree[i]; if (n[0] < 0) return n[5]; return (tree[n[2]][6] * rec(n[2]) + tree[n[3]][6] * rec(n[3])) / n[6]; }
    return rec(0);
  }
  function shap(model, x) {
    var phi = new Array(x.length).fill(0), base = model.base_score;
    for (var t = 0; t < model.trees.length; t++) {
      treeShapRec(model.trees[t], x, phi, 0, 0, [], 1, 1, -1);
      base += treeMean(model.trees[t]);
    }
    return { base: base, phi: phi };
  }

  // ---- Isolation Forest (scikit-learn semantics)
  function avgPath(n) {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    return 2 * (Math.log(n - 1) + 0.5772156649015329) - 2 * (n - 1) / n;
  }
  function isoScore(iso, z) {
    var zs = z.map(function (v, i) { return (v - iso.mean[i]) / iso.scale[i]; });
    var total = 0;
    iso.trees.forEach(function (t) {
      var i = 0, d = 0;
      while (t.l[i] !== -1) { i = zs[t.f[i]] <= t.t[i] ? t.l[i] : t.r[i]; d++; }
      total += d + avgPath(t.n[i]);
    });
    var score = Math.pow(2, -(total / iso.trees.length) / avgPath(iso.max_samples));
    return { score: score, anomalous: -score - iso.offset < 0, z: zs };
  }

  function bri(cfg, obr, mlRatio, iso) {
    var c = function (v) { return Math.max(0, Math.min(1, v)); };
    var s1 = c((obr - 1) / 0.5), s2 = c((mlRatio - 1) / 0.5), s3 = c((iso - 0.40) / 0.25);
    var w = cfg.weights;
    return { value: 100 * (w.obr * s1 + w.ml * s2 + w.iso * s3), parts: { obr: 100 * w.obr * s1, ml: 100 * w.ml * s2, iso: 100 * w.iso * s3 } };
  }

  // Full screening of one project: features (object), awarded amount, BUHAY-AH standard estimate
  function screen(models, kind, feat, amount, fair) {
    var m = models[kind], x = m.features.map(function (f) { return feat[f]; });
    var mlr = m.mlr.intercept; m.mlr.features.forEach(function (f) { mlr += m.mlr.coef[f] * feat[f]; });
    var logPred = xgbMargin(m.xgb, x), pred = Math.exp(logPred);
    var q = m.residual_quantiles;
    var out = { x: x, mlr: mlr, xgb: pred, band: [pred * Math.exp(q.p10), pred * Math.exp(q.p90)] };
    var sh = shap(m.xgb, x);
    out.shap = m.features.map(function (f, i) { return { feature: f, label: m.labels[f], value: feat[f], phi: sh.phi[i], pct: Math.exp(sh.phi[i]) - 1 }; })
      .sort(function (a, b) { return Math.abs(b.phi) - Math.abs(a.phi); });
    out.shapBase = Math.exp(sh.base);
    if (amount > 0) {
      var mlRatio = amount / pred, obr = amount / fair;
      var z = x.concat([Math.log(mlRatio), Math.log(obr)]);
      var iso = isoScore(m.iforest, z);
      var names = m.iforest.features, zi = 0;
      for (var i = 1; i < iso.z.length; i++) if (Math.abs(iso.z[i]) > Math.abs(iso.z[zi])) zi = i;
      var r = bri(models.bri, obr, mlRatio, iso.score);
      out.mlRatio = mlRatio; out.obr = obr; out.iso = iso.score; out.isoAnomalous = iso.anomalous;
      out.driver = { feature: names[zi], label: (m.labels[names[zi]] || { LogMLRatio: 'XGBoost cost residual', LogOBR: 'Over-budget ratio vs. BUHAY-AH estimate' }[names[zi]]), z: iso.z[zi] };
      out.bri = r.value; out.briParts = r.parts;
      out.status = r.value >= models.bri.flag ? 'red' : r.value >= models.bri.review ? 'amber' : 'green';
    }
    return out;
  }

  return { xgbMargin: xgbMargin, shap: shap, isoScore: isoScore, bri: bri, screen: screen };
}));
