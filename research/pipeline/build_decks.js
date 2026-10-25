/*
 * Builds the two Practical Research 2 (PR2) decks for BUHAY-AH:
 *   BUHAY-AH-PR2-Introduction-Methodology.pptx  (IMRaD, Introduction and Methodology only)
 *   BUHAY-AH-PR2-Full-Research.pptx             (Introduction, Methodology, Results and Discussion,
 *                                                Conclusion, Recommendations, References)
 * Usage: NODE_PATH=<dir with pptxgenjs, react-icons, react, react-dom, sharp> node research/pipeline/build_decks.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa6');

const ROOT = path.resolve(__dirname, '..', '..');
const FIG = path.join(ROOT, 'research', 'figures');
const OUT = [path.join(ROOT, 'docs', 'downloads'), path.join(ROOT, 'research')];
const DR = JSON.parse(fs.readFileSync(path.join(ROOT, 'research', 'outputs', 'design_results.json'), 'utf8'));
const PD = JSON.parse(fs.readFileSync(path.join(ROOT, 'research', 'outputs', 'paper_data.json'), 'utf8'));
const APPLY_THEME = process.env.PPTX_SKILL ? require(path.join(process.env.PPTX_SKILL, 'scripts', 'apply_theme.js')).applyTheme : null;

const TITLE = 'BUHAY-AH: A Budget-to-Blueprint Design Generator, Standards-Based Quantity Take-Off, and Hybrid Machine Learning System for Start Quotations and Over-Budget Detection in Public Buildings and Bridges';
const AUTHOR = 'Enrique Miguel C. Buban';

const THEME = {
  name: 'BUHAY-AH',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '14202E', lt1: 'FFFFFF', dk2: '12345A', lt2: 'EEF2F7',
    accent1: 'E3A51A', accent2: 'B8322A', accent3: '1F7A5A', accent4: '4F7CAC', accent5: '8A5A00', accent6: '6B7A8C',
    hlink: '12345A', folHlink: '4F7CAC'
  }
};
const HEX = THEME.colors;

// ------------------------------------------------------------------ icons
const ICON_CACHE = {};
async function icon(name, color) {
  const key = name + color;
  if (ICON_CACHE[key]) return ICON_CACHE[key];
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(fa[name], { color: '#' + color, size: 256 }));
  const buf = await sharp(Buffer.from(svg)).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  ICON_CACHE[key] = 'image/png;base64,' + buf.toString('base64');
  return ICON_CACHE[key];
}

const DIMS = {};
async function dims(file) {
  if (!DIMS[file]) { const m = await sharp(file).metadata(); DIMS[file] = [m.width, m.height]; }
  return DIMS[file];
}

// ------------------------------------------------------------------ references from the paper builder
function references() {
  const src = fs.readFileSync(path.join(ROOT, 'research', 'pipeline', 'build_paper.py'), 'utf8');
  const a = src.indexOf('REFERENCES = [\n');
  const b = src.indexOf('\n]', a);
  return src.slice(a + 'REFERENCES = [\n'.length, b).split('\n').map(function (l) {
    l = l.trim();
    return l.replace(/^'/, '').replace(/',?$/, '').replace(/\\'/g, "'");
  }).filter(Boolean);
}
function italicRuns(s, base) {
  const parts = s.split('*');
  return parts.map(function (t, i) { return { text: t, options: Object.assign({}, base, { italic: i % 2 === 1 }) }; }).filter(function (r) { return r.text; });
}

// ------------------------------------------------------------------ deck
async function buildDeck(full, fileName) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
  pres.author = AUTHOR;
  pres.title = full ? 'BUHAY-AH — Full Research (PR2)' : 'BUHAY-AH — Introduction and Methodology (PR2)';
  pres.subject = TITLE;
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;
  const W = 13.333;

  // ---------------- layouts
  pres.defineSlideMaster({
    title: 'BUHAY Title',
    background: { color: C.text2 },
    objects: [
      { placeholder: { options: { name: 'kicker', type: 'body', x: 0.7, y: 0.9, w: 7.6, h: 0.4, fontSize: 14, bold: true, color: C.accent1, charSpacing: 3 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 1.35, w: 7.6, h: 1.3, fontSize: 60, bold: true, color: C.background1, fontFace: THEME.headFontFace, align: 'left' }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 2.75, w: 7.4, h: 2.1, fontSize: 17, color: C.background2, valign: 'top' }, text: '' } },
      { placeholder: { options: { name: 'author', type: 'body', x: 0.7, y: 5.3, w: 7.4, h: 1.2, fontSize: 16, color: C.background1, valign: 'top' }, text: '' } }
    ]
  });
  pres.defineSlideMaster({
    title: 'BUHAY Section',
    background: { color: C.text2 },
    objects: [
      { placeholder: { options: { name: 'num', type: 'body', x: 0.7, y: 1.6, w: 4, h: 1.3, fontSize: 80, bold: true, color: C.accent1, fontFace: THEME.headFontFace }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 3.0, w: 11.5, h: 1.1, fontSize: 44, bold: true, color: C.background1, fontFace: THEME.headFontFace, align: 'left' }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 4.2, w: 10.5, h: 1.2, fontSize: 18, color: C.background2, valign: 'top' }, text: '' } }
    ]
  });
  pres.defineSlideMaster({
    title: 'BUHAY Content',
    background: { color: C.background1 },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      { placeholder: { options: { name: 'kicker', type: 'body', x: 0.6, y: 0.28, w: 9, h: 0.32, fontSize: 12, bold: true, color: C.accent5, charSpacing: 2, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.58, w: 12.1, h: 0.8, fontSize: 32, bold: true, color: C.text2, fontFace: THEME.headFontFace, margin: 0, valign: 'middle', align: 'left' }, text: '' } },
      { text: { text: 'BUHAY-AH  ·  ' + AUTHOR + ', Lead Researcher', options: { x: 0.6, y: 7.03, w: 8, h: 0.3, fontSize: 10, color: '6B7A8C', margin: 0 } } }
    ],
    slideNumber: { x: 12.1, y: 7.03, w: 0.6, h: 0.3, fontSize: 10, color: '6B7A8C', align: 'right' }
  });

  // ---------------- helpers
  let sectionTitle = 'Title';
  const sect = function (t) { sectionTitle = t; pres.addSection({ title: t }); };
  const content = function (kicker, title, notes) {
    const s = pres.addSlide({ masterName: 'BUHAY Content', sectionTitle: sectionTitle });
    s.addText(kicker.toUpperCase(), { placeholder: 'kicker' });
    s.addText(title, { placeholder: 'title' });
    if (notes) s.addNotes(notes);
    return s;
  };
  const divider = function (num, title, sub, notes) {
    const s = pres.addSlide({ masterName: 'BUHAY Section', sectionTitle: sectionTitle });
    s.addText(num, { placeholder: 'num' });
    s.addText(title, { placeholder: 'title' });
    s.addText(sub, { placeholder: 'body' });
    if (notes) s.addNotes(notes);
    return s;
  };
  const card = function (s, x, y, w, h, fill, name) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x, y: y, w: w, h: h, rectRadius: 0.08, fill: { color: fill || C.background2 }, line: { type: 'none' }, objectName: name || 'card' });
  };
  const txt = function (s, text, o) {
    s.addText(text, Object.assign({ isTextBox: true, fontSize: 15, color: C.text1, margin: 0, valign: 'top' }, o));
  };
  const iconDot = async function (s, name, x, y, d, fill, fg) {
    s.addShape(pres.shapes.OVAL, { x: x, y: y, w: d, h: d, fill: { color: fill || C.text2 }, line: { type: 'none' }, objectName: 'icon circle' });
    const k = d * 0.52;
    s.addImage({ data: await icon(name, fg || 'FFFFFF'), x: x + (d - k) / 2, y: y + (d - k) / 2, w: k, h: k, objectName: 'icon ' + name, altText: name.replace(/^Fa/, '') + ' icon' });
  };
  const img = async function (s, file, x, y, w, h, opts) {
    const p = path.join(FIG, file);
    let d = await dims(p), data = null;
    if (/^viz_/.test(file)) {
      const cut = Math.round(d[1] * 0.1);
      data = 'image/png;base64,' + (await sharp(p).extract({ left: 0, top: 0, width: d[0], height: d[1] - cut }).png().toBuffer()).toString('base64');
      d = [d[0], d[1] - cut];
    }
    const r = Math.min(w / d[0], h / d[1]);
    const iw = d[0] * r, ih = d[1] * r;
    const ax = (opts && opts.align === 'left') ? x : x + (w - iw) / 2;
    const ay = (opts && opts.valign === 'top') ? y : y + (h - ih) / 2;
    s.addImage(Object.assign(data ? { data: data } : { path: p }, { x: ax, y: ay, w: iw, h: ih, objectName: file, altText: (opts && opts.alt) || file }));
    return { x: ax, y: ay, w: iw, h: ih };
  };
  const eq = async function (s, file, x, y, h, opts) {
    // equation images are rendered at 300 dpi; scale by height so all equations share one type size
    const p = path.join(FIG, 'eq', file);
    const d = await dims(p);
    const scale = (opts && opts.scale) || 1.3;
    let hh = d[1] / 300 * 0.95 * scale, ww = d[0] / 300 * 0.95 * scale;
    if (opts && opts.maxW && ww > opts.maxW) { hh = hh * opts.maxW / ww; ww = opts.maxW; }
    const ax = (opts && opts.center) ? x + ((opts.boxW || 0) - ww) / 2 : x;
    s.addImage({ path: p, x: ax, y: y + Math.max(0, (h - hh) / 2), w: ww, h: hh, objectName: 'equation ' + file, altText: (opts && opts.alt) || 'equation' });
  };
  const bullets = function (items, o) {
    return items.map(function (t, i) {
      const runs = Array.isArray(t) ? t : [{ text: t }];
      return runs.map(function (r, j) {
        const ro = Object.assign({}, r.options || {});
        if (j === 0) Object.assign(ro, { bullet: o && o.numbered ? { type: 'number' } : true, paraSpaceAfter: (o && o.space) || 6 });
        if (j === runs.length - 1 && i < items.length - 1) ro.breakLine = true;
        return { text: r.text, options: ro };
      });
    }).reduce(function (a, b) { return a.concat(b); }, []);
  };
  const B = function (t) { return { text: t, options: { bold: true } }; };
  const T = function (t) { return { text: t }; };
  const tableHead = function (cells) { return cells.map(function (c) { return { text: c, options: { bold: true, color: 'FFFFFF', fill: { color: HEX.dk2 }, fontSize: 13 } }; }); };
  const peso = function (v) { return '₱' + (v / 1e6).toFixed(2) + 'M'; };
  const CHART_TXT = { catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt', legendFontFace: '+mn-lt', dataLabelFontFace: '+mn-lt', titleFontFace: '+mn-lt',
    catAxisLabelColor: '44505E', valAxisLabelColor: '44505E', catAxisLabelFontSize: 12, valAxisLabelFontSize: 12, legendFontSize: 12, dataLabelFontSize: 11,
    valGridLine: { color: 'D5DBE3', size: 0.75 }, catGridLine: { style: 'none' }, titleFontSize: 14, titleColor: '12345A' };

  // =========================================================== TITLE
  {
    pres.addSection({ title: 'Title' });
    const s = pres.addSlide({ masterName: 'BUHAY Title', sectionTitle: sectionTitle });
    s.addText(full ? 'PRACTICAL RESEARCH 2 · FULL RESEARCH' : 'PRACTICAL RESEARCH 2 · INTRODUCTION AND METHODOLOGY', { placeholder: 'kicker' });
    s.addText('BUHAY-AH', { placeholder: 'title' });
    s.addText('A Budget-to-Blueprint Design Generator, Standards-Based Quantity Take-Off, and Hybrid Machine Learning System for Start Quotations and Over-Budget Detection in Public Buildings and Bridges', { placeholder: 'body' });
    s.addText([{ text: AUTHOR, options: { bold: true, breakLine: true } }, { text: 'Lead Researcher', options: { breakLine: true } }, { text: 'Mathematical and Computational Sciences · 2026', options: { color: C.accent1 } }], { placeholder: 'author' });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.75, y: 0.9, w: 4.0, h: 5.7, rectRadius: 0.12, fill: { color: C.background1 }, line: { type: 'none' }, objectName: 'hero frame' });
    await img(s, 'viz_building.png', 8.95, 1.05, 3.6, 2.6, { alt: '3D model of a generated 2-storey school building' });
    await img(s, 'viz_bridge_rcdg.png', 8.95, 3.75, 3.6, 2.7, { alt: '3D model of a three-span RCDG bridge' });
    s.addNotes('Good day. I am Enrique Miguel C. Buban, and this is BUHAY-AH. Buhay means life, because public infrastructure carries lives. This study builds a system that designs public buildings and bridges from a budget, prices them from engineering standards, and flags contracts that are over budget.');
  }

  // =========================================================== OUTLINE
  {
    sect('Overview');
    const s = content('Overview', 'Presentation Outline', 'This presentation follows the IMRaD structure of Practical Research 2.' + (full ? ' We go from Introduction to Methodology, then Results and Discussion, Conclusion and Recommendations.' : ' This deck covers the Introduction and the Methodology.'));
    const parts = full
      ? [['I', 'Introduction', 'Background, gaps, objectives, significance, scope, terms', 'FaBookOpen'], ['F', 'Framework', 'Literature, theoretical and conceptual frameworks', 'FaSitemap'], ['M', 'Methods', 'Design, data, models, validation, app', 'FaGears'], ['R', 'Results', 'Results and discussion of the six research questions', 'FaChartColumn'], ['C', 'Conclusion', 'Conclusions, recommendations and references', 'FaFlagCheckered']]
      : [['I', 'Introduction', 'Background, research gap and rationale, objectives, significance, scope and delimitation, definition of terms', 'FaBookOpen'], ['F', 'Framework', 'Review of related literature, theoretical framework, conceptual framework', 'FaSitemap'], ['M', 'Methodology', 'Research design, locale and data, instruments, procedure, models, validation, ethics', 'FaGears']];
    const n = parts.length, gap = 0.3, w = (12.13 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = 0.6 + i * (w + gap);
      card(s, x, 1.75, w, 4.9, C.background2, 'outline card');
      await iconDot(s, parts[i][3], x + 0.35, 2.1, 0.85, C.text2);
      txt(s, parts[i][0], { x: x + w - 1.15, y: 2.0, w: 0.85, h: 1.0, fontSize: 44, bold: true, color: C.accent1, fontFace: THEME.headFontFace, align: 'right' });
      txt(s, parts[i][1], { x: x + 0.35, y: 3.25, w: w - 0.5, h: 0.9, fontSize: full ? 18 : 20, bold: true, color: C.text2, fontFace: THEME.headFontFace });
      txt(s, parts[i][2], { x: x + 0.35, y: 4.2, w: w - 0.6, h: 2.2, fontSize: 15, color: C.text1 });
    }
  }

  // =========================================================== INTRODUCTION
  sect('Introduction');
  divider('01', 'Introduction', 'Background of the study, research gap and rationale, objective, significance, scope and delimitation, definition of terms', 'We begin with why this study was needed.');

  {
    const s = content('Background of the Study', 'Corruption Hides in the Price', 'Construction is one of the sectors most exposed to corruption. CoST estimates 10 to 30 percent of investment in public infrastructure is lost to corruption, mismanagement and inefficiency. The Philippines scored 32 of 100 in the 2025 Corruption Perceptions Index, ranking 120th of 182. About 20 percent of 545.64 billion pesos in flood-control projects went to 15 contractors. COA found the Cebu City Medical Center building overstated by about 62.64 million pesos, partly because VAT was computed at 12 percent instead of 5 percent.');
    const stats = [['10–30%', 'of public infrastructure investment lost to corruption, mismanagement and inefficiency', 'CoST, n.d.'], ['32 / 100', 'Philippine score in the 2025 Corruption Perceptions Index; 120th of 182', 'Transparency International, 2026'], ['₱545.64B', 'flood-control projects, July 2022 – May 2025; about 20% went to 15 contractors', 'DZRH News, 2025; PCIJ, 2025'], ['₱62.64M', 'overstatement found by COA in the Cebu City Medical Center building', 'Cebu Daily News, 2023']];
    for (let i = 0; i < 4; i++) {
      const x = 0.6 + i * 3.1;
      card(s, x, 1.75, 2.85, 3.6, C.background2);
      txt(s, stats[i][0], { x: x + 0.25, y: 2.0, w: 2.4, h: 0.9, fontSize: 36, bold: true, color: i === 3 ? C.accent2 : C.text2, fontFace: THEME.headFontFace });
      txt(s, stats[i][1], { x: x + 0.25, y: 2.95, w: 2.4, h: 1.8, fontSize: 14 });
      txt(s, stats[i][2], { x: x + 0.25, y: 4.8, w: 2.4, h: 0.4, fontSize: 11, italic: true, color: '6B7A8C' });
    }
    await iconDot(s, 'FaTriangleExclamation', 0.6, 5.7, 0.75, C.accent1, '14202E');
    txt(s, [B('In 2025 a newly opened ₱1.2-billion bridge in Isabela collapsed '), T('less than a month after completion (Philstar, 2025). In Bicol, COA findings on DPWH projects worth ₱13 billion showed that cost checks against an independent estimate happen late, if at all.')], { x: 1.55, y: 5.65, w: 11.1, h: 0.95, fontSize: 15, valign: 'middle' });
  }

  {
    const s = content('Background of the Study', 'Why Buildings and Bridges', 'Buildings and bridges carry a particular weight. School buildings, health stations and evacuation centers are the facilities communities rely on during typhoons; bridges are the links that keep them reachable. Each is priced through a Program of Works and Detailed Unit Price Analysis leading to the ABC. Machine learning can screen many contracts, but it learns from past prices.');
    await img(s, 'viz_building.png', 0.6, 1.65, 3.9, 2.55, { alt: '3D school building' });
    await img(s, 'viz_bridge_truss.png', 0.6, 4.25, 3.9, 2.55, { alt: '3D steel truss bridge' });
    const rows = [['FaSchool', 'Every padded peso is a missing classroom', 'School buildings, health stations and evacuation centers are what communities rely on during typhoons.'], ['FaBridge', 'Bridges keep communities reachable', 'Bicol is in NSCP Seismic Zone 4 and in the path of frequent typhoons; thin bridges fail first.'], ['FaFileInvoiceDollar', 'The ABC is set by the same office', 'Each project gets a Program of Works and an ABC; outsiders have no independent estimate to compare.'], ['FaRobot', 'Machine learning screens many contracts', 'Regression and XGBoost predict cost; CORA screened 11,646 Bicol road contracts (Buban, 2026).']];
    for (let i = 0; i < rows.length; i++) {
      const y = 1.7 + i * 1.28;
      await iconDot(s, rows[i][0], 4.9, y + 0.05, 0.75, C.text2);
      txt(s, rows[i][1], { x: 5.9, y: y, w: 6.8, h: 0.4, fontSize: 18, bold: true, color: C.text2 });
      txt(s, rows[i][2], { x: 5.9, y: y + 0.42, w: 6.8, h: 0.75, fontSize: 15 });
    }
  }

  {
    const s = content('Research Gap and Rationale', 'Five Gaps This Study Closes', 'Five gaps motivate this study. Scope: screening has focused on roads. Reference: data-driven models learn what similar projects have cost, not what they should cost. Validation: detectors are tested where nobody knows the true overpriced cases. Design: communities know only their need and budget. Access: models stay in notebooks.');
    const g = [['FaRoad', 'Scope gap', 'Cost screening research has focused on roads; buildings and bridges have frames, footings, girders and piles.'], ['FaScaleUnbalanced', 'Reference gap', 'Data-driven models learn what projects have cost; if past prices were padded, so is the model.'], ['FaVialCircleCheck', 'Validation gap', 'Anomaly detectors are tested where true overpricing is unknown, so recall cannot be measured.'], ['FaCompassDrafting', 'Design gap', 'Many communities have a need and a budget but no plan, and so no independent price at all.'], ['FaMobileScreen', 'Access gap', 'Models stay in notebooks; barangays, school heads, auditors and reporters need a tool on their phones.']];
    const w = 2.25, gap = 0.22;
    for (let i = 0; i < 5; i++) {
      const x = 0.6 + i * (w + gap);
      card(s, x, 1.75, w, 3.9, C.background2);
      await iconDot(s, g[i][0], x + 0.25, 2.0, 0.75, C.text2);
      txt(s, g[i][1], { x: x + 0.25, y: 2.9, w: w - 0.45, h: 0.45, fontSize: 18, bold: true, color: C.text2 });
      txt(s, g[i][2], { x: x + 0.25, y: 3.4, w: w - 0.45, h: 2.15, fontSize: 14 });
    }
    card(s, 0.6, 5.9, 12.13, 0.85, C.text2);
    txt(s, [{ text: 'Rationale: ', options: { bold: true, color: C.accent1 } }, { text: 'a fair price can be computed from the plan and the standards, then compared with the contract.', options: { color: C.background1 } }], { x: 0.9, y: 5.9, w: 11.6, h: 0.85, fontSize: 17, valign: 'middle' });
  }

  {
    const s = content('Objective of the Study', 'Research Questions', 'This study aimed to develop BUHAY-AH, a budget-to-blueprint design generator, standards-based quantity take-off and hybrid machine-learning system that produces start quotations and detects over-budgeted public buildings and bridges in Bicol Region V. Specifically, it sought to answer six research questions.');
    txt(s, [{ text: 'This study aimed to develop BUHAY-AH, a budget-to-blueprint design generator, standards-based quantity take-off and hybrid machine-learning system that produces start quotations and detects over-budgeted public buildings and bridges in Bicol Region V. ', options: {} }, { text: 'Specifically, it sought to answer the following research questions:', options: { bold: true } }], { x: 0.6, y: 1.55, w: 12.1, h: 0.9, fontSize: 16 });
    const q = ['What plan variables and derived indicators can be extracted from building and bridge plans and engineering standards to estimate construction cost, in terms of physical properties; structural system and foundation; and location and price year?',
      'How can schematic designs be generated from a requirement or a budget, in terms of a modular design library; budget-to-design optimization; and compliance with design and space standards?',
      'How accurately does the standards-based quantity take-off engine estimate construction cost, in terms of the lean start quotation, standard fair estimate and ceiling; and MAPE against fair awarded costs?',
      'How do Multiple Linear Regression and Extreme Gradient Boosting (XGBoost) perform in predicting construction cost, in terms of R², RMSE and MAPE under leave-one-out cross-validation?',
      'How effectively do the over-budget ratio, the XGBoost residual, the Isolation Forest and the hybrid BUHAY-AH Risk Index detect over-budgeted contracts, in terms of precision, recall, F1-score and ROC AUC?',
      'How can the system be deployed as a mobile application with a design studio, a download website, and an explainable interface with floor plans, 3D models and SHAP explanations?'];
    const rq = async function (sl, i, y) {
      card(sl, 0.6, y, 12.13, 1.3, C.background2);
      txt(sl, 'RQ' + (i + 1), { x: 0.85, y: y + 0.15, w: 1.2, h: 1.0, fontSize: 28, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
      txt(sl, q[i], { x: 2.15, y: y + 0.1, w: 10.4, h: 1.1, fontSize: 15, valign: 'middle' });
    };
    for (let i = 0; i < 3; i++) await rq(s, i, 2.55 + i * 1.45);
    const s2 = content('Objective of the Study', 'Research Questions (continued)', 'Questions four to six cover the models, detection and deployment.');
    for (let i = 3; i < 6; i++) await rq(s2, i, 1.65 + (i - 3) * 1.6);
  }

  {
    const s = content('Significance of the Study', 'Who Benefits', 'BUHAY-AH gives anyone with a need, a budget or a plan an itemized, standards-based design and price, and a fast way to see whether a contract amount is defensible.');
    const g = [['FaHelmetSafety', 'DPWH and Implementing Offices', 'Cross-check programs of works and ABCs with an independent take-off before bidding; catch errors such as wrong VAT rates.'], ['FaGavel', 'COA, Ombudsman and ICI', 'Rank contracts by risk and focus field inspections on projects that need them most.'], ['FaSchool', 'LGUs, DepEd and DOH Offices', 'Get a design and a starting quotation from just a requirement or a budget.'], ['FaHandshake', 'Contractors', 'A public reference that rewards fair bids and helps honest bidders defend their price.'], ['FaPeopleGroup', 'Taxpayers, Civil Society, Media', 'Check a project on a phone and see the bill of quantities behind a price.'], ['FaGraduationCap', 'Academe and Future Researchers', 'A reproducible pipeline, a benchmark with known overpricing and an open price book.']];
    for (let i = 0; i < 6; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 0.6 + col * 4.1, y = 1.75 + row * 2.5;
      card(s, x, y, 3.85, 2.25, C.background2);
      await iconDot(s, g[i][0], x + 0.25, y + 0.25, 0.7, C.text2);
      txt(s, g[i][1], { x: x + 1.1, y: y + 0.25, w: 2.6, h: 0.75, fontSize: 16, bold: true, color: C.text2, valign: 'middle' });
      txt(s, g[i][2], { x: x + 0.25, y: y + 1.1, w: 3.4, h: 1.05, fontSize: 14 });
    }
  }

  {
    const s = content('Significance of the Study', 'Alignment with the SDGs', 'SDG 16.5, 16.6 and 16.10: reduce corruption, build accountable institutions and widen public access to information. SDG 9.1 and 11.5: fair pricing protects the quality of resilient infrastructure. SDG 12.7: sustainable public procurement under RA 12009. SDG 4.a: lean quotations stretch school-building funds to more classrooms.');
    const sdg = [['16', 'Peace, Justice and Strong Institutions', '16.5 reduce corruption and bribery; 16.6 accountable institutions; 16.10 public access to information', 'B8322A'], ['9', 'Industry, Innovation and Infrastructure', '9.1 quality, reliable and resilient infrastructure', 'E3A51A'], ['11', 'Sustainable Cities and Communities', '11.5 reduce losses from disasters', '8A5A00'], ['12', 'Responsible Consumption and Production', '12.7 sustainable public procurement (RA 12009)', '1F7A5A'], ['4', 'Quality Education', '4.a build and upgrade education facilities', '4F7CAC']];
    for (let i = 0; i < 5; i++) {
      const x = 0.6 + i * 2.47, w = 2.25;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x, y: 1.75, w: w, h: 4.95, rectRadius: 0.08, fill: { color: sdg[i][3] }, line: { type: 'none' }, objectName: 'SDG ' + sdg[i][0] });
      txt(s, 'SDG ' + sdg[i][0], { x: x + 0.22, y: 1.95, w: w - 0.4, h: 0.9, fontSize: 34, bold: true, color: 'FFFFFF', fontFace: THEME.headFontFace });
      txt(s, sdg[i][1], { x: x + 0.22, y: 2.9, w: w - 0.4, h: 1.2, fontSize: 16, bold: true, color: 'FFFFFF' });
      txt(s, sdg[i][2], { x: x + 0.22, y: 4.2, w: w - 0.4, h: 2.3, fontSize: 14, color: 'FFFFFF' });
    }
  }

  {
    const s = content('Scope and Delimitation', 'What the Study Covers', 'The study covers public buildings and bridges in the six provinces of Bicol Region V, priced from 2022 to 2026. Roads and flood-control structures are excluded. Unit costs are indicative 2025 Albay prices. Generated designs are schematic. The benchmark is simulated because itemized bills of quantities are not publicly available in machine-readable form.');
    card(s, 0.6, 1.75, 5.95, 4.95, C.background2);
    await iconDot(s, 'FaCircleCheck', 0.85, 1.95, 0.7, C.accent3);
    txt(s, 'Covers', { x: 1.75, y: 1.95, w: 4.5, h: 0.7, fontSize: 22, bold: true, color: C.text2, valign: 'middle' });
    txt(s, bullets(['Public buildings: schools, government offices, health facilities, multi-purpose halls and evacuation centers, covered courts, dormitories, public markets', 'Bridges: RC box culverts, RC deck girders (RCDG), prestressed concrete girders (PSCG), steel trusses; spread footings, driven piles, bored piles', 'Six Bicol provinces: Albay, Camarines Norte, Camarines Sur, Catanduanes, Masbate, Sorsogon; price years 2022–2026', 'Plan input by dimensions, reference plans, DXF outlines and generated designs']), { x: 0.85, y: 2.8, w: 5.5, h: 3.8, fontSize: 14 });
    card(s, 6.78, 1.75, 5.95, 4.95, C.background2);
    await iconDot(s, 'FaCircleXmark', 7.03, 1.95, 0.7, C.accent2);
    txt(s, 'Delimitations', { x: 7.93, y: 1.95, w: 4.5, h: 0.7, fontSize: 22, bold: true, color: C.text2, valign: 'middle' });
    txt(s, bullets(['Roads, flood control, water supply, ports, land acquisition, right-of-way, design and supervision fees, furniture and equipment are excluded', 'Unit costs are indicative 2025 Albay prices with location factors and a yearly index', 'Generated designs are schematic, for estimating only; licensed architects and engineers must develop them', 'Models are trained and validated on a 300-project simulated benchmark (SBD-300); a flag is not evidence of wrongdoing']), { x: 7.03, y: 2.8, w: 5.5, h: 3.8, fontSize: 14 });
  }

  {
    const s = content('Definition of Terms', 'Key Terms', 'These terms are defined conceptually and operationally to ensure a common understanding of the key concepts.');
    const rows = [['Approved Budget for the Contract (ABC)', 'The ceiling price a procuring entity sets; computed as EDC plus OCM, profit and 5% VAT under DPWH D.O. 197 s. 2016 and D.O. 30 s. 2025.'], ['Lean Start Quotation', 'The lowest code-compliant price of a plan: minimum NSCP reinforcement and basic finishes; the recommended starting price.'], ['Standard Fair Estimate', 'The ABC at typical DPWH design intensities; the reference for the over-budget ratio.'], ['Ceiling Estimate', 'The highest price that can still be defended for a plan; contracts above it are flagged.'], ['Over-Budget Ratio (OBR)', 'Contract amount divided by the standard fair estimate.'], ['BUHAY-AH Risk Index (BRI)', 'A 0–100 score combining the OBR, XGBoost residual and anomaly score; 30 or more is flagged.'], ['Budget-to-Design Optimization', 'The search for the largest facility whose quotation fits a budget, keeping Pareto-efficient designs.'], ['Quantity Take-Off (QTO)', 'Measuring the work quantities of a plan, such as cubic metres of concrete and kilograms of steel.'], ['SHAP', 'Shapley additive explanations; splits a prediction into each feature’s contribution.']];
    const data = [tableHead(['Term', 'Operational definition'])].concat(rows.map(function (r) { return [{ text: r[0], options: { bold: true, color: HEX.dk2 } }, r[1]]; }));
    s.addTable(data, { x: 0.6, y: 1.6, w: 12.13, colW: [3.4, 8.73], fontSize: 12.5, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, fill: { color: 'FFFFFF' }, valign: 'middle', margin: [0.04, 0.1, 0.04, 0.1], rowH: 0.5, objectName: 'terms table' });
  }

  // =========================================================== FRAMEWORK
  sect('Framework');
  divider('02', 'Framework', 'Review of related literature, theoretical framework, conceptual framework', 'Next, the literature and the frameworks that guided the study.');

  {
    const s = content('Review of Related Literature', 'What Earlier Studies Found', 'Regression has long been used for early cost estimates. Tree ensembles and parametric models are now the standard tools. Isolation Forest detects anomalies without labels. CORA combined MLR, XGBoost and Isolation Forest on Bicol road contracts. None of these says what a project should cost, and none was validated where overpricing is known.');
    const rows = [['Mahamid (2011)', 'Multiple regression, road projects', 'Early cost estimates from a few variables', 'Roads only'], ['Elmousalami (2020)', 'Review of AI and parametric cost models', 'Tree ensembles lead in accuracy', 'Learns from past prices'], ['Coffie & Cudjoe (2024)', 'XGBoost + SHAP', 'Predicts cost overruns with explanations', 'No reference price'], ['Larocque et al. (2025)', 'Explainable ML, 11,646 road contracts', 'Accurate, explainable road cost estimates', 'Roads only'], ['Liu et al. (2008)', 'Isolation Forest', 'Unsupervised anomaly detection by short paths', 'Misses ordinary-looking padding'], ['Buban (2026), CORA', 'MLR, XGBoost, Isolation Forest, Bicol roads', 'R² 0.8723, MAPE 29.20%; three flags', 'Recall unknown, roads only'], ['GAO (2020); Flyvbjerg et al. (2002)', 'Should-cost estimating; cost underestimation', 'Bottom-up estimates expose misrepresentation', 'No open tool']];
    const data = [tableHead(['Study', 'Method', 'Finding', 'Gap for this study'])].concat(rows.map(function (r) { return [{ text: r[0], options: { bold: true, color: HEX.dk2 } }, r[1], r[2], { text: r[3], options: { color: HEX.accent2 } }]; }));
    s.addTable(data, { x: 0.6, y: 1.6, w: 12.13, colW: [2.9, 3.2, 3.4, 2.63], fontSize: 13, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', margin: [0.05, 0.1, 0.05, 0.1], rowH: 0.6, objectName: 'literature table' });
  }

  {
    const s = content('Theoretical Framework', 'Five Theories Behind BUHAY-AH', 'Agency Theory explains why padding happens: information asymmetry between the public and implementers. Should-Cost Theory says a fair price can be built bottom-up. Optimization Theory chooses the best design under a budget. Statistical Learning Theory guides the models. Cooperative Game Theory gives the Shapley value behind SHAP.');
    await img(s, 'diagram_theoretical.png', 0.6, 1.6, 12.13, 4.5, { alt: 'Theoretical paradigm: five theories feeding BUHAY-AH' });
    txt(s, [B('Agency (Jensen & Meckling, 1976) · Should-Cost (GAO, 2020) · Optimization (Pareto, 1906; Nemhauser & Wolsey, 1988) · Statistical Learning (Vapnik, 1998) · Cooperative Games (Shapley, 1953)')], { x: 0.6, y: 6.25, w: 12.13, h: 0.55, fontSize: 13, color: '44505E', align: 'center', valign: 'middle' });
  }

  {
    const s = content('Conceptual Framework', 'Input–Process–Output–Feedback', 'Inputs are a requirement, a budget, or a plan, plus the standards, the price book and past projects. The process generates designs, performs the take-off, prices the quotation tiers, trains the models and scores the risk. Outputs are designs, quotations, flags and the app. Feedback updates the price book and thresholds.');
    await img(s, 'diagram_conceptual.png', 0.6, 1.6, 12.13, 5.2, { alt: 'Conceptual paradigm: input, process, output, feedback' });
  }

  // =========================================================== METHODOLOGY
  sect('Methodology');
  divider('03', 'Methodology', 'Research design, locale and data, instruments, procedure, models, validation and ethical considerations', 'Now the methodology, which is where Mathematical and Computational Sciences does the work.');

  {
    const s = content('Research Design', 'Quantitative Developmental Design', 'This is a quantitative developmental research design with a simulation-based computational experiment, following the approach of the Mathematical and Computational Sciences. Four kinds of mathematics work together: deterministic modeling, combinatorial optimization, statistical and machine learning, and Monte Carlo simulation.');
    txt(s, 'A quantitative developmental design with a simulation-based computational experiment: the problem is expressed as mathematical models, solved as algorithms and validated with statistics.', { x: 0.6, y: 1.55, w: 12.13, h: 0.75, fontSize: 16 });
    const k = [['FaCalculator', 'Deterministic modeling', 'Quantity take-off and ABC from NSCP, DPWH and AASHTO'], ['FaPuzzlePiece', 'Combinatorial optimization', 'Budget-to-design integer program and Pareto filter'], ['FaChartLine', 'Statistical and machine learning', 'MLR, XGBoost, Isolation Forest, SHAP'], ['FaDice', 'Monte Carlo simulation', 'SBD-300 benchmark with known overpricing']];
    for (let i = 0; i < 4; i++) {
      const x = 0.6 + i * 3.1;
      card(s, x, 2.45, 2.85, 2.0, C.background2);
      await iconDot(s, k[i][0], x + 0.22, 2.65, 0.65, C.text2);
      txt(s, k[i][1], { x: x + 1.0, y: 2.6, w: 1.75, h: 0.75, fontSize: 15, bold: true, color: C.text2, valign: 'middle' });
      txt(s, k[i][2], { x: x + 0.22, y: 3.45, w: 2.45, h: 0.95, fontSize: 13.5 });
    }
    await img(s, 'diagram_method.png', 0.6, 4.65, 12.13, 2.2, { alt: 'Methodological paradigm' });
  }

  {
    const s = content('Research Locale and Data Sources', 'Bicol Region V, Standards and Prices', 'The locale is Bicol Region V: six provinces with location factors. The data sources are engineering standards, DPWH pay items and unit costs for 2025, reference plans and the simulated benchmark.');
    const prov = [['Albay', '1.00', '0.90 (2022)'], ['Camarines Sur', '1.00', '0.94 (2023)'], ['Camarines Norte', '1.03', '0.97 (2024)'], ['Sorsogon', '1.03', '1.00 (2025)'], ['Masbate', '1.10', '1.03 (2026)'], ['Catanduanes', '1.12', '—']];
    const data = [tableHead(['Province', 'Location factor', 'Cost index'])].concat(prov.map(function (r) { return [{ text: r[0], options: { bold: true, color: HEX.dk2 } }, { text: r[1], options: { align: 'right' } }, { text: r[2], options: { align: 'right' } }]; }));
    s.addTable(data, { x: 0.6, y: 1.65, w: 5.6, colW: [2.4, 1.5, 1.7], fontSize: 14, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', margin: [0.05, 0.1, 0.05, 0.1], rowH: 0.48, objectName: 'locale table' });
    txt(s, 'Location factors and yearly cost index bring each price to 2025 Albay levels.', { x: 0.6, y: 5.2, w: 5.6, h: 0.6, fontSize: 13, italic: true, color: '6B7A8C' });
    card(s, 6.5, 1.65, 6.23, 5.15, C.background2);
    await iconDot(s, 'FaBookBookmark', 6.75, 1.85, 0.65, C.text2);
    txt(s, 'Standards codified', { x: 7.6, y: 1.85, w: 4.9, h: 0.65, fontSize: 18, bold: true, color: C.text2, valign: 'middle' });
    txt(s, bullets(['NSCP 2015 Vol. I (buildings); AASHTO LRFD 9th ed. (bridges)', 'DPWH Standard Specifications Vol. II (2013) and Vol. III (2019)', 'DPWH D.O. 197 s. 2016 and D.O. 30 s. 2025 (indirect costs)', 'PD 1096, BP 344 accessibility, RA 9514 fire code', 'DepEd Educational Facilities Manual; DOH AO 2016-0042; Sphere', 'BUHAY-AH price book: DPWH pay items and 2025 unit costs']), { x: 6.75, y: 2.65, w: 5.8, h: 4.0, fontSize: 14 });
  }

  {
    const s = content('Research Instruments', 'Plan Variables Extracted', 'The instruments are the BUHAY-AH plan reader, cost engine and models. Nine variables describe a building and eleven a bridge. A DXF outline is read with the shoelace formula for area and perimeter; walls drawn on WALL or PARTITION layers are measured.');
    const rowsB = [['Gross floor area, footprint', 'm²'], ['Number of storeys', '—'], ['Structural span (bay)', 'm'], ['Floor-to-floor height', 'm'], ['Facility type, roof system', 'category'], ['Location factor, cost index', 'factor']];
    const rowsR = [['Total length, span length', 'm'], ['Deck width, deck area', 'm, m²'], ['Pier and abutment heights', 'm'], ['Superstructure type', 'category'], ['Foundation type, pile length', 'category, m'], ['Location factor, cost index', 'factor']];
    const mk = function (rows, head) { return [tableHead([head, 'Unit'])].concat(rows.map(function (r) { return [r[0], { text: r[1], options: { align: 'center' } }]; })); };
    s.addTable(mk(rowsB, 'Building variables (9)'), { x: 0.6, y: 1.65, w: 5.9, colW: [4.4, 1.5], fontSize: 14, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', margin: [0.05, 0.1, 0.05, 0.1], rowH: 0.46, objectName: 'building variables' });
    s.addTable(mk(rowsR, 'Bridge variables (11)'), { x: 6.83, y: 1.65, w: 5.9, colW: [4.4, 1.5], fontSize: 14, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', margin: [0.05, 0.1, 0.05, 0.1], rowH: 0.46, objectName: 'bridge variables' });
    card(s, 0.6, 5.15, 12.13, 1.6, C.background2);
    await iconDot(s, 'FaFileImport', 0.85, 5.45, 0.8, C.accent1, '14202E');
    txt(s, [B('Plan sources: '), T('dimensions typed in, 19 reference plans, generated designs, or a DXF file. The largest closed polyline is the outline; area and perimeter come from the shoelace formula; walls on WALL or PARTITION layers are measured, and $INSUNITS sets the scale.')], { x: 1.9, y: 5.3, w: 10.6, h: 1.3, fontSize: 15, valign: 'middle' });
  }

  {
    const s = content('Data Gathering Procedure', 'Design Generation from a Budget', 'When there is no plan, BUHAY-AH builds one from 55 space modules sized to DepEd, DOH, National Building Code and DSWD norms. Modules are laid out in rows along corridors and across floors. For a budget, the best design maximizes capacity subject to the ABC fitting the budget, the length fitting the lot and the storeys within the limit. Because cost is not monotonic in capacity, the solver enumerates every combination and keeps the Pareto-efficient designs.');
    txt(s, bullets([[B('55 space modules '), T('(7 × 9 m DepEd classroom, 6-bed ward, 20-person evacuation bay…) laid out in rows and floors')], [B('41 building + 13 bridge templates, '), T('customizable and combinable as wings')], [B('Budget-to-design: '), T('maximize capacity κ subject to ABC ≤ budget, length ≤ lot, storeys ≤ limit')], [B('Exhaustive enumeration + Pareto filter, '), T('because cost jumps with new stairs, floors and footings')]], { space: 8 }), { x: 0.6, y: 1.6, w: 5.6, h: 3.4, fontSize: 15 });
    card(s, 0.6, 5.05, 5.6, 1.75, C.background2);
    await eq(s, 'opt.png', 0.75, 5.15, 0.7, { maxW: 5.3, alt: 'Budget-to-design integer program' });
    await eq(s, 'pareto.png', 0.75, 5.9, 0.7, { maxW: 5.3, alt: 'Pareto dominance' });
    await img(s, 'plan_school_gf.png', 6.5, 1.6, 6.23, 2.6, { alt: 'Generated ground floor plan of a 2-storey 6-classroom school' });
    await img(s, 'plan_evac.png', 6.5, 4.3, 6.23, 2.5, { alt: 'Generated plan of an evacuation center for 200 persons' });
  }

  {
    const s = content('Data Gathering Procedure', 'Quantity Take-Off and Quotation', 'The engine lays out the column grid, sizes footings from the service load and allowable soil bearing, computes concrete, reinforcement, formwork, masonry, roofing, finishes and MEPF, multiplies each quantity by its DPWH unit cost, and applies OCM, profit and 5% VAT by bracket. It runs three times: lean, standard and ceiling.');
    card(s, 0.6, 1.65, 6.0, 2.65, C.background2);
    txt(s, 'Estimated direct cost and ABC', { x: 0.85, y: 1.8, w: 5.5, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    await eq(s, 'edc.png', 0.85, 2.25, 0.85, { alt: 'EDC equation' });
    await eq(s, 'abc.png', 0.85, 3.2, 0.85, { alt: 'ABC equation' });
    card(s, 0.6, 4.5, 6.0, 2.3, C.background2);
    txt(s, 'Structural quantities from engineering formulas', { x: 0.85, y: 4.62, w: 5.5, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    await eq(s, 'footing.png', 0.85, 5.05, 0.95, { alt: 'Footing width' });
    await eq(s, 'rebar.png', 3.6, 5.05, 0.95, { alt: 'Reinforcing steel' });
    txt(s, 'Footing width from load and soil bearing; steel from volume × intensity.', { x: 0.85, y: 6.1, w: 5.5, h: 0.55, fontSize: 13, color: '44505E' });
    const tiers = [tableHead(['Setting', 'Lean (start)', 'Standard', 'Ceiling']), ['Reinforcement factor τ', '0.80', '1.00', '1.25'], ['Structural steel factor', '0.92', '1.00', '1.15'], ['Floor finish', 'Cement topping', 'Ceramic tiles', 'Porcelain / granite'], ['MEPF allowance factor', '0.85', '1.00', '1.25'], ['Mobilization / OSH', '1.0% / 1.0%', '1.2% / 1.5%', '1.5% / 2.0%'], ['Scope contingency', '—', '—', '8% of works']];
    s.addTable(tiers, { x: 6.85, y: 1.65, w: 5.88, colW: [2.1, 1.3, 1.2, 1.28], fontSize: 13, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', margin: [0.05, 0.08, 0.05, 0.08], rowH: 0.5, objectName: 'tier table' });
    const ind = [tableHead(['EDC bracket', 'OCM', 'Profit']), ['Up to ₱5 million', '15%', '10%'], ['₱5M – ₱50M', '12%', '8%'], ['₱50M – ₱150M', '10%', '8%'], ['Above ₱150M', '8%', '8%']];
    s.addTable(ind, { x: 6.85, y: 5.35, w: 5.88, colW: [2.9, 1.5, 1.48], fontSize: 12, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', margin: [0.02, 0.08, 0.02, 0.08], rowH: 0.29, objectName: 'indirect cost table' });
  }

  {
    const s = content('Data Gathering Procedure', 'Simulated Benchmark SBD-300', 'To measure recall, the truly overpriced contracts must be known. SBD-300 has 160 buildings and 140 bridges, each priced by the engine plus hidden variation the plan does not show, then bid competition, and in 36 projects deliberate overpricing of 20 to 110 percent.');
    const st = [['300', 'simulated projects'], ['160', 'buildings'], ['140', 'bridges'], ['36', 'injected overpricing']];
    for (let i = 0; i < 4; i++) {
      const x = 0.6 + i * 3.1;
      card(s, x, 1.65, 2.85, 1.55, i === 3 ? C.text2 : C.background2);
      txt(s, st[i][0], { x: x + 0.25, y: 1.72, w: 2.4, h: 0.85, fontSize: 40, bold: true, color: i === 3 ? C.accent1 : C.text2, fontFace: THEME.headFontFace });
      txt(s, st[i][1], { x: x + 0.25, y: 2.6, w: 2.4, h: 0.45, fontSize: 15, color: i === 3 ? C.background1 : C.text1 });
    }
    card(s, 0.6, 3.45, 6.0, 3.35, C.background2);
    txt(s, 'Awarded cost', { x: 0.85, y: 3.6, w: 5.5, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    await eq(s, 'sim.png', 0.85, 4.05, 0.8, { maxW: 5.5, alt: 'Simulated awarded cost' });
    txt(s, bullets(['η: lognormal bid competition (fair bids slightly below standard)', 'μ = 1 for fair projects; 1.20–1.40 moderate, 1.40–2.10 severe padding']), { x: 0.85, y: 5.0, w: 5.55, h: 1.7, fontSize: 14 });
    card(s, 6.85, 3.45, 5.88, 3.35, C.background2);
    txt(s, 'Hidden variation the plan cannot see', { x: 7.1, y: 3.6, w: 5.4, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    txt(s, bullets(['Unit prices ±7% per project', 'Reinforcement ±10%, concrete ±6%', 'MEPF ±8%, earthworks +5–15%', 'Pile lengths 0.95–1.35 × planned', 'Provinces weighted by size; award years 2022–2025']), { x: 7.1, y: 4.1, w: 5.4, h: 2.6, fontSize: 14 });
  }

  {
    const s = content('Data Analysis', 'Model Development', 'Multiple Linear Regression is the interpretable baseline, with VIF used to remove multicollinear predictors above 10. XGBoost is trained on the logarithm of cost with randomized hyperparameter search. Isolation Forest scores how unusual a contract is from its plan features, log cost and residual. SHAP explains every prediction.');
    const m = [['Multiple Linear Regression', 'mlr.png', 'Interpretable baseline; VIF > 10 removed', 'vif.png'], ['XGBoost', 'xgb.png', 'Regularized trees on log cost; randomized search, 5-fold CV', null], ['Isolation Forest', 'iforest.png', 'Short average path → unusual contract', null], ['SHAP (Shapley values)', 'shap.png', 'Exact TreeSHAP, also run on the phone', null]];
    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 0.6 + col * 6.2, y = 1.65 + row * 2.62;
      card(s, x, y, 5.93, 2.4, C.background2);
      txt(s, m[i][0], { x: x + 0.25, y: y + 0.15, w: 5.4, h: 0.42, fontSize: 18, bold: true, color: C.text2 });
      if (m[i][3]) {
        await eq(s, m[i][1], x + 0.25, y + 0.62, 0.95, { maxW: 3.0 });
        await eq(s, m[i][3], x + 3.5, y + 0.62, 0.95, { maxW: 2.2 });
      } else {
        await eq(s, m[i][1], x + 0.25, y + 0.62, 0.95, { maxW: 5.4 });
      }
      txt(s, m[i][2], { x: x + 0.25, y: y + 1.75, w: 5.4, h: 0.5, fontSize: 14, color: '44505E' });
    }
  }

  {
    const s = content('Data Analysis', 'The BUHAY-AH Risk Index', 'Three signals are combined: the over-budget ratio weighted 0.5 because it does not depend on past prices, the XGBoost residual weighted 0.3, and the Isolation Forest score weighted 0.2. A BRI of 30 or more is a flag; 20 to 30 is for review.');
    card(s, 0.6, 1.65, 7.4, 5.15, C.background2);
    txt(s, 'Over-budget ratio', { x: 0.85, y: 1.8, w: 6.9, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    await eq(s, 'obr.png', 0.85, 2.2, 0.9);
    txt(s, 'Risk index and signal scaling', { x: 0.85, y: 3.25, w: 6.9, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    await eq(s, 'bri.png', 0.85, 3.7, 0.8, { maxW: 6.9 });
    await eq(s, 'bri_s.png', 0.85, 4.6, 0.9, { maxW: 6.9 });
    txt(s, 'Each signal is clipped to [0, 1]; the over-budget signal does not inherit padding from past prices.', { x: 0.85, y: 5.75, w: 6.9, h: 0.8, fontSize: 14, color: '44505E' });
    const band = [['0 – 20', 'Fair', C.accent3], ['20 – 30', 'Review', C.accent1], ['30 – 100', 'Flag for review by COA, Ombudsman, ICI', C.accent2]];
    for (let i = 0; i < 3; i++) {
      const y = 1.65 + i * 1.75;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.25, y: y, w: 4.48, h: 1.5, rectRadius: 0.08, fill: { color: band[i][2] }, line: { type: 'none' }, objectName: 'BRI band ' + band[i][1] });
      txt(s, 'BRI ' + band[i][0], { x: 8.5, y: y + 0.15, w: 4.0, h: 0.6, fontSize: 24, bold: true, color: i === 1 ? '14202E' : 'FFFFFF', fontFace: THEME.headFontFace });
      txt(s, band[i][1], { x: 8.5, y: y + 0.78, w: 4.0, h: 0.6, fontSize: 15, color: i === 1 ? '14202E' : 'FFFFFF' });
    }
  }

  {
    const s = content('Data Analysis and Statistical Treatment', 'Validation and Metrics', 'Models were validated by leave-one-out cross-validation: each project is predicted by a model trained without it. Cost prediction is measured by RMSE, R² and MAPE. Detection is measured against the injected labels with precision, recall, F1-score and ROC AUC. Generated designs are checked against space standards; search time is recorded.');
    const m = [['Leave-one-out cross-validation', 'Each of the 300 projects is predicted by a model that never saw it; honest error on a small sample.', null], ['Cost prediction', 'Typical error in pesos, share of variance explained, and error as a percentage of each project’s cost.', ['rmse.png', 'r2.png', 'mape.png']], ['Detection', 'Against the 36 injected cases; threshold-free ROC AUC.', ['prf.png']], ['Design generation', 'Space-standard checks passed; budget used; search time in milliseconds.', null]];
    card(s, 0.6, 1.65, 12.13, 1.0, C.background2);
    await iconDot(s, 'FaArrowsRotate', 0.8, 1.8, 0.7, C.text2);
    txt(s, [B(m[0][0] + ': '), T(m[0][1])], { x: 1.7, y: 1.65, w: 10.9, h: 1.0, fontSize: 15, valign: 'middle' });
    card(s, 0.6, 2.85, 12.13, 1.85, C.background2);
    txt(s, [B(m[1][0] + ': '), T(m[1][1])], { x: 0.85, y: 2.95, w: 11.6, h: 0.45, fontSize: 15 });
    await eq(s, 'rmse.png', 0.85, 3.45, 1.1, { maxW: 3.6 });
    await eq(s, 'r2.png', 4.85, 3.45, 1.1, { maxW: 3.2 });
    await eq(s, 'mape.png', 8.45, 3.45, 1.1, { maxW: 3.9 });
    card(s, 0.6, 4.9, 7.2, 1.9, C.background2);
    txt(s, [B(m[2][0] + ': '), T(m[2][1])], { x: 0.85, y: 5.0, w: 6.8, h: 0.5, fontSize: 15 });
    await eq(s, 'prf.png', 0.85, 5.6, 0.95, { maxW: 6.7 });
    card(s, 8.05, 4.9, 4.68, 1.9, C.background2);
    txt(s, [B(m[3][0] + ': '), T(m[3][1])], { x: 8.3, y: 5.0, w: 4.2, h: 1.7, fontSize: 15 });
  }

  {
    const s = content('Data Gathering Procedure', 'App and Website Development', 'A single JavaScript cost engine is shared by the app, the website and the research pipeline. The trained XGBoost trees and Isolation Forest are exported to JSON and evaluated in the browser with exact TreeSHAP; parity with Python is within 1e-5 in log cost. The app is a progressive web app, packaged for Android with Capacitor through GitHub Actions, and offered as an offline ZIP and a download website.');
    await img(s, 'diagram_architecture.png', 0.6, 1.6, 12.13, 2.95, { alt: 'System architecture' });
    const t = [['FaPython', 'Python research pipeline', 'NumPy, scikit-learn, statsmodels, XGBoost, SHAP'], ['FaJs', 'One JavaScript engine', 'Same take-off and models in app, site and paper'], ['FaAndroid', 'Android + offline', 'PWA, Capacitor APK, offline ZIP'], ['FaCode', 'Float32 parity', 'Math.fround thresholds; SHAP within 1e-5']];
    for (let i = 0; i < 4; i++) {
      const x = 0.6 + i * 3.1;
      card(s, x, 4.75, 2.85, 2.05, C.background2);
      await iconDot(s, t[i][0], x + 0.22, 4.95, 0.65, C.text2);
      txt(s, t[i][1], { x: x + 1.0, y: 4.9, w: 1.75, h: 0.75, fontSize: 15, bold: true, color: C.text2, valign: 'middle' });
      txt(s, t[i][2], { x: x + 0.22, y: 5.8, w: 2.45, h: 0.9, fontSize: 13.5 });
    }
  }

  {
    const s = content('Ethical Considerations', 'Risk, Safety and Responsible Use', 'The study involves no human participants, animals, hazardous materials or devices. All data are simulated or drawn from public documents. Results are screening signals, not findings of wrongdoing; generated designs are schematic. Personal information is not collected.');
    const g = [['FaUserShield', 'No human participants', 'No surveys, interviews or personal data; a purely computational study.'], ['FaDatabase', 'Public and simulated data', 'Standards, price items and news reports are public; the benchmark is simulated.'], ['FaScaleBalanced', 'Flags are not verdicts', 'A high BRI calls for review by the implementing office, COA, Ombudsman or ICI.'], ['FaCompassDrafting', 'Schematic designs', 'Designs are for estimating; licensed architects and engineers must develop them.']];
    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 0.6 + col * 6.2, y = 1.7 + row * 2.6;
      card(s, x, y, 5.93, 2.35, C.background2);
      await iconDot(s, g[i][0], x + 0.3, y + 0.3, 0.85, C.text2);
      txt(s, g[i][1], { x: x + 1.4, y: y + 0.3, w: 4.3, h: 0.6, fontSize: 19, bold: true, color: C.text2, valign: 'middle' });
      txt(s, g[i][2], { x: x + 1.4, y: y + 0.95, w: 4.3, h: 1.2, fontSize: 15 });
    }
  }

  // =========================================================== RESULTS (full deck only)
  if (full) {
    sect('Results and Discussion');
    divider('04', 'Results and Discussion', 'Findings for the six research questions, on the simulated benchmark SBD-300', 'Results are presented in the order of the research questions. All accuracy and detection results are from the simulated benchmark.');

    {
      const s = content('RQ1 · Plan Variables', 'What the Benchmark Contains', 'The 160 buildings ranged from 116.6 to 1,990.8 square metres, one to four storeys, priced from 5.37 to 56.77 million pesos. The 140 bridges ranged from 2.0 to 189.5 metres, priced from 1.00 to 179.23 million pesos. Schools and RC deck girders dominate, as in the real program.');
      s.addChart(pres.charts.BAR, [{ name: 'Buildings', labels: ['School buildings', 'Multi-purpose / evacuation', 'Health facilities', 'Public markets', 'Government offices', 'Dormitories'], values: [67, 22, 22, 20, 19, 10] }], Object.assign({}, CHART_TXT, { x: 0.6, y: 1.6, w: 6.0, h: 3.6, barDir: 'bar', chartColors: [HEX.dk2], showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: '14202E', showLegend: false, showTitle: true, title: 'Buildings by type (n = 160)', catAxisOrientation: 'maxMin', valAxisHidden: true, valGridLine: { style: 'none' }, objectName: 'buildings by type chart', altText: 'Bar chart of buildings by type' }));
      s.addChart(pres.charts.BAR, [{ name: 'Bridges', labels: ['RC deck girder', 'PSC girder', 'RC box culvert', 'Steel truss'], values: [70, 31, 24, 15] }], Object.assign({}, CHART_TXT, { x: 6.85, y: 1.6, w: 5.88, h: 3.6, barDir: 'bar', chartColors: [HEX.accent1], showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: '14202E', showLegend: false, showTitle: true, title: 'Bridges by superstructure (n = 140)', catAxisOrientation: 'maxMin', valAxisHidden: true, valGridLine: { style: 'none' }, objectName: 'bridges by type chart', altText: 'Bar chart of bridges by superstructure' }));
      const st = [['₱5.37M – ₱56.77M', 'building contract range'], ['672.3 m²', 'mean building GFA'], ['₱1.00M – ₱179.23M', 'bridge contract range'], ['40.9 m', 'mean bridge length']];
      for (let i = 0; i < 4; i++) {
        const x = 0.6 + i * 3.1;
        card(s, x, 5.4, 2.85, 1.4, C.background2);
        txt(s, st[i][0], { x: x + 0.2, y: 5.5, w: 2.5, h: 0.65, fontSize: 20, bold: true, color: C.text2, fontFace: THEME.headFontFace });
        txt(s, st[i][1], { x: x + 0.2, y: 6.15, w: 2.5, h: 0.5, fontSize: 14 });
      }
    }

    {
      const s = content('RQ2a · Modular Design Library', 'Designs Without a Blueprint', 'From 55 space modules the generator produced 41 building templates and 13 bridge templates, from a 149-square-metre barangay health station to a 3,024-square-metre multi-storey facility. All 152 applicable space-standard checks passed.');
      await img(s, 'app_design_templates.png', 0.6, 1.6, 7.6, 5.2, { alt: 'Design studio with the template library' });
      const st = [['55', 'reusable space modules'], ['41 + 13', 'building and bridge templates'], ['152 / 152', 'space-standard checks passed'], ['7', 'facility uses: school, health, office, evacuation, market, dorm, court']];
      for (let i = 0; i < 4; i++) {
        const y = 1.6 + i * 1.32;
        card(s, 8.45, y, 4.28, 1.18, C.background2);
        txt(s, st[i][0], { x: 8.65, y: y + 0.1, w: 1.9, h: 0.95, fontSize: 28, bold: true, color: C.text2, fontFace: THEME.headFontFace, valign: 'middle' });
        txt(s, st[i][1], { x: 10.55, y: y + 0.1, w: 2.05, h: 0.95, fontSize: 13.5, valign: 'middle' });
      }
    }

    {
      const s = content('RQ2a · Generated Plans', 'Schematic Floor Plans', 'The 2-storey 6-classroom school comes out 38.5 by 9.5 metres with 732 square metres of floor area, a lean start quotation of 16.25 million and a standard estimate of 18.77 million pesos. The hospital places wards on a double-loaded corridor; the market is folded into parallel rows so no row exceeds 48 metres.');
      await img(s, 'plan_school_gf.png', 0.6, 1.6, 6.0, 2.45, { alt: '2-storey 6-classroom school ground floor' });
      await img(s, 'plan_hospital_gf.png', 6.73, 1.6, 6.0, 2.45, { alt: '25-bed hospital ground floor' });
      txt(s, '2-storey 6-classroom school · 38.5 × 9.5 m · 732 m² · start ₱16.25M · standard ₱18.77M', { x: 0.6, y: 4.1, w: 6.0, h: 0.5, fontSize: 12, color: '44505E', align: 'center' });
      txt(s, '25-bed community hospital (2-storey) · 30 × 12.4 m · 744 m² · start ₱19.52M', { x: 6.73, y: 4.1, w: 6.0, h: 0.5, fontSize: 12, color: '44505E', align: 'center' });
      await img(s, 'plan_market.png', 0.6, 4.65, 6.0, 2.15, { alt: 'Public market plan' });
      await img(s, 'plan_court.png', 6.73, 4.65, 6.0, 2.15, { alt: 'Covered court plan' });
    }

    {
      const s = content('RQ2b · Budget-to-Design Optimization', 'What a Budget Can Build', 'With 10 million pesos the solver returns a 4-classroom school; with 25 million, 9 classrooms in 2 storeys; with 50 million, 15 classrooms in 4 storeys on a 60-metre lot. Allowing multi-storey designs added an average of 6.4 and up to 10 classrooms for the same budget. Searches finished in a median of 3.6 milliseconds.');
      const F = DR.frontier.filter(function (f) { return (f.budget / 1e6) % 4 === 0; });
      const labels = F.map(function (f) { return String(f.budget / 1e6); });
      s.addChart(pres.charts.LINE, [1, 2, 3, 4].map(function (n) { return { name: 'Up to ' + n + (n === 1 ? ' storey' : ' storeys'), labels: labels, values: F.map(function (f) { return f['n' + n]; }) }; }), Object.assign({}, CHART_TXT, { x: 0.6, y: 1.6, w: 7.6, h: 5.2, chartColors: [HEX.accent6, HEX.accent4, HEX.accent1, HEX.dk2], lineSize: 2.5, lineDataSymbol: 'none', showLegend: true, legendPos: 'b', showTitle: true, title: 'Classrooms that fit a budget (PHP million, lot ≤ 60 m)', valAxisMinVal: 0, valAxisMaxVal: 16, valAxisMajorUnit: 4, objectName: 'frontier chart', altText: 'Line chart of classrooms against budget by storey limit' }));
      const st = [['4', 'classrooms for ₱10M (1 storey)'], ['9', 'classrooms for ₱25M (2 storeys)'], ['15', 'classrooms for ₱50M (4 storeys)'], ['3.6 ms', 'median search time; +6.4 classrooms on average with multi-storey']];
      for (let i = 0; i < 4; i++) {
        const y = 1.6 + i * 1.32;
        card(s, 8.45, y, 4.28, 1.18, C.background2);
        txt(s, st[i][0], { x: 8.65, y: y + 0.1, w: 1.55, h: 0.95, fontSize: 28, bold: true, color: C.text2, fontFace: THEME.headFontFace, valign: 'middle' });
        txt(s, st[i][1], { x: 10.25, y: y + 0.1, w: 2.35, h: 0.95, fontSize: 13.5, valign: 'middle' });
      }
    }

    {
      const s = content('RQ2c · Bridge Type Selection', 'Cheapest Bridge for Each Gap', 'Culverts were cheapest up to 12 metres; multi-span RC deck girders were the lowest-cost option from 20 to 120 metres at these prices, because pier costs stay modest on spread footings. Prestressed girders and trusses become competitive when piers are costly, such as deep rivers.');
      const rows = DR.bridgeSel.map(function (b) { return [b.gap + ' m', b.type, b.spans + ' × ' + (b.gap / b.spans).toFixed(1) + ' m', { text: peso(b.fair), options: { align: 'right' } }, { text: '₱' + Math.round(b.perM / 1000).toLocaleString('en-US') + 'k', options: { align: 'right' } }]; });
      s.addTable([tableHead(['Gap', 'Lowest-cost design', 'Spans', 'Standard', 'Per m'])].concat(rows), { x: 0.6, y: 1.6, w: 6.6, colW: [0.9, 2.5, 1.2, 1.1, 0.9], fontSize: 13, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', margin: [0.04, 0.08, 0.04, 0.08], rowH: 0.5, objectName: 'bridge selection table' });
      await img(s, 'elev_rcdg60.png', 7.45, 1.6, 5.28, 1.6, { alt: 'Three-span RCDG elevation' });
      await img(s, 'elev_truss45.png', 7.45, 3.35, 5.28, 1.7, { alt: 'Steel truss elevation' });
      await img(s, 'elev_bc3.png', 7.45, 5.2, 5.28, 1.6, { alt: 'Box culvert elevation' });
    }

    {
      const s = content('RQ3 · Standards-Based Engine', 'Accuracy of the Quantity Take-Off', 'Against fair awarded costs, the standard estimate reached a MAPE of 5.21 percent for buildings and 7.67 percent for bridges, R-squared 0.9799 and 0.9801, less than half the error of the best data-driven model. The lean start quotation was at or below the fair award for 94.3 percent of buildings and 81.5 percent of bridges; the ceiling covered 100 and 88.7 percent.');
      const st = [['5.21%', 'MAPE, buildings'], ['7.67%', 'MAPE, bridges'], ['0.98', 'R², both asset classes']];
      for (let i = 0; i < 3; i++) {
        const y = 1.6 + i * 1.75;
        card(s, 0.6, y, 3.6, 1.55, C.background2);
        txt(s, st[i][0], { x: 0.85, y: y + 0.12, w: 3.2, h: 0.85, fontSize: 40, bold: true, color: C.text2, fontFace: THEME.headFontFace });
        txt(s, st[i][1], { x: 0.85, y: y + 0.98, w: 3.2, h: 0.45, fontSize: 15 });
      }
      s.addChart(pres.charts.BAR, [{ name: 'Buildings', labels: ['Lean ≤ fair award', 'Ceiling covers fair award', 'Average lean saving'], values: [94.3, 100, 14.4] }, { name: 'Bridges', labels: ['Lean ≤ fair award', 'Ceiling covers fair award', 'Average lean saving'], values: [81.5, 88.7, 5.9] }], Object.assign({}, CHART_TXT, { x: 4.5, y: 1.6, w: 8.23, h: 5.2, barDir: 'col', barGrouping: 'clustered', chartColors: [HEX.dk2, HEX.accent1], showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.0"%"', dataLabelColor: '14202E', showLegend: true, legendPos: 'b', showTitle: true, title: 'Quotation tiers against fair awarded costs (%)', valAxisMinVal: 0, valAxisMaxVal: 110, valAxisMajorUnit: 20, valAxisHidden: true, valGridLine: { style: 'none' }, objectName: 'tier accuracy chart', altText: 'Clustered column chart of tier coverage' }));
    }

    {
      const s = content('RQ3 · Reference Plans', 'Quotations for the 19 Reference Plans', 'The three tiers for selected reference plans in Albay at 2025 prices. The lean start quotation is 5 to 15 percent below standard, larger for buildings because finishes and MEPF carry more of the cost.');
      const sel = PD.arche.filter(function (a) { return ['sb-1s2c', 'sb-2s4c', 'sb-3s9c', 'sb-4s12c', 'bhs', 'rhu-2s', 'evac-600', 'office-2s', 'market-1s', 'rcdg-12', 'rcdg-60', 'pscg-60', 'truss-50'].indexOf(a.id) >= 0; });
      const rows = sel.map(function (a) { return [a.name, { text: peso(a.start), options: { align: 'right', bold: true, color: HEX.dk2 } }, { text: peso(a.fair), options: { align: 'right' } }, { text: peso(a.ceiling), options: { align: 'right' } }, { text: ((1 - a.start / a.fair) * 100).toFixed(1) + '%', options: { align: 'right' } }]; });
      s.addTable([tableHead(['Reference plan', 'Lean (start)', 'Standard', 'Ceiling', 'Saving'])].concat(rows), { x: 0.6, y: 1.55, w: 12.13, colW: [6.13, 1.6, 1.5, 1.5, 1.4], fontSize: 12.5, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', margin: [0.02, 0.1, 0.02, 0.1], rowH: 0.37, objectName: 'reference quotations table' });
    }

    {
      const s = content('RQ4 · Machine-Learning Models', 'Regression and XGBoost under LOOCV', 'Under leave-one-out cross-validation, regression reached R-squared 0.8112 and MAPE 13.43 percent for buildings, and 0.8640 and 65.65 percent for bridges. XGBoost reached 0.7874 and 13.94 percent for buildings, and 0.8630 and 19.18 percent for bridges. For buildings, cost is close to linear in floor area; for bridges, XGBoost captures type interactions. Deck area was removed for multicollinearity (VIF 44.40).');
      s.addChart(pres.charts.BAR, [{ name: 'Multiple Linear Regression', labels: ['Buildings', 'Bridges'], values: [13.43, 65.65] }, { name: 'XGBoost', labels: ['Buildings', 'Bridges'], values: [13.94, 19.18] }], Object.assign({}, CHART_TXT, { x: 0.6, y: 1.6, w: 6.6, h: 5.2, barDir: 'col', barGrouping: 'clustered', chartColors: [HEX.accent6, HEX.dk2], showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.00"%"', dataLabelColor: '14202E', showLegend: true, legendPos: 'b', showTitle: true, title: 'MAPE under LOOCV (lower is better)', valAxisHidden: true, valGridLine: { style: 'none' }, valAxisMinVal: 0, valAxisMaxVal: 75, objectName: 'MAPE chart', altText: 'MAPE of MLR and XGBoost by asset class' }));
      const rows = [tableHead(['LOOCV', 'Buildings', 'Bridges']), [{ text: 'MLR R²', options: { bold: true } }, '0.8112', '0.8640'], [{ text: 'MLR MAPE', options: { bold: true } }, '13.43%', '65.65%'], [{ text: 'XGBoost R²', options: { bold: true } }, '0.7874', '0.8630'], [{ text: 'XGBoost MAPE', options: { bold: true } }, '13.94%', { text: '19.18%', options: { bold: true, color: HEX.accent3 } }]];
      s.addTable(rows, { x: 7.45, y: 1.6, w: 5.28, colW: [2.1, 1.59, 1.59], fontSize: 14, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.75, color: 'D5DBE3' }, valign: 'middle', align: 'center', margin: [0.05, 0.1, 0.05, 0.1], rowH: 0.48, objectName: 'LOOCV table' });
      card(s, 7.45, 4.25, 5.28, 2.55, C.background2);
      txt(s, bullets([[B('Buildings: '), T('each m² of GFA adds about ₱20,379 (t = 8.68); regression as good as XGBoost')], [B('Bridges: '), T('deck area (VIF 44.40) removed; XGBoost cuts MAPE from 65.65% to 19.18%')]], { space: 8 }), { x: 7.7, y: 4.4, w: 4.85, h: 2.3, fontSize: 14 });
    }

    {
      const s = content('RQ4 · Explanations', 'What Drives Cost: SHAP', 'For buildings, gross floor area dominates, with mean absolute SHAP of 0.343 in log cost, far above storeys and location. For bridges the picture is broader: deck area, pile length, total length and foundation type all matter. SHAP shows every reviewer why the expected cost is what it is.');
      await img(s, 'shap_building.png', 0.6, 1.6, 6.0, 4.6, { alt: 'SHAP values, buildings' });
      await img(s, 'shap_bridge.png', 6.73, 1.6, 6.0, 4.6, { alt: 'SHAP values, bridges' });
      txt(s, 'Buildings: GFA dominates (mean |SHAP| = 0.343)', { x: 0.6, y: 6.3, w: 6.0, h: 0.45, fontSize: 14, color: '44505E', align: 'center' });
      txt(s, 'Bridges: deck area, pile length, total length, foundation', { x: 6.73, y: 6.3, w: 6.0, h: 0.45, fontSize: 14, color: '44505E', align: 'center' });
    }

    {
      const s = content('RQ5 · Detection', 'Catching Over-Budgeted Contracts', 'Across all 300 projects, the BUHAY-AH Risk Index caught 34 of 36 padded contracts, recall 0.944, with the highest F1-score of 0.764 and AUC of 0.987. The Isolation Forest alone caught only 27.8 percent, because a padded ordinary building does not look unusual in its plan features. For buildings alone, the Risk Index reached an F1 of 0.927.');
      const lab = ['Standards rule', 'XGBoost residual', 'Isolation Forest', 'Risk Index'];
      s.addChart(pres.charts.BAR, [{ name: 'Recall', labels: lab, values: [0.833, 0.667, 0.278, 0.944] }, { name: 'F1-score', labels: lab, values: [0.750, 0.686, 0.370, 0.764] }, { name: 'ROC AUC', labels: lab, values: [0.994, 0.955, 0.731, 0.987] }], Object.assign({}, CHART_TXT, { x: 0.6, y: 1.6, w: 7.6, h: 5.2, barDir: 'col', barGrouping: 'clustered', chartColors: [HEX.dk2, HEX.accent1, HEX.accent6], showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.00', dataLabelColor: '14202E', dataLabelFontSize: 10, showLegend: true, legendPos: 'b', showTitle: true, title: 'Detection of 36 injected cases, all 300 projects', catAxisLabelRotate: 0, valAxisHidden: true, valGridLine: { style: 'none' }, valAxisMinVal: 0, valAxisMaxVal: 1.1, objectName: 'detection chart', altText: 'Recall, F1 and AUC by detection signal' }));
      const st = [['34 / 36', 'padded contracts caught by the Risk Index'], ['0.927', 'F1-score for buildings'], ['27.8%', 'recall of Isolation Forest alone']];
      for (let i = 0; i < 3; i++) {
        const y = 1.6 + i * 1.75;
        card(s, 8.45, y, 4.28, 1.55, i === 0 ? C.text2 : C.background2);
        txt(s, st[i][0], { x: 8.7, y: y + 0.12, w: 3.8, h: 0.8, fontSize: 34, bold: true, color: i === 0 ? C.accent1 : (i === 2 ? C.accent2 : C.text2), fontFace: THEME.headFontFace });
        txt(s, st[i][1], { x: 8.7, y: y + 0.95, w: 3.8, h: 0.5, fontSize: 14, color: i === 0 ? C.background1 : C.text1 });
      }
    }

    {
      const s = content('RQ5 · Detection', 'Why a Reference Price Matters', 'The over-budget ratio separates padded from fair contracts: fair projects cluster at or below 1.0, while injected cases sit to the right of the review line. The overlap is small for buildings and larger for bridges, because hidden pile lengths make some fair bridges look expensive. The ROC curves show the risk index and standards rule dominate the Isolation Forest.');
      await img(s, 'obr_hist.png', 0.6, 1.6, 6.0, 4.6, { alt: 'Distribution of the over-budget ratio' });
      await img(s, 'roc_pooled.png', 6.73, 1.6, 6.0, 4.6, { alt: 'ROC curves of the screening signals' });
      txt(s, 'Over-budget ratio: injected vs. non-injected', { x: 0.6, y: 6.3, w: 6.0, h: 0.45, fontSize: 14, color: '44505E', align: 'center' });
      txt(s, 'ROC curves: Risk Index AUC 0.987 vs. Isolation Forest 0.731', { x: 6.73, y: 6.3, w: 6.0, h: 0.45, fontSize: 14, color: '44505E', align: 'center' });
    }

    {
      const s = content('RQ6 · Deployment', 'BUHAY-AH as an App and Website', 'BUHAY-AH runs as an installable offline app with five screens: Home, Design, Quote, Check and Library. It is distributed as an Android package, an offline ZIP and a download website with a live budget-to-design demo.');
      const shots = [['app_design_budget.png', 'Design from a budget'], ['app_quote.png', 'Quote: three tiers and ABC'], ['app_check.png', 'Check: risk index and SHAP'], ['site_home.png', 'Download website']];
      for (let i = 0; i < 4; i++) {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 0.6 + col * 6.2, y = 1.55 + row * 2.68;
        await img(s, shots[i][0], x, y, 5.93, 2.2, { alt: shots[i][1] });
        txt(s, shots[i][1], { x: x, y: y + 2.2, w: 5.93, h: 0.35, fontSize: 13, color: '44505E', align: 'center' });
      }
    }

    // =========================================================== CONCLUSION
    sect('Conclusion');
    divider('05', 'Conclusion', 'What the study found', 'In conclusion.');
    {
      const s = content('Conclusion', 'What the Study Found', 'Nine building variables and eleven bridge variables are enough to price plans. Schematic designs can be generated without a blueprint and pass space standards. The standards engine priced plans within 5 to 8 percent. Regression is enough for buildings; XGBoost is needed for bridges. The Risk Index caught 94.4 percent of padded contracts. BUHAY-AH was deployed as an app, an Android package and a website.');
      const c = [['FaRulerCombined', 'Plan variables', '9 building and 11 bridge variables from plans and standards are enough to estimate cost.'], ['FaCompassDrafting', 'Design generation', '55 modules → 54 templates; 152/152 checks; up to 10 more classrooms per budget with multi-storey.'], ['FaCalculator', 'Standards engine', 'MAPE 5.21% (buildings) and 7.67% (bridges): less than half the ML error.'], ['FaChartLine', 'ML models', 'MLR suffices for buildings (13.43%); XGBoost needed for bridges (19.18% vs. 65.65%).'], ['FaMagnifyingGlassDollar', 'Detection', 'Risk Index recall 94.4%, AUC 0.987 vs. 27.8% for Isolation Forest alone.'], ['FaMobileScreen', 'Deployment', 'Offline app with design studio, Android package and download website.']];
      for (let i = 0; i < 6; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        const x = 0.6 + col * 4.1, y = 1.7 + row * 2.6;
        card(s, x, y, 3.85, 2.35, C.background2);
        await iconDot(s, c[i][0], x + 0.25, y + 0.25, 0.7, C.text2);
        txt(s, (i + 1) + '. ' + c[i][1], { x: x + 1.1, y: y + 0.25, w: 2.6, h: 0.7, fontSize: 17, bold: true, color: C.text2, valign: 'middle' });
        txt(s, c[i][2], { x: x + 0.25, y: y + 1.1, w: 3.4, h: 1.15, fontSize: 14 });
      }
    }

    // =========================================================== RECOMMENDATIONS
    sect('Recommendations');
    {
      const s = content('Recommendations', 'What to Do Next', 'Validate on actual contracts; review the template library with licensed professionals; add geotechnical data for bridges; connect current price data; calibrate thresholds by asset class; extend plan import to IFC and scanned PDFs; extend to other project types; and pilot with oversight bodies.');
      const r = [['Validate on actual contracts', 'Itemized DPWH, PhilGEPS and COA records'], ['Review templates with licensed professionals', 'Architects and engineers refine modules and add site inputs'], ['Add geotechnical data for bridges', 'Boring logs to cut false alarms from pile lengths'], ['Connect current price data', 'DPWH unit costs and PSA construction indices'], ['Calibrate thresholds by asset class', 'Separate BRI cut-offs for buildings and bridges'], ['Extend plan import and design', 'IFC models, scanned PDFs, hydraulic checks'], ['Extend to other project types', 'Flood control, water systems and roads with CORA'], ['Pilot with oversight bodies', 'District office, COA auditors and a local government']];
      for (let i = 0; i < 8; i++) {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 0.6 + col * 6.2, y = 1.65 + row * 1.3;
        card(s, x, y, 5.93, 1.15, C.background2);
        txt(s, String(i + 1), { x: x + 0.2, y: y + 0.1, w: 0.6, h: 0.95, fontSize: 30, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: 'middle' });
        txt(s, r[i][0], { x: x + 0.9, y: y + 0.12, w: 4.85, h: 0.45, fontSize: 16, bold: true, color: C.text2 });
        txt(s, r[i][1], { x: x + 0.9, y: y + 0.57, w: 4.85, h: 0.45, fontSize: 14 });
      }
    }

    // =========================================================== REFERENCES
    sect('References');
    {
      const refs = references();
      const per = 16, pages = Math.ceil(refs.length / per);
      for (let p = 0; p < pages; p++) {
        const s = content('References', pages > 1 ? 'References (' + (p + 1) + ' of ' + pages + ')' : 'References', p === 0 ? 'References follow APA 7th edition.' : null);
        const chunk = refs.slice(p * per, (p + 1) * per);
        const half = Math.ceil(chunk.length / 2);
        [chunk.slice(0, half), chunk.slice(half)].forEach(function (col, ci) {
          const runs = [];
          col.forEach(function (r, i) {
            const rr = italicRuns(r, { fontSize: 10.5, color: HEX.dk1 });
            rr[0].options.indentLevel = 0;
            rr[0].options.paraSpaceAfter = 5;
            if (i < col.length - 1) rr[rr.length - 1].options.breakLine = true;
            runs.push.apply(runs, rr);
          });
          s.addText(runs, { isTextBox: true, x: 0.6 + ci * 6.2, y: 1.55, w: 5.93, h: 5.3, margin: 0, valign: 'top', fontSize: 10.5, objectName: 'references column ' + (ci + 1) });
        });
      }
    }
  }

  // =========================================================== CLOSING
  {
    sectionTitle = full ? 'References' : 'Methodology';
    const s = pres.addSlide({ masterName: 'BUHAY Title', sectionTitle: sectionTitle });
    s.addText('BUHAY-AH', { placeholder: 'kicker' });
    s.addText('Thank You', { placeholder: 'title' });
    s.addText('Design it. Price it. Keep it honest. A building should be priced by what it needs, not by who builds it.', { placeholder: 'body' });
    s.addText([{ text: AUTHOR, options: { bold: true, breakLine: true } }, { text: 'Lead Researcher', options: { breakLine: true } }, { text: 'Results are from the simulated benchmark SBD-300; a flag calls for review, not proof of wrongdoing.', options: { color: C.accent1, fontSize: 12 } }], { placeholder: 'author' });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.75, y: 0.9, w: 4.0, h: 5.7, rectRadius: 0.12, fill: { color: C.background1 }, line: { type: 'none' }, objectName: 'closing frame' });
    await img(s, 'viz_bridge_truss.png', 8.95, 1.05, 3.6, 2.6, { alt: '3D steel truss bridge' });
    await img(s, 'viz_bridge_pscg.png', 8.95, 3.75, 3.6, 2.7, { alt: '3D PSCG bridge' });
    s.addNotes('Thank you. BUHAY-AH shows that mathematics can stand between a budget and a padded price. I welcome your questions.');
  }

  for (const dir of OUT) {
    const f = path.join(dir, fileName);
    await pres.writeFile({ fileName: f });
    if (APPLY_THEME) await APPLY_THEME(f, THEME);
  }
  return fileName;
}

(async function () {
  console.log(await buildDeck(false, 'BUHAY-AH-PR2-Introduction-Methodology.pptx'));
  console.log(await buildDeck(true, 'BUHAY-AH-PR2-Full-Research.pptx'));
})().catch(function (e) { console.error(e); process.exit(1); });
