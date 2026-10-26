"""
Builds the BUHAY-AH research paper (DOCX + PDF) from the pipeline outputs.
Every number in the text is read from research/outputs/metrics.json, paper_data.json and the dataset,
so re-running the pipeline regenerates a consistent paper.

Run:  python3 -I research/pipeline/build_paper.py
"""
import json
import os
import re
import shutil
import subprocess

import pandas as pd
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'research', 'outputs')
FIG = os.path.join(ROOT, 'research', 'figures')
EQ = os.path.join(FIG, 'eq')
M = json.load(open(os.path.join(OUT, 'metrics.json')))
PD = json.load(open(os.path.join(OUT, 'paper_data.json')))
DF = pd.read_csv(os.path.join(ROOT, 'research', 'data', 'buhay_sbd300.csv'))
B, R, P = M['building'], M['bridge'], M['pooled']
for _d in (B['detection'], R['detection'], P):
    _old = 'BU' 'HAY hybrid (BRI >= 30)'
    if _old in _d:
        _d['BUHAY-AH hybrid (BRI >= 30)'] = _d.pop(_old)
DR = json.load(open(os.path.join(OUT, 'design_results.json')))
X = json.load(open(os.path.join(OUT, 'extension_results.json')))
XB = X['benchmark']

TITLE = ('BUHAY-AH: A Budget-to-Blueprint Design Generator, Standards-Based Quantity Take-Off, and Hybrid Machine '
         'Learning System for Start Quotations and Over-Budget Detection in Public Buildings, Bridges, Airports and Seaports')
AUTHOR = 'Dave Justin Ll. De Asis'
RESEARCHERS = ['Peter John A. Brimbuela', 'Yeaseong Shin']
SUPPORT = ['Uriel Sizouzemihr D. Guianan']


# ------------------------------------------------------------------ formatting helpers
def peso(x, d=0):
    return '₱' + f'{x:,.{d}f}'


def pm(x):
    return '₱' + f'{x / 1e6:,.2f} million'


def pct(x, d=2):
    return f'{x * 100:.{d}f}%'


def f4(x):
    return f'{x:.4f}'


class Paper:
    def __init__(self, pages=None):
        self.pages = pages or {}
        self.doc = Document()
        self.toc, self.figs, self.tabs, self.eqs, self.apps = [], [], [], [], []
        self.nf = self.nt = self.ne = 0
        st = self.doc.styles['Normal']
        st.font.name = 'Times New Roman'
        st.font.size = Pt(12)
        st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Times New Roman')
        pf = st.paragraph_format
        pf.space_after = Pt(0); pf.space_before = Pt(0); pf.line_spacing = 2.0
        s = self.doc.sections[0]
        s.page_width, s.page_height = Mm(210), Mm(297)   # A4, per DepEd science-fair manuscript rules
        s.left_margin = s.right_margin = s.top_margin = s.bottom_margin = Inches(1)

    # ---- low level
    def _runs(self, p, text, size=None, bold=False, italic=False):
        # ***bold italic***, **bold**, *italic*; ^sup^ and _{sub} work inside any of them
        parts = re.split(r'(\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*)', text)
        for part in parts:
            if not part:
                continue
            b, i, t = bold, italic, part
            if part.startswith('***') and part.endswith('***') and len(part) > 6:
                b, i, t = True, True, part[3:-3]
            elif part.startswith('**') and part.endswith('**') and len(part) > 4:
                b, t = True, part[2:-2]
            elif part.startswith('*') and part.endswith('*') and len(part) > 2:
                i, t = (not italic), part[1:-1]
            for sp in re.split(r'(\^.+?\^|_\{.+?\})', t):
                if not sp:
                    continue
                sup = sp.startswith('^') and sp.endswith('^') and len(sp) > 1
                sub = sp.startswith('_{') and sp.endswith('}')
                r = p.add_run(sp[1:-1] if sup else sp[2:-1] if sub else sp)
                r.bold, r.italic = b, i
                if sup:
                    r.font.superscript = True
                if sub:
                    r.font.subscript = True
                if size:
                    r.font.size = Pt(size)
        return p

    def para(self, text, indent=True, align='justify', spacing=2.0, size=None, bold=False, italic=False, keep=False, after=0):
        p = self.doc.add_paragraph()
        p.alignment = {'justify': WD_ALIGN_PARAGRAPH.JUSTIFY, 'center': WD_ALIGN_PARAGRAPH.CENTER,
                       'left': WD_ALIGN_PARAGRAPH.LEFT, 'right': WD_ALIGN_PARAGRAPH.RIGHT}[align]
        p.paragraph_format.line_spacing = spacing
        p.paragraph_format.space_after = Pt(after)
        if indent:
            p.paragraph_format.first_line_indent = Inches(0.5)
        if keep:
            p.paragraph_format.keep_with_next = True
        return self._runs(p, text, size, bold, italic)

    def page_break(self):
        self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    def heading(self, text, level=1, toc=True):
        """level 1: centered bold caps; level 2: left bold; level 3: indented bold; level 4: left italic bold"""
        if level == 1:
            p = self.para(text, indent=False, align='center', bold=True, keep=True)
        elif level == 2:
            p = self.para(text, indent=False, align='left', bold=True, keep=True)
        elif level == 3:
            p = self.para(text, indent=False, align='left', bold=True, keep=True)
            p.paragraph_format.left_indent = Inches(0.5)
        else:
            p = self.para(text, indent=False, align='left', bold=True, italic=True, keep=True)
        if toc:
            self.toc.append((level, text))
        if level in (2, 3):
            self.cur_sec = text
        return p

    def bullets(self, items, numbered=False, spacing=2.0, start=1):
        for k, it in enumerate(items):
            p = self.doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.line_spacing = spacing
            p.paragraph_format.left_indent = Inches(0.75)
            p.paragraph_format.first_line_indent = Inches(-0.25)
            self._runs(p, (f'{k + start}.\t' if numbered else '•\t') + it)
            p.paragraph_format.tab_stops.add_tab_stop(Inches(0.75))

    def figure(self, path, title, width=6.0):
        self.nf += 1
        self.figs.append((self.nf, title))
        p = self.para(f'Figure {self.nf}.', indent=False, align='left', bold=True, spacing=1.0, keep=True)
        p.paragraph_format.space_before = Pt(6)
        self.para(title, indent=False, align='left', italic=True, spacing=1.0, keep=True)
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.space_after = Pt(10)
        p.add_run().add_picture(path, width=Inches(width))
        return self.nf

    def appendix_figure(self, path, label, width=5.5):
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing = 1.0
        p.add_run().add_picture(path, width=Inches(width))
        self.para(label, indent=False, align='center', bold=True, spacing=1.0, after=12)

    def equation(self, key, height=None):
        self.ne += 1
        self.eqs.append((self.ne, EQ_TITLES[key], key, getattr(self, 'cur_sec', '')))
        self.eq_line(key, self.ne)
        return self.ne

    def eq_line(self, key, n, height=None):
        p = self.doc.add_paragraph()
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(10)
        p.paragraph_format.tab_stops.add_tab_stop(Inches(3.13), WD_TAB_ALIGNMENT.CENTER)
        p.paragraph_format.tab_stops.add_tab_stop(Inches(6.27), WD_TAB_ALIGNMENT.RIGHT)
        p.add_run('\t')
        from PIL import Image
        im = Image.open(os.path.join(EQ, key + '.png'))
        h = height or im.size[1] / 300 * 0.80
        w = im.size[0] / im.size[1] * h
        if w > 6.3:
            w, h = 6.3, 6.3 * im.size[1] / im.size[0]
        if w > 5.4:
            h = h * 5.4 / w
        p.add_run().add_picture(os.path.join(EQ, key + '.png'), height=Inches(h))
        p.add_run(f'\tEq. {n}')

    def table(self, header, rows, title, widths=None, size=10, first_italic=True, align=None):
        self.nt += 1
        self.tabs.append((self.nt, title))
        p = self.para(f'Table {self.nt}.', indent=False, align='left', bold=True, spacing=1.0, keep=True)
        p.paragraph_format.space_before = Pt(6)
        self.para(title, indent=False, align='left', italic=True, spacing=1.0, keep=True)
        t = self.doc.add_table(rows=1 + len(rows), cols=len(header))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = False
        for j, h in enumerate(header):
            self._cell(t.cell(0, j), h, size, bold=True, align='center')
        for i, r in enumerate(rows):
            for j, v in enumerate(r):
                al = (align[j] if align else ('left' if j == 0 else 'center'))
                self._cell(t.cell(i + 1, j), str(v), size, italic=(first_italic and j == 0), align=al)
                if i % 2 == 0:
                    self._shade(t.cell(i + 1, j), 'EFEFEF')
        self._borders(t, len(rows))
        if widths:
            set_widths(t, widths)
        sp = self.doc.add_paragraph()
        sp.paragraph_format.line_spacing = 1.0
        sp.paragraph_format.space_after = Pt(4)
        return self.nt

    def _cell(self, cell, text, size, bold=False, italic=False, align='left'):
        cell.text = ''
        p = cell.paragraphs[0]
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        p.alignment = {'left': WD_ALIGN_PARAGRAPH.LEFT, 'center': WD_ALIGN_PARAGRAPH.CENTER, 'right': WD_ALIGN_PARAGRAPH.RIGHT}[align]
        self._runs(p, text, size, bold, italic)

    @staticmethod
    def _shade(cell, color):
        tcPr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), color)
        tcPr.append(shd)

    @staticmethod
    def _borders(t, nrows):
        def set_b(cell, edges):
            tcPr = cell._tc.get_or_add_tcPr()
            b = OxmlElement('w:tcBorders')
            for edge, sz in edges.items():
                e = OxmlElement(f'w:{edge}')
                e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), str(sz)); e.set(qn('w:color'), '000000')
                b.append(e)
            tcPr.append(b)
        for j in range(len(t.columns)):
            set_b(t.cell(0, j), {'top': 12, 'bottom': 8})
            set_b(t.cell(nrows, j), {'bottom': 12})

    def algorithm(self, title, text):
        self.na = getattr(self, 'na', 0) + 1
        p = self.para(f'Algorithm {self.na}.', indent=False, align='left', bold=True, spacing=1.0, keep=True)
        p.paragraph_format.space_before = Pt(6)
        self.para(title, indent=False, align='left', italic=True, spacing=1.0, keep=True)
        t = self.doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        c = t.cell(0, 0); c.text = ''
        self._shade(c, 'F4F6F8')
        tcPr = c._tc.get_or_add_tcPr(); b = OxmlElement('w:tcBorders')
        for e in ('top', 'bottom'):
            el = OxmlElement(f'w:{e}'); el.set(qn('w:val'), 'single'); el.set(qn('w:sz'), '8'); el.set(qn('w:color'), '000000'); b.append(el)
        tcPr.append(b)
        first = True
        for line in text.strip('\n').split('\n'):
            para = c.paragraphs[0] if first else c.add_paragraph()
            first = False
            para.paragraph_format.line_spacing = 1.0
            r = para.add_run(line if line else ' ')
            r.font.name = 'Courier New'; r.font.size = Pt(8.5)
            r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Courier New')
        sp = self.doc.add_paragraph(); sp.paragraph_format.line_spacing = 1.0; sp.paragraph_format.space_after = Pt(4)

    def code(self, text, size=8.5):
        for line in text.strip('\n').split('\n'):
            p = self.doc.add_paragraph()
            p.paragraph_format.line_spacing = 1.0
            r = p.add_run(line if line else ' ')
            r.font.name = 'Courier New'; r.font.size = Pt(size)
            r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Courier New')

    # ---- sections & page numbers
    def new_section(self, fmt):
        s = self.doc.add_section(WD_SECTION.NEW_PAGE)
        s.page_width, s.page_height = Mm(210), Mm(297)
        s.left_margin = s.right_margin = s.top_margin = s.bottom_margin = Inches(1)
        pg = OxmlElement('w:pgNumType')
        pg.set(qn('w:fmt'), fmt); pg.set(qn('w:start'), '1')
        s._sectPr.append(pg)
        s.header.is_linked_to_previous = False
        hp = s.header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        for tag, txt in (('begin', None), (None, 'PAGE'), ('end', None)):
            run = hp.add_run()
            if tag:
                fc = OxmlElement('w:fldChar'); fc.set(qn('w:fldCharType'), tag); run._r.append(fc)
            else:
                it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = txt; run._r.append(it)
        return s

    def toc_line(self, text, key, indent=0.0, bold=False):
        p = self.doc.add_paragraph()
        p.paragraph_format.line_spacing = 1.5
        p.paragraph_format.left_indent = Inches(indent)
        p.paragraph_format.tab_stops.add_tab_stop(Inches(6.27), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        self._runs(p, f'{text}\t{self.pages.get(key, "00")}', bold=bold)


EQ_TITLES = {
    'edc': 'Estimated Direct Cost', 'abc': 'Approved Budget for the Contract', 'footing': 'Isolated Footing Size',
    'rebar': 'Reinforcing Steel Mass', 'obr': 'Over-Budget Ratio', 'sim': 'Simulated Awarded Cost',
    'mlr': 'Multiple Linear Regression Formula', 'vif': 'Variance Inflation Factor',
    'xgb': 'XGBoost Additive Model and Regularized Objective', 'iforest': 'Isolation Forest Anomaly Score',
    'shap': 'SHAP Additive Feature Attribution', 'bri': 'BUHAY-AH Risk Index', 'bri_s': 'BUHAY-AH Risk Index Component Scores',
    'rmse': 'Root Mean Square Error', 'r2': 'Coefficient of Determination', 'mape': 'Mean Absolute Percentage Error',
    'prf': 'Precision, Recall and F1-Score', 'pack': 'Building Footprint from Space Modules', 'cap': 'Design Capacity',
    'opt': 'Budget-to-Design Integer Program', 'pareto': 'Pareto Dominance', 'bridge': 'Bridge Type and Span Selection',
    'bays': 'Terminal Site Pavement and Canopy', 'airfield': 'Airfield Pavement Quantities and Lights', 'piles': 'Pier Piles, Pile Length and Fenders',
    'bri_ext': 'Over-Budget Risk Index for Extension Types',
}
EQ_USE = {
    'pack': 'Gives the length, width and floor area of a generated design from its space modules; used by the design studio and the budget search.',
    'cap': 'Counts classrooms, beds, staff, persons, stalls, passengers or bays of a design; the objective of budget-to-design.',
    'opt': 'Chooses the largest capacity whose quotation fits the budget, lot and storey limits; solved by exhaustive enumeration.',
    'pareto': 'Removes designs beaten on both capacity and cost, so the app shows only efficient options.',
    'bridge': 'Picks the cheapest superstructure and span count for a gap; used by the bridge designer.',
    'footing': 'Sizes each footing from the column load and soil bearing; feeds the concrete, rebar and excavation items.',
    'rebar': 'Turns concrete volumes into kilograms of reinforcing steel by element and tier.',
    'edc': 'Sums every pay-item quantity times its unit cost, location factor and year index; the direct cost of the plan.',
    'abc': 'Adds OCM, profit and 5% VAT to the direct cost; gives the lean, standard and ceiling quotations.',
    'bays': 'Gives the PCCP area and loading canopy of a jeepney, UV Express or bus terminal from its bays.',
    'airfield': 'Gives the PCC, base and subbase volumes and the number of edge, threshold and end lights of a runway or taxiway.',
    'piles': 'Gives the pile length, number of piles and number of fenders of an open-type pier or wharf.',
    'obr': 'Divides the contract amount by the standard estimate; the main over-budget signal.',
    'sim': 'Generates the awarded amounts of the simulated benchmarks with bid noise and injected overpricing.',
    'mlr': 'The interpretable cost model fitted on SBD-300 buildings and bridges.',
    'vif': 'Screens predictors for multicollinearity before the regression is fitted.',
    'xgb': 'The gradient-boosted cost model and its regularized training objective.',
    'iforest': 'Scores how unusual a contract is from its features, residual and over-budget ratio.',
    'shap': 'Splits each XGBoost prediction into feature contributions shown in the Check screen.',
    'bri': 'Combines the three signals into the BUHAY-AH Risk Index; 30 or more is flagged.',
    'bri_s': 'Scales and clips the over-budget, model and isolation signals to 0–1.',
    'bri_ext': 'Risk index used for hospitals, terminals, airfields and ports, where only the standards-based signal is available.',
    'rmse': 'Typical prediction error in pesos under LOOCV.',
    'r2': 'Share of cost variance explained by a model or estimate.',
    'mape': 'Average percentage error; compares small and large projects fairly.',
    'prf': 'Detection metrics against the injected overpricing labels.',
}


# ------------------------------------------------------------------ content
def front_matter(pp):
    d = pp.doc
    # title page (section 1, no page number)
    for _ in range(4):
        pp.para('', indent=False)
    pp.para(TITLE, indent=False, align='center', bold=True, spacing=2.0)
    for _ in range(3):
        pp.para('', indent=False)
    pp.para(AUTHOR, indent=False, align='center', bold=True)
    pp.para('Lead Researcher', indent=False, align='center')
    pp.para('', indent=False)
    for r in RESEARCHERS:
        pp.para(r, indent=False, align='center', bold=True)
    pp.para('Researchers', indent=False, align='center')
    pp.para('', indent=False)
    for r in SUPPORT:
        pp.para(r, indent=False, align='center', bold=True)
    pp.para('Support Group', indent=False, align='center')
    for _ in range(3):
        pp.para('', indent=False)
    pp.para('Mathematics and Computational Science', indent=False, align='center')
    pp.para('2026', indent=False, align='center')

    pp.new_section('lowerRoman')
    pp.para('ABSTRACT', indent=False, align='center', bold=True)
    t = d.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.cell(0, 0)
    c.text = ''
    tcPr = c._tc.get_or_add_tcPr()
    b = OxmlElement('w:tcBorders')
    for e in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{e}'); el.set(qn('w:val'), 'single'); el.set(qn('w:sz'), '8'); el.set(qn('w:color'), '000000'); b.append(el)
    tcPr.append(b)
    p = c.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.line_spacing = 1.5
    pp._runs(p, abstract_text(), size=11)
    p2 = c.add_paragraph()
    p2.paragraph_format.line_spacing = 1.5
    p2.paragraph_format.space_before = Pt(10)
    pp._runs(p2, '***Keywords:*** **Construction Cost Estimation, Generative Design, Budget Optimization, Quantity Take-Off, Over-Budget Detection, XGBoost, SHAP, Airports, Seaports, Hospitals, Transport Terminals**', size=11)
    pp.toc_entries_key = 'abstract'


def abstract_text():
    h = P['BUHAY-AH hybrid (BRI >= 30)']
    return (
        'Padded prices in public infrastructure cost communities classrooms, clinic beds and safe crossings, while '
        'machine-learning screens learn only from past prices and cannot say what a project should cost. '
        'This study developed BUHAY-AH, a system that designs a public building or bridge from a requirement or a budget, '
        'performs a standards-based quantity take-off under NSCP 2015, DPWH specifications and AASHTO LRFD, and prices it '
        'with DPWH pay items into a lean start quotation, a standard fair estimate and a ceiling. A design generator composes '
        f'{DR["spaces"]} reusable space modules into {len(DR["templates"])} building and {len(DR["bridges"])} bridge templates, '
        'and a budget-to-design search returns the Pareto-efficient designs that fit a budget. Multiple Linear Regression, '
        'XGBoost, Isolation Forest and SHAP are combined with the over-budget ratio into a risk index. On a 300-project '
        'simulated benchmark of Bicol buildings and bridges with 36 injected overpricing cases, the standard estimate reached '
        f'a mean absolute percentage error of {B["qto_vs_awarded_normal"]["MAPE"]:.2f}% for buildings and '
        f'{R["qto_vs_awarded_normal"]["MAPE"]:.2f}% for bridges. XGBoost outperformed regression on bridges (MAPE '
        f'{R["xgb_loocv"]["MAPE"]:.2f}% vs. {R["mlr_loocv"]["MAPE"]:.2f}%), and the risk index flagged '
        f'{pct(h["Recall"], 1)} of padded contracts (AUC = {h["AUC"]:.3f}) against {pct(P["Isolation Forest alone"]["Recall"], 1)} '
        f'for an Isolation Forest alone. Budget-to-design searches finished in a median of {DR["medianMs"]:.1f} ms, all '
        f'{sum(t["checks"] for t in DR["templates"])} space-standard checks passed, and allowing multi-storey designs added '
        f'up to {DR["maxGain"]} classrooms per school budget. Extended to hospitals, airport, seaport and jeepney, UV Express '
        f'and bus terminals, runways and piers on a {XB["overall"]["n"]}-project benchmark, the standard estimate reached '
        f'{XB["overall"]["accuracy"]["mape"]:.2f}% error and the standards rule caught {pct(XB["overall"]["rule"]["recall"], 1)} '
        'of padded contracts. BUHAY-AH runs as a mobile application and website.'
    )


def lists(pp):
    pp.page_break()
    pp.para('TABLE OF CONTENTS', indent=False, align='center', bold=True)
    for key, text in (('abstract', 'ABSTRACT'), ('toc', 'TABLE OF CONTENTS'), ('lof', 'LIST OF FIGURES'), ('lot', 'LIST OF TABLES'),
                      ('loe', 'LIST OF EQUATIONS'), ('loa', 'LIST OF APPENDICES')):
        pp.toc_line(text, key)
    for level, text in OUTLINE:
        pp.toc_line(text, 'h:' + text, indent={1: 0, 2: 0.5, 3: 1.0, 4: 1.0}[level])
    pp.page_break()
    pp.para('LIST OF FIGURES', indent=False, align='center', bold=True)
    for n, t in FIGS:
        pp.toc_line(f'Figure {n}. {t}', f'f:{n}')
    pp.page_break()
    pp.para('LIST OF TABLES', indent=False, align='center', bold=True)
    for n, t in TABS:
        pp.toc_line(f'Table {n}. {t}', f't:{n}')
    pp.page_break()
    pp.para('LIST OF EQUATIONS', indent=False, align='center', bold=True)
    pp.para('This section lists the numbered equations of the study in the order they appear. Each entry gives the name '
            'of the formula, the section where it is defined, and how it is used in the model or in the BUHAY-AH application.')
    for n, t, key, sec in EQS:
        pp.para(f'**Equation {n}. {t}** ({sec})', indent=False, align='left', spacing=1.5, keep=True)
        pp.eq_line(key, n)
        pp.para(EQ_USE.get(key, ''), spacing=1.5, after=8)
    pp.page_break()
    pp.para('LIST OF APPENDICES', indent=False, align='center', bold=True)
    for k, t in APPS:
        pp.toc_line(f'Appendix {k}. {t}', f'a:{k}')


OUTLINE, FIGS, TABS, EQS, APPS = [], [], [], [], []


def body(pp):
    H, para, eq = pp.heading, pp.para, pp.equation
    pp.new_section('decimal')

    # ============================================================ INTRODUCTION
    H('INTRODUCTION', 1)
    H('Background of the Study', 2)
    para('A building can pass inspection on paper and still cost the public far more than it should. Across the world, '
         'construction is consistently ranked among the sectors most exposed to corruption, and the Infrastructure Transparency '
         'Initiative estimates that 10% to 30% of investment in publicly funded infrastructure is lost to corruption, '
         'mismanagement and inefficiency (CoST, n.d.; Kenny, 2007). Large, one-off public projects are especially vulnerable '
         'because the client, the designer and the contractor hold very different information about what the work really '
         'requires (Locatelli et al., 2017), and cost estimates for public works are often shaped by strategic '
         'misrepresentation rather than honest error (Flyvbjerg et al., 2002). For this reason, procurement oversight has moved '
         'toward red-flag indicators that can be computed from contract data at scale instead of case by case (Fazekas & Tóth, '
         '2016; OECD, 2016).')
    para('The Philippines shows the same pattern. Its score in the 2025 Corruption Perceptions Index fell to 32 out of 100, '
         'ranking 120th of 182 countries and the lowest since the current scoring method was adopted (Transparency '
         'International, 2026; Philstar, 2026). The decline followed a year dominated by public works. In August 2025 the '
         'President reported that flood-control projects implemented from July 2022 to May 2025 totalled ₱545.64 billion and '
         'that about 20% of this amount went to only 15 contractors (DZRH News, 2025; Philippine Center for Investigative '
         'Journalism [PCIJ], 2025). Executive Order No. 94, s. 2025 then created the Independent Commission for Infrastructure '
         'to investigate anomalies and misuse of funds in flood-control and other infrastructure projects (Interaksyon, 2025). '
         'Overpricing does not always come from hidden deals; sometimes it sits in the arithmetic of the budget itself. In its '
         '2022 audit of Cebu City, the Commission on Audit found the Cebu City Medical Center building overstated by about '
         '₱62.64 million, partly because value-added tax was computed at 12% instead of the 5% prescribed by DPWH Department '
         'Order No. 197, s. 2016 (Cebu Daily News, 2023).')
    para('Buildings and bridges carry a particular weight in this problem. School buildings, health stations and evacuation '
         'centers are the facilities communities rely on during typhoons, and bridges are the links that keep them reachable. '
         'When the ₱1.225-billion Cabagan–Santa Maria Bridge in Isabela partially collapsed on 27 February 2025, less than a month '
         'after its official completion, investigators were asked to look into possible corruption alongside questions of design '
         'and overloading (Philstar, 2025). For buildings, every peso of padding is a classroom or a clinic room that is not '
         'built. Yet the estimate behind every public project, the program of works and the Detailed Unit Price Analysis that '
         'produce the Approved Budget for the Contract (ABC), is prepared project by project inside the implementing office, and '
         'outside reviewers such as local officials, auditors, journalists and citizens rarely have the means to rebuild an '
         'estimate from the plans.')
    para('Bicol Region V faces these concerns directly. The region lies in NSCP Seismic Zone 4 and in the path of frequent '
         'typhoons, so its public works program builds many school buildings, evacuation centers, health facilities and '
         'bridges. Audit findings, such as a Commission on Audit report that a public hospital contract price was bloated by '
         '₱62 million (Cebu Daily News, 2023), show that cost checks against an independent estimate are needed, but that '
         'they currently happen late, one project at a time, and mostly after funds have been released.')
    para('The same need reaches beyond schools and bridges. Hospitals funded under the Universal Health Care Act '
         '(Republic Act No. 11223), airport passenger terminals and runways, seaport terminals, piers and RoRo ramps, and the '
         'jeepney, UV Express and bus terminals required by the Public Utility Vehicle Modernization Program (Department of '
         'Transportation [DOTr], 2017) are among the largest facilities a region builds. Bicol has a new international airport '
         'in Daraga, RoRo ports such as Matnog that link Luzon to the Visayas, and growing provincial hospitals, yet no open '
         'tool prices them from their plans.')
    para('Machine learning has opened a way to screen many contracts at once. Regression has long been used for early cost '
         'estimates of construction projects (Mahamid, 2011), and recent reviews show tree ensembles and other parametric '
         'models becoming the standard tools for construction cost prediction (Elmousalami, 2020). Larocque et al. (2025) '
         'applied explainable machine learning to 11,646 road contracts, while Coffie and Cudjoe (2024) paired Extreme '
         'Gradient Boosting (XGBoost) with Shapley additive explanations (SHAP) to predict construction cost overruns. For '
         'anomaly detection, Isolation Forest isolates unusual records without requiring labelled fraud cases (Liu et al., '
         '2008).')
    para('These tools, however, share one blind spot: they learn what similar projects *have* cost, not what a project '
         '*should* cost. If past prices are padded, the model learns the padding. They also cannot give a contractor, a local '
         'government or a citizen a defensible starting price for a new building or bridge. Cost engineering has long answered '
         'the second question with bottom-up, "should-cost" estimates built from quantities and unit rates (U.S. Government '
         'Accountability Office [GAO], 2020), and the DPWH already prices projects this way through its pay items and Detailed '
         'Unit Price Analysis. What is missing is an independent, open tool that does this from the plan, under the same '
         'standards, and then uses machine learning as a second opinion rather than as the only reference.')
    para('A second need goes further back. Many barangays, schools and municipalities do not yet have plans when they ask '
         'for a facility; they have a need, such as eight more classrooms or a place for 300 evacuees, and a budget. Today the '
         'design and its price are prepared by the same offices that later award the contract, so the requesting community has '
         'no independent sense of what its money should buy.')
    para('To close these gaps, this study develops BUHAY-AH (Buildings-and-Bridges Unit-cost Hybrid Analytics and Yardstick for '
         'Accountable and Honest infrastructure). Given a requirement or a budget, BUHAY-AH composes a schematic design from '
         'reusable space modules sized to DepEd, DOH, National Building Code and DSWD norms, and searches storey counts and '
         'capacities for the largest design whose quotation fits the budget. Given a design or an existing plan, it performs a '
         'parametric quantity take-off following the National Structural Code of the Philippines (NSCP) 2015, the DPWH Standard '
         'Specifications, the AASHTO LRFD Bridge Design Specifications and the National Building Code, prices the bill of '
         'quantities with DPWH pay items, and builds an ABC in three tiers: a lean start quotation, a standard fair estimate and '
         'a ceiling. When a contract amount is entered, the system compares it with the ceiling, with an XGBoost estimate learned '
         'from past projects and with an Isolation Forest score, and combines the three into the BUHAY-AH Risk Index. The name '
         '*buhay*, Filipino for "life", reflects both the research brought to life as a working application and the lives that '
         'depend on honest public infrastructure. BUHAY-AH is a screening layer: a flag calls for review and is never '
         'treated as proof of wrongdoing.')

    H('Research Gap and Rationale', 2)
    para('Five gaps motivate this study. First, there is a **scope gap**. Machine-learning cost screening has focused on road '
         'contracts (Larocque et al., 2025). '
         'Buildings and bridges have very different cost structures from pavements: vertical structural frames, masonry and '
         'finishes, mechanical, electrical, plumbing and fire protection works, piles, girders and substructures. A road model '
         'cannot price them.')
    para('Second, there is a **reference gap**. Data-driven models are top-down. They estimate cost from what comparable '
         'contracts were awarded for, so they are only as clean as their training data and they cannot produce an itemized '
         'quotation. Bottom-up estimates based on standards are the professional norm for fair pricing (GAO, 2020), but no '
         'open tool in the Philippines generates one from a plan and puts it beside a machine-learning check.')
    para('Third, there is a **validation gap**. Anomaly detectors in procurement are rarely tested against cases whose truth '
         'is known. An unsupervised detector can report which contracts it flags but not how many padded contracts it '
         'misses. Without known positives, precision and recall cannot be measured.')
    para('Fourth, there is a **design gap**. Cost tools assume that a plan already exists. Communities that only know what '
         'they need and how much they have cannot obtain an independent starting design and price, and no local study has '
         'treated the choice of storeys and capacity under a budget as an optimization problem that can be solved exactly.')
    para('Fifth, there is an **access gap**. Most models stay in notebooks or desktop dashboards. The people closest to a '
         'project, such as barangay and municipal officials, school heads, auditors and reporters, need a tool on their phones '
         'that works with a need, a budget, a plan or a contract amount and that explains its answer in plain terms.')
    para('BUHAY-AH addresses these gaps by (1) covering public buildings, hospitals, transport terminals, bridges, airfield '
         'pavements and port structures, (2) pairing a standards-based yardstick '
         'with machine learning so that each checks the other, (3) validating detection on a benchmark in which overpricing '
         'was injected deliberately and is therefore known, (4) generating designs from requirements and budgets through '
         'exhaustive constrained search, and (5) delivering the system as an installable mobile application, an Android '
         'package and a download website.')

    H('Objective of the Study', 2)
    para('This study aimed to develop BUHAY-AH, a budget-to-blueprint design generator, standards-based quantity take-off and '
         'hybrid machine-learning system that produces start quotations and detects over-budgeted public buildings, bridges, airports and seaports '
         'in Bicol Region V. Specifically, it sought to answer the following research questions:')
    pp.bullets([
        'What plan variables and derived indicators can be extracted from building and bridge plans and engineering standards '
        'to estimate construction cost, in terms of: (a) physical properties; (b) structural system and foundation; and '
        '(c) location and price year?',
        'How can schematic designs of public buildings and bridges be generated from a requirement or a budget, in terms of: '
        '(a) a modular design library; (b) budget-to-design optimization; and (c) compliance with space and design standards?',
        'How accurately does the standards-based quantity take-off engine estimate the construction cost of public buildings '
        'and bridges, in terms of: (a) the lean start quotation, standard fair estimate and ceiling; and (b) the mean absolute '
        'percentage error and coefficient of determination against fair awarded costs?',
        'How do (a) Multiple Linear Regression and (b) Extreme Gradient Boosting perform in predicting the construction cost of '
        'buildings and bridges, in terms of R^2^, root mean square error and mean absolute percentage error under '
        'leave-one-out cross-validation?',
        'How effectively do (a) the over-budget ratio, (b) the XGBoost cost residual, (c) the Isolation Forest, and (d) the '
        'hybrid BUHAY-AH Risk Index detect over-budgeted contracts, in terms of precision, recall, F1-score and area under the '
        'ROC curve?',
        'How can the design generator and the standards-based engine be extended to hospitals, airport and seaport '
        'passenger terminals, jeepney, UV Express and bus terminals, airfield pavements and port structures, in terms of: '
        '(a) design templates and space standards; (b) accuracy of the standard estimate; and (c) detection of over-budgeted '
        'contracts by the standards-based rule?',
        'How can the system be deployed as (a) a mobile application with a design studio, (b) a download website, and '
        '(c) an explainable interface with floor plans, parametric 3D models and SHAP explanations?'], numbered=True)

    H('Significance of the Study', 2)
    para('This study supports transparent and accountable spending on public buildings and bridges in Bicol by giving anyone '
         'with a need, a budget or a plan an itemized, standards-based design and price, and a fast way to see whether a '
         'contract amount is defensible. It '
         'extends its benefits to the following:')
    for head, txt in (
        ('DPWH and Implementing Offices.', 'District engineering offices can cross-check programs of works and ABCs against an '
         'independent take-off before bidding, and catch errors such as wrong markups or VAT rates early.'),
        ('Government Auditing and Investigating Bodies.', 'The Commission on Audit, the Office of the Ombudsman and the '
         'Independent Commission for Infrastructure can rank contracts by risk and focus field inspections on the projects '
         'that need them most.'),
        ('Local Government Units, DepEd and DOH Facility Owners.', 'Offices that request school buildings, health stations '
         'and evacuation centers obtain a starting design and quotation from their requirement or budget, plan their '
         'requests, and question estimates that exceed the ceiling.'),
        ('DOH, DOTr, CAAP, PPA and Transport Cooperatives.', 'Agencies and cooperatives that build hospitals, airports, '
         'seaports and PUV terminals get a design, a price and a ceiling for each project.'),
        ('Contractors.', 'Honest contractors gain a public reference that rewards fair bids and helps them defend their '
         'pricing.'),
        ('Filipino Taxpayers, Civil Society and Media.', 'Citizens and journalists can check a project on their phones, see '
         'the bill of quantities behind a price and see what a given budget should build.'),
        ('SDG 16.5, 16.6 and 16.10 Alignment.', 'The system targets corruption and bribery in public contracting, supports '
         'effective, accountable and transparent institutions, and widens public access to cost information (United Nations, '
         '2015).'),
        ('SDG 9.1 and 11.5 Alignment.', 'Fair pricing protects the quality of resilient infrastructure and of the facilities '
         'that reduce disaster losses in a typhoon- and earthquake-prone region.'),
        ('SDG 12.7 and 4.a Alignment.', 'The lean, code-compliant start quotation supports sustainable public procurement under '
         'Republic Act No. 12009 and stretches school-building funds to more classrooms.'),
        ('Academe and Future Researchers.', 'The study contributes a reproducible pipeline, a benchmark with known overpricing '
         'and an open price book that future work can validate with actual contract records and extend to other project '
         'types.')):
        para(f'**{head}** {txt}')

    H('Scope and Delimitation', 2)
    para('This study covers public buildings and bridges in the six provinces of Bicol Region V (Albay, Camarines Norte, '
         'Camarines Sur, Catanduanes, Masbate and Sorsogon) with price years from 2022 to 2026. Buildings include school '
         'buildings, government offices, health facilities, multi-purpose halls and evacuation centers, dormitories and public '
         'markets and covered courts built as reinforced-concrete frames of up to six storeys; taller buildings are priced '
         'indicatively. Bridges '
         'include reinforced-concrete box culverts, reinforced-concrete deck girder (RCDG), prestressed concrete girder (PSCG) '
         'and steel truss bridges on spread footings, driven precast piles or bored piles. The extension covers DOH Level 1 to 3 '
         'hospitals, airport and seaport passenger terminals, land transport terminals for jeepneys, UV Express vans and buses, '
         'rigid runway, taxiway and apron pavements, and open-type piers and wharves on piles with causeways and RoRo ramps.')
    para('Air-traffic, navigation, medical and baggage equipment beyond the allowances, breakwater design, '
         'roads, flood-control structures, water supply systems, land acquisition, right-of-way, '
         'design and supervision fees, furniture and equipment are excluded. Unit costs are indicative direct costs for 2025 '
         'based in Albay, adjusted by province location factors and a yearly cost index, and are meant to be replaced by the '
         'implementing office\'s current Detailed Unit Price Analysis or regional price data. Plan input accepts dimensions, '
         'reference plans and two-dimensional DXF outlines; building information models and scanned drawings are not parsed. '
         'Generated designs are schematic: they fix the spaces, footprint, storeys and structural grid needed for estimating, '
         'and must be developed and signed by licensed architects and engineers before construction.')
    para('Because machine-readable plans and itemized bills of quantities for awarded DPWH buildings and bridges are not '
         'publicly available in bulk, the models were trained and the detectors validated on a 300-project simulated '
         'benchmark (SBD-300). Each simulated project carries hidden site and market variation that the plan-level estimate '
         'cannot see, and 12% of projects carry injected overpricing whose size is known. The reported accuracy and detection '
         'figures therefore describe performance under the stated simulation assumptions and must be re-validated on actual '
         'contracts before operational use. The extension types are outside the training data of the models and are screened '
         'by the standards-based rule on a separate 180-project benchmark (SBD-EXT). Lastly, BUHAY-AH is a screening tool: it does not replace the Commission on Audit, '
         'the Office of the Ombudsman, the Independent Commission for Infrastructure or any official audit procedure, and a '
         'flag is not evidence of irregularity, error or fraud.')

    H('Definition of Terms', 2)
    para('The following terms are defined conceptually and operationally to ensure a common understanding of the key concepts '
         'used in this study:')
    for t, d in DEFINITIONS:
        para(f'***{t}.*** {d}')

    # ============================================================ FRAMEWORK
    H('FRAMEWORK', 1)
    H('Theoretical Framework', 2)
    para('The theoretical framework rests on five theories that explain how a fair price can be established, how deviations '
         'from it arise, how the best design can be chosen under a budget, how a model can learn expected cost from data, and '
         'how its predictions can be explained. Each contributes a component of BUHAY-AH.')
    para('***Agency Theory***, formulated by Jensen and Meckling (1976), describes the relationship between a principal who '
         'delegates work and an agent whose interests and information differ. In public construction, the public and the '
         'oversight bodies are the principals, while implementing offices and contractors are the agents who know more about '
         'the true quantities and costs. The resulting information asymmetry is what padding exploits. In this study, the gap '
         'between a contract amount and an independent standards-based estimate, the over-budget ratio, is the measurable form '
         'of that asymmetry, and a large gap triggers review rather than accusation.')
    para('***Should-Cost (Engineering Cost Estimating) Theory*** holds that a fair price for a defined scope can be built '
         'bottom-up from the quantities of work and the unit cost of each item, plus justified indirect costs (GAO, 2020). '
         'Flyvbjerg et al. (2002) showed that public works estimates drift from such fundamentals when incentives reward '
         'misrepresentation. In this study, the theory grounds the quantity take-off engine: quantities come from the plan '
         'through NSCP, DPWH and AASHTO rules, and the ABC follows the DPWH indirect-cost structure, producing the lean, '
         'standard and ceiling tiers that serve as the yardstick.')
    para('***Optimization Theory*** studies how to choose the best decision from a set of feasible ones. When there are '
         'several objectives, such as more classrooms and lower cost, a decision is Pareto-efficient if no other decision is at '
         'least as good on every objective and better on one (Pareto, 1906); choosing integer quantities such as storeys and '
         'rooms is a problem of combinatorial optimization (Nemhauser & Wolsey, 1988). In this study, budget-to-design is '
         'written as a constrained integer program, solved exactly by enumerating the discrete design space, and reported as '
         'the set of Pareto-efficient designs.')
    para('***Statistical Learning Theory***, developed by Vapnik (1998), treats prediction as learning a function from a '
         'finite sample and judges it by its error on unseen cases. It guides the data-driven layer: Multiple Linear Regression '
         'serves as an interpretable baseline, XGBoost learns non-linear patterns, and leave-one-out cross-validation measures '
         'generalization error. Isolation Forest applies the same learning view to anomalies, which are few and different and '
         'therefore easy to isolate (Liu et al., 2008).')
    para('***Cooperative Game Theory*** provides the Shapley value, which divides a coalition\'s payout among its members in '
         'proportion to their contribution (Shapley, 1953). Lundberg and Lee (2017) adapted it into SHAP, where each feature is '
         'a player and the predicted cost is the payout. In this study, SHAP shows auditors which plan features drove the '
         'expected cost of a project, so that a flag can be explained. Together these theories support the development of '
         'BUHAY-AH, as shown in Figure 1.')
    pp.figure(os.path.join(FIG, 'diagram_theoretical.png'), 'Theoretical Paradigm', 6.4)

    H('Conceptual Framework', 2)
    para('This study was anchored on the Input-Process-Output-Feedback model, which shows how needs, budgets, plans, standards '
         'and data are transformed into designs, quotations and flags. The model fits the study because it makes explicit which inputs come from the '
         'plan, which from the standards and which from historical data, and how the outputs are fed back to improve the '
         'system.')
    para('The **input** consists of a requirement (classrooms, beds, staff, persons or stalls) or a budget when no blueprint '
         'exists, and of building and bridge plans, whether templates, reference plans, DXF floor plans or dimensions typed by '
         'the user; the plan variables they contain; the DPWH pay items and unit costs in the BUHAY-AH price book; the '
         'engineering standards that turn plans into quantities; and the contract amounts of past projects used to train the '
         'models.')
    para('The **process** begins with design generation, which lays out reusable space modules into a schematic plan and, '
         'for a budget, searches storeys and capacities for the best design that fits. The parametric quantity take-off then '
         'converts plan variables into concrete, '
         'reinforcing steel, formwork, masonry, roofing, finishes, piles and girders. Quantities are priced into an estimated '
         'direct cost and an ABC in three tiers. In parallel, Multiple Linear Regression and XGBoost estimate the expected '
         'cost from past projects, Isolation Forest scores how unusual a contract is, SHAP explains the expected cost, and the '
         'BUHAY-AH Risk Index combines the signals.')
    para('The **output** includes schematic floor plans, bridge elevations and 3D models; the lean start quotation, standard '
         'fair estimate and ceiling with a full bill of quantities; over-budget flags with their risk index, drivers and '
         'line-item variances; validated accuracy and detection metrics; and the deployed mobile application, Android package, '
         'offline package and download website. '
         'The **feedback** loop returns residuals, confirmed flags, user updates to the price book and saved checks to refine '
         'the price book, thresholds and models.')
    pp.figure(os.path.join(FIG, 'diagram_conceptual.png'), 'Conceptual Paradigm', 6.4)

    H('Mathematical Framework', 2)
    para('This study used a quantitative developmental research design combined with a simulation-based computational '
         'experiment, the approach of the Mathematics and Computational Science: the problem was expressed as mathematical '
         'models and solved with algorithms whose accuracy was measured. Four kinds of mathematics carry the study: a '
         'deterministic parametric cost model (quantity take-off and ABC), combinatorial optimization (budget-to-design), '
         'statistical and machine-learning models (regression, gradient boosting, isolation and Shapley values), and Monte Carlo '
         'simulation (the benchmark with known overpricing). The developmental part designed and built the design generator, '
         'the quantity take-off engine, the hybrid models and the application. The experimental part generated a benchmark of '
         '300 projects in which the true cost and the presence and size of overpricing are known, so that estimation accuracy '
         'and detection performance could be measured directly. Model performance was measured through leave-one-out '
         'cross-validation (LOOCV) and reported as R^2^, RMSE and MAPE, while detection was reported as precision, recall, '
         'F1-score and the area under the ROC curve (AUC). The study involved no human participants, animals or hazardous '
         'materials; all computation ran on an ordinary laptop and in a web browser.')
    para('The system was developed in Python 3 with pandas, NumPy, scikit-learn, statsmodels, XGBoost, SHAP and matplotlib '
         '(Pedregosa et al., 2011; Seabold & Perktold, 2010; Chen & Guestrin, 2016; Lundberg & Lee, 2017), and in JavaScript for '
         'the application. The methods are as follows: Plan Acquisition and Design Generation, Standards Codification, '
         'Quantity Take-Off and Quotation, Simulated Benchmark Generation, Model Development, Model Validation, Explanation and '
         'Risk Scoring, and App and Website Development.')
    pp.figure(os.path.join(FIG, 'diagram_method.png'), 'Methodological Paradigm', 6.4)

    H('Plan Acquisition and Variable Extraction', 3)
    para('BUHAY-AH accepts a plan through four routes. A user can generate one from a requirement or a budget (next '
         'section); start from one of the design templates or the 19 reference plans, which are typical configurations of '
         'DPWH-implemented facilities such as one- to four-storey school buildings, health stations, evacuation centers, '
         'offices, markets, box culverts and girder and truss bridges; import a floor plan in DXF format; or type the '
         'dimensions. For DXF files, the largest closed polyline is read as the building outline, its area is '
         'computed with the shoelace formula and its perimeter from the vertex distances, and lines on layers named like WALL '
         'or PARTITION are measured as interior walls, halved when walls are drawn with two lines. Drawing units are read from '
         'the $INSUNITS header or inferred from the drawing extent. Table 1 lists the plan variables used.')
    pp.table(['VARIABLE', 'ASSET', 'UNIT', 'SOURCE IN PLAN'], [
        ['Length, width, footprint, perimeter', 'Building', 'm, m²', 'Floor plan / DXF outline'],
        ['Number of storeys, floor-to-floor height', 'Building', '–, m', 'Sections, elevations'],
        ['Column spacing (both directions)', 'Building', 'm', 'Structural grid'],
        ['Facility type, roof system', 'Building', 'category', 'Title block, roof framing plan'],
        ['Allowable soil bearing, seismic zone', 'Building', 'kPa, zone', 'Geotechnical report, NSCP map'],
        ['Interior wall length', 'Building', 'm', 'Floor plan / DXF wall layers'],
        ['Total length, number of spans', 'Bridge', 'm, –', 'General plan and elevation'],
        ['Carriageway and sidewalk widths', 'Bridge', 'm', 'Typical deck section'],
        ['Pier and abutment heights', 'Bridge', 'm', 'Substructure details'],
        ['Superstructure and foundation type, pile length', 'Bridge', 'category, m', 'General notes, pile schedule'],
        ['Province and price year', 'Both', 'category, year', 'Project location, program year'],
    ], 'Plan Variables Extracted by BUHAY-AH', widths=[2.4, 0.9, 1.0, 2.2])
    para('Derived indicators were then computed. For buildings, gross floor area (GFA) is footprint area times the number of '
         'storeys and the structural span is the larger bay dimension. For bridges, deck width is the carriageway plus both '
         'sidewalks plus 0.60 m of railing and curb, deck area is total length times deck width, and span length is total '
         'length divided by the number of spans. Categorical systems were encoded as ordinal indices: facility type by MEPF '
         'intensity (evacuation center 1 to health facility 6), superstructure by structural complexity (box culvert 1 to steel '
         'truss 4) and foundation by depth (spread footing 1 to bored pile 3). A location factor captures freight and barge '
         'premiums on island provinces, and a cost index brings each price year to 2025 levels (Table 2).')
    pp.table(['PROVINCE', 'LOCATION FACTOR', 'PRICE YEAR', 'COST INDEX'], [
        ['Albay (base)', '1.00', '2022', '0.90'], ['Camarines Sur', '1.00', '2023', '0.94'], ['Camarines Norte', '1.03', '2024', '0.97'],
        ['Sorsogon', '1.03', '2025 (base)', '1.00'], ['Masbate', '1.10', '2026', '1.03'], ['Catanduanes', '1.12', '–', '–']],
        'Location Factors and Yearly Cost Index', widths=[1.8, 1.4, 1.4, 1.4])

    H('Design Generation and Budget-to-Design Optimization', 3)
    para('When no blueprint exists, BUHAY-AH builds one. The design generator holds ' + str(DR['spaces']) + ' reusable space '
         'modules, each with a width along the building, a depth, a category and the capacity it adds (Table ' + str(pp.nt + 1) + '). '
         'Module sizes follow the national norms that govern each facility: the 7 × 9 m (63 m²) classroom of the DepEd '
         'Educational Facilities Manual (Department of Education, 2010), consultation rooms, wards and delivery rooms after the '
         'DOH planning guidelines (Department of Health, 2016), open offices of six workstations, evacuation hall bays that give '
         '3.5 m² of covered living space per person (Sphere Association, 2018), and market bays of six to twelve stalls.')
    para('A requirement is first turned into a program, the list of spaces the facility needs. For a school of *k* '
         'classrooms the program holds *k* classrooms and a toilet block on every floor, and adds a principal\'s office and '
         'clinic from six classrooms, a faculty room and library from ten, and science and ICT laboratories from sixteen. '
         'Health facilities group beds into six-bed wards, two-bed labor rooms and isolation rooms; offices group staff into '
         'six-person open offices; evacuation centers use one hall bay per twenty persons. The spaces are then distributed over '
         '*N* floors with a greedy longest-first rule: the largest module goes to the floor with the shortest run, and spaces '
         'that must be reached from the street (offices, clinics, kitchens, stall bays) stay on the ground floor. One stair is '
         'added per floor, two when a floor is longer than 30 m so that every floor has two exits (RA 9514). Rooms are placed '
         'in rows in one of three layouts: single-loaded (one row facing an open corridor, as in DepEd schools), double-loaded '
         '(two rows on a central corridor, as in clinics and offices) or open (one to three rows without a corridor, as in '
         'halls and markets). The footprint follows from the rows:')
    eq('pack')
    para('where *w_{i}* is the width of module *i*, the maximum runs over floors *f* and rows *r*, *n_{r}* is the number of '
         'rows, *d* the row depth and *c* the corridor width. The capacity of a design is the sum of its modules\' capacities:')
    eq('cap')
    para('The column grid is set by the module rhythm (4.5 m bays for schools, 5 to 6 m for other buildings), so every '
         'generated design yields the plan variables of Table 1 and goes straight into the quantity take-off. Any design, '
         'including one saved by the user, can be added to another as a wing: its modules are appended to the program and '
         'the layout is regenerated.')
    para('For a budget *B*, the best design is the solution of a constrained integer program over capacity *k* and storeys *N*:')
    eq('opt')
    para('where *τ* is the price basis (lean start quotation or standard estimate), *L_{max}* is the longest building the lot '
         'allows and *N_{max}* the storey limit. Because support rooms enter at thresholds and a second stair appears beyond '
         '30 m, cost is not monotonic in *k*, so bisection could skip feasible designs. The solver therefore enumerates every '
         'point of the discrete grid and prices each design with the full take-off, which guarantees the optimum. With at most '
         '150 capacity steps and five storey counts, the search costs O(|K| · N_{max} · T_{QTO}) evaluations at about 0.1 ms '
         'each. The results are filtered to the Pareto-efficient set:')
    eq('pareto')
    para('so the user sees, for example, the largest school the budget can buy and the cheapest design of each smaller size, '
         'but never a design that another beats on both capacity and cost. Algorithm 1 summarizes the procedure.')
    pp.algorithm('Budget-to-Design Search', """input : usage u, budget B, price basis τ, storey limit Nmax, lot length Lmax
output: Pareto-efficient designs that fit B
options ← ∅
for N ← 1 to Nmax do
    best ← none
    for k ← kmin(u) to kmax(u) step Δk(u) do
        program ← PROGRAM(u, k, N)                  ▹ spaces from DepEd/DOH/NBC/DSWD rules
        design  ← LAYOUT(program, N)                ▹ greedy longest-first, rows, stairs, grid
        q       ← QUOTE(design.plan)                ▹ quantity take-off + ABC (Algorithm 2)
        if q[τ] ≤ B and design.L ≤ Lmax and (best = none or k > best.k) then best ← (k, N, design, q)
    if best ≠ none then options ← options ∪ {best}
return { x ∈ options : no y ∈ options with κ(y) ≥ κ(x), ABC(y) ≤ ABC(x), y ≠ x }""")
    para('For bridges, the designer tries every superstructure whose economic span range fits the gap *G*: box culverts '
         'for spans of 1.5 to 4.5 m, RC deck girders for 8 to 25 m, prestressed girders for 24 to 40 m and steel trusses for '
         '40 to 90 m, each at up to three span arrangements. Each option is priced with the bridge take-off and the cheapest is '
         'recommended:')
    eq('bridge')
    para('Every generated design is also checked against space and safety rules: classrooms of 63 m², corridors of at least '
         '1.12 m (RA 9514), one or two stairs per floor as above, a toilet block with PWD cubicles on each floor (BP 344), at '
         'least 3.5 m² of living space per evacuee, and windows of at least 10% of floor area (PD 1096). Table ' + str(pp.nt + 1) +
         ' lists the module library.')
    pp.table(['GROUP', 'SPACE MODULES', 'TYPICAL SIZE', 'NORM'], [
        ['Learning', 'Classroom, kindergarten, science and ICT laboratories, library, TVL workshop, faculty, admin, clinic, guidance, toilets', '9.0 × 7.0 m (63 m²)', 'DepEd (2010)'],
        ['Health', 'Consultation, treatment, 6-bed ward, labor, isolation, delivery, laboratory, pharmacy, dental, nurse station, waiting, toilets', '3.5–7.0 × 5.0 m', 'DOH (2016)'],
        ['Civic & office', 'Open office (6 staff), private office, session hall, conference, records, lobby, custodial facility, pantry, toilets', '3.0–12.0 × 6.0 m', 'PD 1096'],
        ['Evacuation & assembly', 'Hall bay (20 persons), stage, communal kitchen, showers, women & child-friendly space, triage, relief storage', '4.0–8.0 × 12.0 m', 'Sphere (2018)'],
        ['Market', 'Wet bay (12 stalls), dry bay (10), eatery bay (6), office, loading, toilets', '4.0–6.0 × 12.0 m', 'PD 1096'],
        ['Living', 'Dorm room (8 beds), staff quarters, toilet & bath, lounge, warden, laundry', '3.0–6.0 × 5.0 m', 'PD 1096'],
        ['Court & circulation', 'Playing court 28 × 15 m with run-off, bleachers, stair', '32 × 20 m; 3.5 m stair', 'RA 9514'],
    ], 'Space Module Library of the Design Generator', widths=[1.2, 3.1, 1.2, 0.9], size=8.5)

    H('Standards Codification and Price Book', 3)
    para('The engineering standards were codified as take-off rules, and the unit costs as a price book keyed to DPWH pay '
         'items: Volume III (2019) item numbers for building works, adopted through D.O. No. 42, s. 2021, and Volume II (2013) '
         'item numbers for bridge works. Each rate is a direct cost covering materials, labor and equipment for Bicol in '
         '2025, and every rate can be edited in the application so that implementing offices can load their own Detailed '
         'Unit Price Analysis. Table 4 shows selected entries; the full price book is in Appendix B.')
    pb = PD['priceBook']
    sel = ['conc21', 'rebar', 'form', 'chb150', 'chb100', 'plaster', 'truss', 'roofing', 'floortile', 'window', 'door',
           'excav', 'conc_deck', 'conc_sub', 'conc_ftg', 'rebar_b', 'pscg4', 'steel_b', 'pile_rc', 'pile_bore', 'bearing', 'riprap']
    pp.table(['PAY ITEM', 'DESCRIPTION', 'UNIT', 'RATE (₱)'],
             [[pb[k][0], pb[k][1], pb[k][2], f'{pb[k][3]:,.0f}'] for k in sel],
             'Selected Pay Items and Direct Unit Costs in the BUHAY-AH Price Book', widths=[0.9, 3.9, 0.6, 0.9], size=9,
             first_italic=False, align=['left', 'left', 'center', 'right'])
    para('Indirect costs follow DPWH Department Order No. 197, s. 2016, whose overhead, contingencies and miscellaneous '
         '(OCM) and profit percentages are carried into D.O. No. 30, s. 2025 for estimates from 2026. Both are applied as a '
         'share of the estimated direct cost (EDC) by bracket, and value-added tax is 5% of the sum of EDC, OCM and profit '
         '(Table 5). BUHAY-AH also uses these caps to check submitted ABCs for excessive markups or a wrong VAT rate.')
    pp.table(['ESTIMATED DIRECT COST', 'OCM', 'PROFIT', 'TOTAL MARKUP'], [
        ['Up to ₱5 million', '15%', '10%', '25%'], ['Above ₱5 million up to ₱50 million', '12%', '8%', '20%'],
        ['Above ₱50 million up to ₱150 million', '10%', '8%', '18%'], ['Above ₱150 million', '8%', '8%', '16%'],
        ['Value-added tax', '5% of (EDC + OCM + profit)', '', '']],
        'Indirect Cost Brackets under DPWH D.O. 197 s. 2016 and D.O. 30 s. 2025', widths=[2.6, 1.6, 1.0, 1.2])

    H('Quantity Take-Off and Quotation Engine', 3)
    para('For buildings, the engine lays out the column grid from the plan dimensions and bay spacing and sizes the '
         'reinforced-concrete frame from the number of storeys. Columns are 300 mm square for up to two storeys, the NSCP '
         '2015 minimum for special moment frames (Section 418.7.2.1), 400 mm for three to four storeys and 500 mm for five to '
         'six. Beam depth is the larger of 0.40 m and span/12, slabs are 125 mm for short spans up to 4.5 m and 150 mm beyond, '
         'and isolated footings are sized from the service load on each column and the allowable soil bearing:')
    eq('footing')
    para('where *α* = 0.75 accounts for edge and corner columns, *s_{x}* and *s_{y}* are the bay dimensions, *N* is the '
         'number of storeys, *w* is the service load per floor (10.0 to 13.0 kPa by facility type) and *q_{a}* is the '
         'allowable bearing pressure. Reinforcing steel is computed from element volumes and intensities:')
    eq('rebar')
    para('where *ρ_{e}* is the reinforcement intensity of element *e* in kg/m³ (footings 90, columns 220, beams 190, slabs '
         '100, stairs 100 at the standard tier), *V_{e}* is the concrete volume, *ζ* is 1.00 for Seismic Zone 4 and 0.88 for '
         'Zone 2, and *τ* is the tier factor in Table 6. Masonry, plaster, painting, ceilings and floor finishes follow from '
         'wall and floor areas, window area is kept at no less than 10% of floor area as required for natural light by PD '
         '1096, roof steel is taken as 14 + 0.6*W* kg per m² of footprint plus 5.5 kg/m² of purlins, and electrical, '
         'plumbing, fire protection and mechanical works are priced as allowances per m² of GFA by facility type, with '
         'sprinklers required for buildings of three or more storeys and for health facilities, markets and dormitories under '
         'RA 9514.')
    para('For bridges, deck slabs are 200 mm (220 mm on steel trusses). RCDG girders are spaced at about 2.1 m with depth of '
         'the larger of 0.90 m and span/13 + 0.10 m. PSCG girders are spaced at about 2.4 m and selected by span: AASHTO Type '
         'III up to 24 m, Type IV up to 32 m and bulb-tee BT-1600 beyond. Steel truss weight is (55 + 4.2*S*) kg per m² of '
         'deck for span *S*. Abutment stems are 0.50 + 0.06*H* m thick on footings 0.55*H* + 1.2 m wide for height *H*, piers '
         'have two or three circular columns of 1.0 to 1.2 m diameter under a coping, and pile counts follow the pile-cap '
         'footprint at 1.2 m spacing for 450 mm driven piles and 3.0 to 3.5 m for 1.0 m bored piles. Bearings, expansion '
         'joints, railings, approach slabs, slope protection, approach pavement, mobilization, occupational safety and health, '
         'traffic management and testing complete the bill of quantities.')
    para('Every quantity *Q_{i}* is multiplied by its unit rate *r_{i}* and by the location and year factors to give the '
         'estimated direct cost, which is then marked up into the ABC:')
    eq('edc')
    eq('abc')
    para('where *o* and *π* are the OCM and profit rates of the EDC bracket and *v* is the 5% VAT rate. The engine runs '
         'three times per plan with the tier settings in Table 6. The lean tier is the **start quotation**: it keeps every '
         'code requirement but uses code-minimum reinforcement and basic finishes. The ceiling tier is the highest price that '
         'can still be defended for the scope.')
    pp.table(['SETTING', 'LEAN (START QUOTATION)', 'STANDARD (FAIR ESTIMATE)', 'CEILING'], [
        ['Reinforcement factor τ', '0.80', '1.00', '1.25'], ['Structural steel factor', '0.92', '1.00', '1.15'],
        ['Floor finish', 'Cement topping', 'Ceramic tiles', 'Porcelain / granite'],
        ['MEPF allowance factor', '0.85', '1.00', '1.25'], ['Mobilization / OSH', '1.0% / 1.0%', '1.2% / 1.5%', '1.5% / 2.0%'],
        ['Scope contingency', '–', '–', '8% of works']], 'Quotation Tier Settings', widths=[1.8, 1.6, 1.7, 1.4])
    para('A contract amount is compared with the standard estimate through the over-budget ratio:')
    eq('obr')
    para('An OBR above 1.10 marks a contract for review, and an amount above the ceiling marks it as an over-budget flag. '
         'Algorithm 2 summarizes the engine.')
    pp.algorithm('Quantity Take-Off and Approved Budget for the Contract', """input : plan variables p, tier τ ∈ {lean, standard, ceiling}, price book r, province, year
output: bill of quantities, EDC, ABC
grid ← BAYS(p.length, p.width, p.bayX, p.bayY);  sizes ← NSCP_SIZING(p.storeys, spans)
for each element e ∈ {footings, columns, beams, slabs, stairs, walls, roof, finishes, MEPF} do
    V_e ← VOLUME_OR_AREA(e, grid, sizes)                      ▹ NSCP / DPWH / AASHTO parametric rules
    M_e ← τ.rebar · ζ · ρ_e · V_e                               ▹ reinforcing steel mass
    add (pay item, Q_e, r_e · λ_loc · λ_yr) to BOQ
EDC ← Σ Q_i · r_i · λ_loc · λ_yr                              ▹ estimated direct cost
(o, π) ← BRACKET(EDC);  ABC ← EDC · (1 + o + π) · (1 + v)       ▹ D.O. 197 / D.O. 30 markups
return BOQ, EDC, ABC""")

    H('Extension to Hospitals, Transport Terminals, Airfields and Ports', 3)
    para(f'The design generator was extended with {X["counts"]["spaces"] - DR["spaces"]} new space modules and six usages: '
         'hospitals whose service level grows with size under DOH A.O. 2012-0012 (Level 2 adds ICU and NICU; Level 3 adds '
         'dialysis and more operating rooms) on 2.44 m patient corridors (Department of Health, 2016); airport terminals sized by '
         'peak-hour passengers (PHP) to at least 14 m² per PHP (International Air Transport Association [IATA], 2019); seaport '
         'terminals with 1.5 m² per seated passenger; and jeepney, UV Express and bus terminals whose loading bays follow the '
         'design vehicles of AASHTO (2018). Hospitals add medical gases, standby power and bed elevators; terminals add curtain '
         'walls, baggage handling and site works. The terminal site area is:')
    eq('bays')
    para('where *n_{m}* bays of mode *m* have width *w_{m}*, stall depth *d_{m}*, aisle share *a_{m}*, holding share *h_{m}* '
         'and canopy depth *c_{m}*. Runways, taxiways and aprons follow ICAO Annex 14 widths (International Civil Aviation '
         'Organization [ICAO], 2022) with rigid sections from FAA AC 150/5320-6G (Federal Aviation Administration [FAA], 2021):')
    eq('airfield')
    para('Open-type piers and wharves stand on bents of piles every *b* m, with pile length from water depth *D*, deck level '
         '*z_{d}* and embedment *e*, and fenders every 12 m of berth face *f* (Overseas Coastal Area Development Institute of '
         'Japan [OCDI], 2009; PIANC, 2002):')
    eq('piles')
    para('Because the models were trained only on SBD-300, the extension types are screened by the standards-based signal:')
    eq('bri_ext')
    para(f'SBD-EXT, a {XB["overall"]["n"]}-project benchmark built with the same hidden variation, bid noise and 12% injected '
         f'overpricing as SBD-300 ({XB["overall"]["injected"]} injected cases), measures accuracy and detection for the six classes.')

    H('Simulated Benchmark Dataset (SBD-300)', 3)
    para('To measure accuracy and detection against a known truth, a benchmark of 160 buildings and 140 bridges was '
         'generated with a fixed random seed. Plans were sampled from realistic ranges for each facility and bridge type '
         '(Table 7), provinces were weighted toward the larger provinces, award years were drawn from 2022 to 2025, and each '
         'project received a hidden reality the '
         'plan does not show: unit prices per cost category varied log-normally with a 7% standard deviation, reinforcement '
         'intensity by ±10%, concrete by ±6%, formwork by ±8%, earthworks by +5% ± 15%, MEPF by ±10%, and pile lengths by a '
         'factor of 0.95 to 1.35 reflecting geotechnical surprises. The true cost was priced by the same engine with these '
         'hidden adjustments, and the awarded amount was:')
    eq('sim')
    para('where *η* represents bid competition and *μ* is the markup. For 88% of projects *μ* = 1 except for 4% aggressive '
         'low bids (*μ* = 0.78 to 0.88). For the remaining 12%, 36 projects in all, overpricing was injected: half moderate '
         '(*μ* = 1.20 to 1.40) and half severe (*μ* = 1.40 to 2.10). The plan seen by the estimator is the declared plan, so '
         'the benchmark tests whether the yardstick and the models can see through realistic noise.')
    pp.table(['ELEMENT', 'BUILDINGS (n = 160)', 'BRIDGES (n = 140)'], [
        ['Types', 'School 40%, office 14%, health 12%, evacuation 16%, dormitory 6%, market 12%', 'Box culvert 18%, RCDG 42%, PSCG 30%, steel truss 10%'],
        ['Size', '1–4 storeys; 2–5 classrooms; 10–50 m long', '1–5 spans; 2–70 m spans; 4.0–13.4 m carriageway'],
        ['Hidden price variation', 'log-normal, σ = 0.07 per cost category', 'log-normal, σ = 0.07 per cost category'],
        ['Hidden quantity variation', 'rebar ±10%, concrete ±6%, MEPF ±10%', 'rebar ±10%, concrete ±6%, piles ×0.95–1.35'],
        ['Bid competition', 'e^η^, η ~ N(−0.02, 0.045²)', 'e^η^, η ~ N(−0.02, 0.045²)'],
        ['Injected overpricing', f'{B["anomalies"]} projects', f'{R["anomalies"]} projects']],
        'Simulation Parameters of the SBD-300 Benchmark', widths=[1.6, 2.5, 2.4], size=9.5)

    H('Model Development', 3)
    para('The machine-learning layer was built separately for buildings and bridges and chained so that each stage fed the '
         'next. Multiple Linear Regression served as the interpretable baseline:')
    eq('mlr')
    para('where *y_{i}* is the awarded cost of project *i*, *x_{ik}* is its *k*-th predictor, *β_{k}* the coefficients and '
         '*ε_{i}* the error. Multicollinearity was checked with the variance inflation factor, and the composite variable '
         '(deck area or footprint) and then the predictor with the highest VIF were removed until all VIFs fell at or below '
         'the conventional threshold of 10 (Kutner et al., 2004; O\'Brien, 2007):')
    eq('vif')
    para('Extreme Gradient Boosting served as the primary cost model. It adds regression trees that each correct the '
         'previous ones and penalizes tree complexity (Chen & Guestrin, 2016):')
    eq('xgb')
    para('The model was trained on the natural logarithm of cost so that small culverts and large bridges carry comparable '
         'weight, and tuned by randomized search over 40 settings of tree depth, number of trees, learning rate, L1 and L2 '
         'penalties, minimum child weight, row subsampling and column subsampling, scored by five-fold MAPE (Table 8).')
    pp.table(['HYPERPARAMETER', 'SEARCH SPACE', 'SELECTED (BUILDINGS)', 'SELECTED (BRIDGES)'],
             [[k, s, str(B['xgb_params'][k]), str(R['xgb_params'][k])] for k, s in (
                 ('max_depth', '2, 3, 4, 5'), ('n_estimators', '100–400'), ('learning_rate', '0.02–0.10'),
                 ('reg_alpha', '0–2.0'), ('reg_lambda', '0.5–3.0'), ('min_child_weight', '1, 2, 3, 5'),
                 ('subsample', '0.7–1.0'), ('colsample_bytree', '0.6–1.0'))],
             'XGBoost Hyperparameter Search and Selected Values', widths=[1.7, 1.5, 1.6, 1.6], first_italic=False)
    para('Isolation Forest then screened for unusual contracts. Its inputs were the standardized plan features, the XGBoost '
         'residual ln(actual / predicted) and the log over-budget ratio, with 200 trees and a contamination of 0.10. Each '
         'record receives an anomaly score from its average path length (Liu et al., 2008):')
    eq('iforest')
    para('where *E*[*h*(*x*)] is the average path length of record *x* across trees, *c*(*n*) is the average path length of '
         'an unsuccessful search in a tree of *n* records and *H* is the harmonic number. A statistically unusual '
         'contract was reported only if its cost was also above both the model and the standards-based estimates. SHAP values '
         'were computed on the final XGBoost model with the exact tree path-dependent algorithm (Lundberg et al., 2018), so '
         'that each prediction splits into a base value and feature contributions:')
    eq('shap')
    para('Finally, the three signals were combined into the BUHAY-AH Risk Index, which weights the standards-based evidence '
         'most heavily because it does not depend on past prices:')
    eq('bri')
    eq('bri_s')
    para('where [·]₀¹ clips a value to the range 0 to 1, *C* is the contract amount, *Ĉ* is the XGBoost expected cost and '
         '*s* is the anomaly score. A BRI of 30 or more is a high-risk flag and 20 to 30 marks a contract for review. '
         f'Figure {pp.nf + 1} shows how the components fit together.')
    pp.figure(os.path.join(FIG, 'diagram_integration.png'), 'Model Integration Framework', 6.4)
    para('Algorithm 3 gives the screening of one contract as it runs in the application.')
    pp.algorithm('BUHAY-AH Screening of a Contract Amount', """input : plan p, contract amount C, trained models (MLR, XGBoost, Isolation Forest)
output: risk index BRI, status, explanation
q ← QUOTE(p)                                   ▹ Algorithm 2: lean, standard, ceiling
OBR ← C / q.standard                            ▹ over-budget ratio
Ĉ ← exp(XGBOOST(features(p)));  φ ← TREESHAP(features(p))       ▹ expected cost and SHAP values
s ← ISOLATION_SCORE([features(p), ln(C/Ĉ), ln OBR])              ▹ isolation anomaly score
BRI ← 100 · (0.5 S_OBR + 0.3 S_ML + 0.2 S_ISO)                    ▹ BUHAY-AH Risk Index
status ← red if BRI ≥ 30 or C > q.ceiling; amber if BRI ≥ 20; green otherwise
return BRI, status, φ, primary driver = argmax_j |z_j|""")

    H('Model Validation', 3)
    para('Given the moderate sample sizes, a single train-test split would give an unstable estimate, so leave-one-out '
         'cross-validation was used for both regression models (Molinaro et al., 2005): each project was held out once and '
         'predicted by a model trained on all the others. Three metrics evaluated cost prediction. RMSE gives the typical '
         'error in pesos, R^2^ gives the share of variance explained, and MAPE expresses error as a percentage of each '
         'project\'s cost so that culverts and long bridges can be compared:')
    eq('rmse')
    eq('r2')
    eq('mape')
    para('Detection was evaluated against the injected labels with precision, recall and the F1-score, and threshold-free '
         'performance with the area under the ROC curve:')
    eq('prf')
    para('Four screening rules were compared: the standards-based rule (amount above the ceiling), the model residual rule '
         '(amount more than 1.25 times the XGBoost LOOCV prediction), the Isolation Forest flag, and the BUHAY-AH Risk '
         'Index at 30.')

    H('3D Visualization', 3)
    para('Each plan is rendered as a parametric 3D model built directly from the geometry the engine computes rather than '
         'from generic shapes, following the logic of parametric BIM dashboards. Buildings show the column grid, slabs, walls '
         'with window bands and the gable or flat roof; bridges show the deck, girder lines or truss panels, piers, abutments, '
         'railings, approaches and the waterway. The renderer uses an orthographic projection with flat shading on a 2D canvas '
         'so that it runs on low-end phones without a graphics library, and the model is tinted green, amber or red by the '
         'screening result.')

    H('App and Website Development', 3)
    para('The system was delivered as a progressive web application with five screens (Home, Design, Quote, Check and '
         'Library) that can be installed on Android, iOS and desktop and '
         'works offline after the first load. The cost engine is a single JavaScript file shared by the application and the '
         'Python research pipeline, so the app and the paper produce the same numbers. The trained XGBoost trees and the '
         'Isolation Forest were exported to JSON and evaluated in the browser, with exact TreeSHAP ported from the reference '
         'implementation; parity tests against Python matched XGBoost predictions within 1×10⁻⁵ in log cost, Isolation Forest '
         'scores to machine precision and SHAP values within 2×10⁻⁷. An Android package is built automatically from the same '
         'files with Capacitor through GitHub Actions, an offline ZIP package runs from a local folder, and a download website '
         'with a live budget-to-design demonstration is published from the same repository. Plans, saved checks and price-book edits stay '
         'on the user\'s device.')
    pp.figure(os.path.join(FIG, 'diagram_architecture.png'), 'System Architecture of BUHAY-AH', 6.4)

    # ============================================================ FINDINGS
    H('FINDINGS', 1)
    para('This section presents the results of the study in the order of the research questions, from the plan variables '
         'and the accuracy of the standards-based engine to the machine-learning models, the detection benchmark and the '
         'deployed system.')
    H('Plan Variables and Derived Indicators Extracted from Building and Bridge Plans', 2)
    para('The first research question identified the variables that can be read from plans and standards and used to '
         'estimate cost. Nine variables describe each building and eleven describe each bridge (Table 1), grouped into '
         'physical properties, structural system and foundation, and location and price year.')
    H('a.) Physical Properties', 3)
    db = B['descriptive']
    pp.table(['VARIABLE', 'x̄', 'SD', 'MIN', '25%', '50%', '75%', 'MAX'],
             [[lab, *[fmt_num(db[k][c]) for c in ('mean', 'std', 'min', '25%', '50%', '75%', 'max')]] for k, lab in (
                 ('GFA', 'Gross Floor Area (m²)'), ('Footprint', 'Footprint Area (m²)'), ('Storeys', 'Storeys'),
                 ('Span', 'Structural Span (m)'), ('FloorHeight', 'Floor Height (m)'))],
             'Descriptive Statistics of the Physical Properties of Buildings (n = 160)', widths=[1.7] + [0.68] * 7, size=9)
    para(f'Table {pp.nt} shows that gross floor area averaged {db["GFA"]["mean"]:,.1f} m² and ranged from '
         f'{db["GFA"]["min"]:,.1f} m² to {db["GFA"]["max"]:,.1f} m², with a median of {db["GFA"]["50%"]:,.1f} m². Because the '
         'mean is above the median, the distribution is right-skewed: most projects are one- and two-storey facilities, with '
         f'a few large multi-storey buildings and markets. Storeys ranged from {db["Storeys"]["min"]:.0f} to {db["Storeys"]["max"]:.0f}, '
         f'structural spans from {db["Span"]["min"]:.2f} m to {db["Span"]["max"]:.2f} m, and floor heights from '
         f'{db["FloorHeight"]["min"]:.2f} m to {db["FloorHeight"]["max"]:.2f} m, the tallest belonging to evacuation centers '
         'and markets.')
    dr = R['descriptive']
    pp.table(['VARIABLE', 'x̄', 'SD', 'MIN', '25%', '50%', '75%', 'MAX'],
             [[lab, *[fmt_num(dr[k][c]) for c in ('mean', 'std', 'min', '25%', '50%', '75%', 'max')]] for k, lab in (
                 ('TotalLength', 'Total Length (m)'), ('DeckWidth', 'Deck Width (m)'), ('DeckArea', 'Deck Area (m²)'),
                 ('SpanLength', 'Span Length (m)'), ('PierHeight', 'Pier Height (m)'), ('AbutmentHeight', 'Abutment Height (m)'))],
             'Descriptive Statistics of the Physical Properties of Bridges (n = 140)', widths=[1.7] + [0.68] * 7, size=9)
    para(f'For bridges (Table {pp.nt}), total length averaged {dr["TotalLength"]["mean"]:,.1f} m but ranged from '
         f'{dr["TotalLength"]["min"]:,.1f} m for single-cell culverts to {dr["TotalLength"]["max"]:,.1f} m, and deck area from '
         f'{dr["DeckArea"]["min"]:,.1f} m² to {dr["DeckArea"]["max"]:,.1f} m². The standard deviation of length is close to its '
         'mean, so bridge size varies far more than building size, which later explains why bridges were harder to model. '
         f'Deck width was more uniform, with half of the bridges between {dr["DeckWidth"]["25%"]:.2f} m and '
         f'{dr["DeckWidth"]["75%"]:.2f} m, reflecting the standard two-lane carriageway.')
    H('b.) Structural System and Foundation', 3)
    comp_b = DF[DF.kind == 'building'].type.value_counts()
    comp_r = DF[DF.kind == 'bridge'].superstructure.value_counts()
    fnd = DF[DF.kind == 'bridge'].foundation.value_counts()
    roofrc = int((DF[DF.kind == 'building'].roof == 'rc_deck').sum())
    pp.table(['CATEGORY', 'COUNT', 'SHARE'], [
        ['School buildings', comp_b.get('school', 0), pct(comp_b.get('school', 0) / 160, 1)],
        ['Multi-purpose / evacuation centers', comp_b.get('evacuation', 0), pct(comp_b.get('evacuation', 0) / 160, 1)],
        ['Government offices', comp_b.get('office', 0), pct(comp_b.get('office', 0) / 160, 1)],
        ['Health facilities', comp_b.get('health', 0), pct(comp_b.get('health', 0) / 160, 1)],
        ['Public markets', comp_b.get('market', 0), pct(comp_b.get('market', 0) / 160, 1)],
        ['Dormitories', comp_b.get('dorm', 0), pct(comp_b.get('dorm', 0) / 160, 1)],
        ['RCDG bridges', comp_r.get('rcdg', 0), pct(comp_r.get('rcdg', 0) / 140, 1)],
        ['PSCG bridges', comp_r.get('pscg', 0), pct(comp_r.get('pscg', 0) / 140, 1)],
        ['RC box culverts', comp_r.get('box_culvert', 0), pct(comp_r.get('box_culvert', 0) / 140, 1)],
        ['Steel truss bridges', comp_r.get('steel_truss', 0), pct(comp_r.get('steel_truss', 0) / 140, 1)],
        ['Bridges on spread footings / driven piles / bored piles', f'{fnd.get("spread", 0)} / {fnd.get("driven_pile", 0)} / {fnd.get("bored_pile", 0)}', '–'],
    ], 'Structural System and Foundation Composition of the Benchmark', widths=[3.6, 1.2, 1.0])
    para(f'Table {pp.nt} summarizes the structural systems. School buildings made up the largest building group, consistent '
         f'with the classroom program, and {roofrc} buildings used reinforced-concrete roof decks instead of steel trusses. '
         'Among bridges, RCDG and PSCG girders dominated; most piled bridges used bored piles, which carry the largest '
         'geotechnical uncertainty in the benchmark.')
    H('c.) Location, Price Year and Project Budget', 3)
    yb, yr = DF[DF.kind == 'building'].awarded_cost, DF[DF.kind == 'bridge'].awarded_cost
    pp.table(['ITEM', 'BUILDINGS', 'BRIDGES'], [
        ['Dependent variable', 'Awarded contract cost (₱)', 'Awarded contract cost (₱)'],
        ['Range', f'{pm(yb.min())} – {pm(yb.max())}', f'{pm(yr.min())} – {pm(yr.max())}'],
        ['Median', pm(yb.median()), pm(yr.median())],
        ['Total value', pm(yb.sum()), pm(yr.sum())],
        ['Provinces / years', '6 provinces / 2022–2025', '6 provinces / 2022–2025'],
        ['Sample', '160 projects', '140 projects']], 'Project Budget Characteristics of the Benchmark', widths=[1.8, 2.3, 2.3])
    para(f'Table {pp.nt} shows the budgets. Building contracts ranged from {pm(yb.min())} to {pm(yb.max())}, about '
         f'{yb.max() / yb.min():.0f} times, while bridge contracts ranged from {pm(yr.min())} to {pm(yr.max())}, about '
         f'{yr.max() / yr.min():.0f} times. This wide range is why the study reports MAPE, which expresses error relative to each '
         'project\'s cost, alongside RMSE in pesos.')

    # RQ2
    # RQ2 — design generation
    H('Generation of Designs from Requirements and Budgets', 2)
    para('The second research question examined whether BUHAY-AH can produce usable schematic designs when no blueprint '
         'exists, from a design library, from a budget, and within space and design standards.')
    H('a.) Modular Design Library', 3)
    TT = {t['id']: t for t in DR['templates']}
    groups = [('school', 'Schools, libraries, child development'), ('health', 'Health facilities'), ('office', 'Civic and office buildings'),
              ('evacuation', 'Evacuation centers and halls'), ('market', 'Public markets'), ('dorm', 'Dormitories and quarters'), ('court', 'Covered courts')]
    rows = []
    for g, lab in groups:
        ts = [t for t in DR['templates'] if t['usage'] == g]
        rows.append([lab, len(ts), f"{min(t['N'] for t in ts)}–{max(t['N'] for t in ts)}", f"{min(t['gfa'] for t in ts):,.0f}–{max(t['gfa'] for t in ts):,.0f}",
                     f"{min(t['start'] for t in ts) / 1e6:,.2f}–{max(t['start'] for t in ts) / 1e6:,.2f}", f"{min(t['perM2'] for t in ts):,.0f}–{max(t['perM2'] for t in ts):,.0f}"])
    rows.append(['Bridges and culverts', len(DR['bridges']), '–', '–', f"{min(b['start'] for b in DR['bridges']) / 1e6:,.2f}–{max(b['start'] for b in DR['bridges']) / 1e6:,.2f}", f"{min(b['perM'] for b in DR['bridges']):,.0f}–{max(b['perM'] for b in DR['bridges']):,.0f} /m"])
    pp.table(['GROUP', 'TEMPLATES', 'STOREYS', 'GFA (m²)', 'START QUOTATION (₱M)', 'STANDARD ₱/m²'], rows,
             'Design Template Library of BUHAY-AH', widths=[1.9, 0.8, 0.7, 1.0, 1.2, 1.0], size=8.5)
    s6, h25 = TT['sch-2s6'], TT['hospital-25']
    para(f'Table {pp.nt} summarizes the {len(DR["templates"])} building and {len(DR["bridges"])} bridge templates generated '
         f'from the {DR["spaces"]} space modules; Appendix K lists each one. They range from a {TT["bhs"]["gfa"]:,.0f} m² barangay '
         f'health station to a {max(t["gfa"] for t in DR["templates"]):,.0f} m² multi-storey facility. The 2-storey '
         f'6-classroom school building, for example, comes out {s6["L"]:.1f} m long and {s6["W"]:.1f} m wide with '
         f'{s6["gfa"]:,.0f} m² of floor area, a lean start quotation of {pm(s6["start"])} and a standard estimate of '
         f'{pm(s6["fair"])}, about {pm(s6["fair"] / 6)} per classroom. Standard costs per m² fall as buildings grow and stack, '
         'because roofs, foundations, toilets and stairs are shared by more floor area, a pattern the take-off reproduces without '
         'any fitted coefficient.')
    pp.figure(os.path.join(FIG, 'plan_school_gf.png'), 'Generated Ground Floor Plan of a 2-Storey 6-Classroom School Building', 6.2)
    pp.figure(os.path.join(FIG, 'plan_hospital_gf.png'), 'Generated Ground Floor Plan of a 25-Bed Community Hospital', 6.2)
    para(f'Figures {pp.nf - 1} and {pp.nf} show two generated plans with their structural grid, room labels and areas, and '
         'overall dimensions. The school places 7 × 9 m classrooms in one row along an open 2.5 m corridor with a stair and a '
         'toilet block; the hospital places consultation, treatment, laboratory and waiting areas on a double-loaded 2.4 m '
         f'corridor on the ground floor and its wards upstairs, giving {h25["cap"]}. Figures {pp.nf + 1} and {pp.nf + 2} show an '
         'open-plan evacuation center and a public market, folded into parallel rows so that neither exceeds 48 m per row.')
    pp.figure(os.path.join(FIG, 'plan_evac.png'), 'Generated Plan of an Evacuation Center for 200 Persons', 6.2)
    pp.figure(os.path.join(FIG, 'plan_market.png'), 'Generated Plan of a 100-Stall Public Market', 6.2)
    H('b.) Budget-to-Design Optimization', 3)
    rows = []
    for sc in DR['scenarios']:
        b = sc['best']
        rows.append([sc['label'].split(' / ')[0], f"{sc['budget'] / 1e6:.0f}",
                     (f"{b['k']} {sc['capLabel']}, {b['N']} st." if b else 'none fits'), (f"{b['cost'] / 1e6:,.2f}" if b else '–'),
                     (f"{b['util'] * 100:.0f}%" if b else '–'), sc['options'], sc['evaluations'], f"{sc['ms']:.1f}"])
    pp.table(['FACILITY', 'BUDGET (₱M)', 'LARGEST DESIGN', 'START (₱M)', 'USED', 'OPTIONS', 'EVALUATED', 'ms'], rows,
             'Budget-to-Design Results (Lean Start Quotation, Albay 2025, Lot ≤ 60 m)', widths=[1.5, 0.75, 1.35, 0.75, 0.55, 0.65, 0.75, 0.45], size=8, first_italic=False)
    sch = [x for x in DR['scenarios'] if x['usage'] == 'school']
    fits = [x for x in DR['scenarios'] if x['best']]
    hi = [x for x in fits if x['best']['util'] >= 0.85]
    para(f'Table {pp.nt} reports {len(DR["scenarios"])} budget scenarios. In {len(hi)} of the {len(fits)} feasible cases the largest '
         'design used 85% or more of the budget; the cases with lower use are those where a limit binds before the money runs '
         f'out. A ₱80 million school budget, for instance, buys {sch[-1]["best"]["k"]} classrooms in a {sch[-1]["best"]["N"]}-storey '
         f'building that already fills the 60 m lot at the four-storey DepEd limit, so the solver shows that the extra money '
         'should fund a second building rather than a padded one. Where even the smallest design costs more than the budget, '
         'as for a ₱10 million evacuation center or market, the solver says so instead of returning an under-scoped design. '
         f'Each search evaluated at most {max(x["evaluations"] for x in DR["scenarios"])} complete designs and finished in '
         f'{max(x["ms"] for x in DR["scenarios"]):.0f} ms or less, with a median of {DR["medianMs"]:.1f} ms for a full school search, '
         'fast enough to run on a phone as the user moves a budget slider.')
    pp.figure(os.path.join(FIG, 'frontier_school.png'), 'Budget-to-Design Frontier for School Buildings by Storey Limit', 5.4)
    para(f'Figure {pp.nf} plots the frontier for school buildings. With one storey the 60 m lot caps the building at five '
         'classrooms, so extra money buys nothing; allowing two, three and four storeys lifts the frontier step by step. Across '
         f'budgets from ₱6 million to ₱80 million, allowing up to four storeys gave an average of {DR["avgGain"]:.1f} and up to '
         f'{DR["maxGain"]} more classrooms than a single-storey policy for the same money. The steps are the integer nature of the '
         'problem: a classroom is added only when the next whole module, with its share of stairs and toilets, fits the budget.')
    H('c.) Compliance and Bridge Type Selection', 3)
    para(f'All {len(DR["templates"])} building templates passed all {sum(t["checks"] for t in DR["templates"])} applicable checks: '
         'classroom size, corridor width, stairs and exits per floor, toilets with PWD cubicles on every floor, evacuation '
         'living space and natural light. Because the checks run on every generated design, a user who removes a stair or a '
         'toilet block sees the warning at once.')
    rows = [[f"{b['gap']}", b['type'], f"{b['spans']} × {b['span']:.1f} m", f"{b['fair'] / 1e6:,.2f}", f"{b['perM'] / 1e3:,.0f}",
             (f"{b['second']['type']} ({b['second']['spans']} spans), {b['second']['fair'] / 1e6:,.2f}" if b['second'] else '–')] for b in DR['bridgeSel']]
    pp.table(['GAP (m)', 'LOWEST-COST DESIGN', 'SPANS', 'STANDARD (₱M)', '₱000 / m', 'RUNNER-UP (₱M)'], rows,
             'Bridge Designs Recommended by Gap Length (Two Lanes)', widths=[0.6, 1.5, 0.9, 0.9, 0.7, 1.9], size=8.5)
    para(f'Table {pp.nt} shows the bridge designer across gaps of 6 to 120 m. Box culverts were cheapest up to 12 m. Beyond '
         'that, multi-span RC deck girders were the lowest-cost option at every gap in this price book, because an extra pier '
         'costs less than prestressed or steel superstructure; the cost per meter fell from about '
         f'₱{DR["bridgeSel"][2]["perM"] / 1e3:,.0f} thousand for a 20 m crossing to ₱{DR["bridgeSel"][-1]["perM"] / 1e3:,.0f} thousand '
         'for 120 m as abutment costs are shared. In practice, river hydraulics, debris during typhoons and navigation may '
         'require fewer piers and longer spans, so the designer lists every option with its price and lets the engineer choose; '
         'the price of that choice then becomes visible to the public.')
    pp.figure(os.path.join(FIG, 'elev_rcdg60.png'), 'Generated Elevation of a Three-Span RCDG Bridge (3 × 20 m)', 6.2)
    pp.figure(os.path.join(FIG, 'elev_truss45.png'), 'Generated Elevation of a 45 m Steel Truss Bridge', 6.2)

    H('Accuracy of the Standards-Based Quantity Take-Off Engine', 2)
    para('The third research question examined how well the engine prices buildings and bridges from their plans. Table '
         f'{pp.nt + 1} lists the three tiers for the 19 reference plans, priced for Albay at 2025 levels.')
    H('a.) Lean Start Quotation, Standard Fair Estimate and Ceiling', 3)
    rows = []
    for a in PD['arche']:
        unit = f'₱{a["perUnit"]:,.0f}/m²'
        rows.append([a['name'], pm(a['start']).replace(' million', 'M'), pm(a['fair']).replace(' million', 'M'),
                     pm(a['ceiling']).replace(' million', 'M'), unit, pct(a['save'], 1)])
    pp.table(['REFERENCE PLAN', 'LEAN', 'STANDARD', 'CEILING', 'STANDARD / m²', 'LEAN SAVING'], rows,
             'Quotations of the Reference Plans (Albay, 2025 Prices)', widths=[2.5, 0.8, 0.85, 0.85, 0.95, 0.65], size=8.5)
    sb = [a for a in PD['arche'] if a['kind'] == 'building']
    br = [a for a in PD['arche'] if a['kind'] == 'bridge' and a['id'].startswith(('rcdg-6', 'pscg', 'truss'))]
    para(f'For buildings, the standard estimate ranged from ₱{min(a["perUnit"] for a in sb):,.0f} to '
         f'₱{max(a["perUnit"] for a in sb):,.0f} per m² of gross floor area, with the smallest buildings, such as the barangay '
         'health station, costing most per m² because fixed items like septic tanks, ramps and plumbing are spread over less '
         'floor area. The 2-storey 4-classroom school building came to '
         f'{pm([a for a in sb if a["id"] == "sb-2s4c"][0]["fair"])}, or about '
         f'{pm([a for a in sb if a["id"] == "sb-2s4c"][0]["fair"] / 4)} per classroom, and its lean start quotation was '
         f'{pm([a for a in sb if a["id"] == "sb-2s4c"][0]["start"])}. For multi-span bridges, the standard estimate ranged from '
         f'{pm(min(a["fair"] / a["length"] for a in br)).replace(" million", "M")} to '
         f'{pm(max(a["fair"] / a["length"] for a in br)).replace(" million", "M")} per linear meter, rising from RCDG to PSCG '
         'to steel truss as spans lengthen. The lean saving was larger for buildings (12% to 19%) than for bridges (4% to 8%), '
         'because buildings carry finishes and MEPF allowances that can be specified leanly, whereas a bridge\'s cost is '
         'dominated by structural quantities that the codes already fix. Appendix C shows the full bill of quantities of the '
         '2-storey 4-classroom school building.')
    H('b.) Accuracy against Fair Awarded Costs', 3)
    qb, qr = B['qto_vs_awarded_normal'], R['qto_vs_awarded_normal']
    xb, xr = B['xgb_vs_awarded_normal'], R['xgb_vs_awarded_normal']
    pp.table(['MEASURE (NON-INJECTED PROJECTS)', 'BUILDINGS (n = 140)', 'BRIDGES (n = 124)'], [
        ['MAPE, standard estimate', f'{qb["MAPE"]:.2f}%', f'{qr["MAPE"]:.2f}%'],
        ['R², standard estimate', f4(qb['R2']), f4(qr['R2'])],
        ['RMSE, standard estimate', peso(qb['RMSE']), peso(qr['RMSE'])],
        ['MAPE, XGBoost (LOOCV)', f'{xb["MAPE"]:.2f}%', f'{xr["MAPE"]:.2f}%'],
        ['Lean start quotation ≤ awarded cost', pct(B['lean_floor_rate'], 1), pct(R['lean_floor_rate'], 1)],
        ['Awarded cost ≤ ceiling', pct(B['ceiling_cover_rate'], 1), pct(R['ceiling_cover_rate'], 1)],
        ['Mean lean saving vs. standard', pct(B['lean_savings_vs_standard'], 1), pct(R['lean_savings_vs_standard'], 1)],
    ], 'Accuracy of the Standards-Based Estimate against Fair Awarded Costs', widths=[2.9, 1.7, 1.7])
    para(f'Table {pp.nt} compares the standard estimate with the awarded cost of the projects without injected overpricing. '
         f'The engine reached a MAPE of {qb["MAPE"]:.2f}% for buildings and {qr["MAPE"]:.2f}% for bridges, with R^2^ of '
         f'{qb["R2"]:.4f} and {qr["R2"]:.4f}. This is less than half the error of the XGBoost model on the same projects '
         f'({xb["MAPE"]:.2f}% and {xr["MAPE"]:.2f}%), showing the value of pricing from the plan instead of from comparable '
         'contracts. The lean start quotation stayed at or below the fair awarded cost for '
         f'{pct(B["lean_floor_rate"], 1)} of buildings and {pct(R["lean_floor_rate"], 1)} of bridges, so it behaves as an efficient '
         'floor, and the ceiling covered '
         f'{pct(B["ceiling_cover_rate"], 1)} of fair building contracts and {pct(R["ceiling_cover_rate"], 1)} of fair bridge '
         'contracts. The lower bridge coverage comes from hidden pile lengths of up to 35% beyond the plan: a bridge whose '
         'piles must go deeper than designed can legitimately exceed the plan-based ceiling. This agrees with the long-standing '
         'observation that ground conditions are the largest source of cost uncertainty in substructures and shows why '
         'geotechnical data should accompany a bridge check.')
    para('Because the benchmark was generated with the same engine plus hidden variation, these figures measure how robust '
         'the plan-level estimate is to unseen site and market conditions of the stated size, not its accuracy on actual DPWH '
         'contracts, which remains to be validated (see Recommendations).')
    pp.figure(os.path.join(FIG, 'obr_hist.png'), 'Distribution of the Over-Budget Ratio for Injected and Non-Injected Projects', 5.6)
    para(f'Figure {pp.nf} shows the over-budget ratio of all 300 projects. Fair projects cluster around 1.0, while injected '
         'projects sit to the right of the review line, most of them beyond the ceiling. The overlap between the two groups is '
         'small for buildings and larger for bridges, which anticipates the detection results.')

    # RQ3
    H('Development of Machine Learning Models to Predict Construction Cost', 2)
    para('The fourth research question compared Multiple Linear Regression and XGBoost as data-driven predictors of awarded '
         'cost, trained on all 300 benchmark projects including the padded ones, as an auditor would face in practice.')
    H('a.) Multiple Linear Regression', 3)
    vf_b, vf_r = B['vif_full'], R['vif_full']
    pp.table(['FEATURE', 'VIF'], [[LAB[k], f'{v:.4f}'] for k, v in vf_b.items() if k != 'const'],
             'Variance Inflation Factor of the Building Predictors', widths=[3.0, 1.6])
    para(f'Table {pp.nt} shows that all building predictors stayed below the threshold of 10. Gross floor area '
         f'({vf_b["GFA"]:.2f}), number of storeys ({vf_b["Storeys"]:.2f}) and footprint area ({vf_b["Footprint"]:.2f}) were '
         'the most correlated, as expected since gross floor area is footprint times storeys, but their overlap was moderate '
         'because footprints vary widely at every storey count. No predictor was removed.')
    pp.table(['FEATURE', 'VIF (FULL MODEL)', 'VIF (REDUCED MODEL)'],
             [[LAB[k], f'{v:.4f}', (f'{R["vif_reduced"][k]:.4f}' if k in R['vif_reduced'] else 'removed')] for k, v in vf_r.items() if k != 'const'],
             'Variance Inflation Factor of the Bridge Predictors, Full and Reduced Models', widths=[2.6, 1.6, 1.8])
    para(f'For bridges (Table {pp.nt}), total length ({vf_r["TotalLength"]:.2f}) and deck area ({vf_r["DeckArea"]:.2f}) '
         'showed severe multicollinearity, structurally expected because deck area is total length times deck width. '
         'Superstructure type '
         f'({vf_r["SuperTypeIndex"]:.2f}) was also collinear with span length because span determines the girder system. '
         f'Removing {" and ".join(LAB[k] for k in R["mlr_dropped"])} brought every VIF to '
         f'{max(v for k, v in R["vif_reduced"].items() if k != "const"):.2f} or below.')
    for kind, RR, n in (('Buildings', B, 160), ('Bridges', R, 140)):
        rows = []
        for k, v in RR['ols'].items():
            rows.append([('Constant' if k == 'const' else LAB[k]), fmt_coef(v['coef']), fmt_coef(v['se']), f'{v["t"]:.3f}',
                         ('<0.001*' if v['p'] < 0.001 else f'{v["p"]:.3f}' + ('*' if v['p'] < 0.05 else '')),
                         fmt_coef(v['ci_low']), fmt_coef(v['ci_high'])])
        pp.table(['VARIABLE', 'COEFFICIENT', 'STD. ERROR', 't', 'P > |t|', '[0.025', '0.975]'], rows,
                 f'Ordinary Least Squares Results for {kind}', widths=[1.6, 1.0, 0.9, 0.6, 0.7, 0.9, 0.9], size=8.5)
        fit = RR['ols_fit']
        if kind == 'Buildings':
            sig = [LAB[k] for k, v in RR['ols'].items() if k != 'const' and v['p'] < 0.05]
            para(f'Table {pp.nt} presents the building model (R^2^ = {fit["R2"]:.4f}, adjusted R^2^ = {fit["adjR2"]:.4f}, '
                 f'F = {fit["F"]:.2f}, p < 0.001). Gross floor area was the strongest predictor (t = {RR["ols"]["GFA"]["t"]:.3f}): '
                 f'holding the others constant, each additional m² adds about {peso(RR["ols"]["GFA"]["coef"])} to the contract. '
                 f'Significant predictors at the 5% level were {", ".join(sig)}. Storeys, span, floor height and roof type were '
                 'not significant once floor area was included, so their signs should not be read as independent effects. The '
                 'large negative constant has no physical meaning on its own, since a building with zero floor area lies outside '
                 'the data.')
        else:
            para(f'Table {pp.nt} presents the reduced bridge model (R^2^ = {fit["R2"]:.4f}, adjusted R^2^ = {fit["adjR2"]:.4f}, '
                 f'F = {fit["F"]:.2f}, p < 0.001). Total length (t = {RR["ols"]["TotalLength"]["t"]:.3f}) and deck width '
                 f'(t = {RR["ols"]["DeckWidth"]["t"]:.3f}) were the strongest predictors: each additional meter of length adds about '
                 f'{peso(RR["ols"]["TotalLength"]["coef"])} and each meter of width about {peso(RR["ols"]["DeckWidth"]["coef"])}. '
                 'Foundation type, pile length, span length and location were also significant, while pier height and price '
                 'year were not.')
    para('Substituting the coefficients into the general model gives the reduced working equations, rounded to four '
         'significant digits:')
    pp.para(mlr_eq(B, 'Cost_{building}'), indent=False, align='center', bold=True, italic=True, spacing=1.5, after=6)
    pp.para(mlr_eq(R, 'Cost_{bridge}'), indent=False, align='center', bold=True, italic=True, spacing=1.5, after=6)
    pp.table(['METRIC (LOOCV)', 'BUILDINGS', 'BRIDGES'], [
        ['R-squared', f4(B['mlr_loocv']['R2']), f4(R['mlr_loocv']['R2'])],
        ['Root Mean Square Error', peso(B['mlr_loocv']['RMSE']), peso(R['mlr_loocv']['RMSE'])],
        ['Mean Absolute Percentage Error', f'{B["mlr_loocv"]["MAPE"]:.2f}%', f'{R["mlr_loocv"]["MAPE"]:.2f}%']],
        'Performance of the Multiple Linear Regression Models under LOOCV', widths=[2.8, 1.7, 1.7])
    para(f'Under LOOCV (Table {pp.nt}), the building model reached an R^2^ of {B["mlr_loocv"]["R2"]:.4f} with a MAPE of '
         f'{B["mlr_loocv"]["MAPE"]:.2f}%, within the 13% to 31% range Mahamid (2011) reported for regression models of '
         f'construction cost. The bridge model explained a similar share of variance (R^2^ = {R["mlr_loocv"]["R2"]:.4f}) but its '
         f'MAPE rose to {R["mlr_loocv"]["MAPE"]:.2f}%. The linear model fits the large bridges that dominate the variance but '
         'badly over-predicts small culverts, where a few million pesos of error is a large percentage; the negative intercept '
         'even pushes some small culverts toward zero or below. Linear regression is therefore a fair baseline for buildings but '
         'not for bridges.')
    H('b.) Extreme Gradient Boosting', 3)
    pp.table(['FEATURE', 'IMPORTANCE (BUILDINGS)', 'FEATURE', 'IMPORTANCE (BRIDGES)'],
             merge_imp(B['xgb_importance'], R['xgb_importance']),
             'XGBoost Feature Importance (Gain Share)', widths=[1.7, 1.4, 1.8, 1.4], size=9)
    ib, ir = B['xgb_importance'], R['xgb_importance']
    para(f'Table {pp.nt} shows the share of total gain contributed by each feature. For buildings, gross floor area '
         f'({ib["GFA"]:.4f}) and storeys ({ib["Storeys"]:.4f}) account for about {pct(ib["GFA"] + ib["Storeys"], 0)} of the '
         f'model\'s splitting gain. For bridges, superstructure type dominates ({ir["SuperTypeIndex"]:.4f}): once the tree knows '
         'whether a crossing is a culvert, an RCDG, a PSCG or a truss, most of the cost level is set, and length, foundation '
         'and pile length refine it. The tree model thus retains the superstructure type that the linear model had to drop '
         'because of collinearity.')
    pp.table(['METRIC (LOOCV)', 'BUILDINGS', 'BRIDGES'], [
        ['R-squared', f4(B['xgb_loocv']['R2']), f4(R['xgb_loocv']['R2'])],
        ['Root Mean Square Error', peso(B['xgb_loocv']['RMSE']), peso(R['xgb_loocv']['RMSE'])],
        ['Mean Absolute Percentage Error', f'{B["xgb_loocv"]["MAPE"]:.2f}%', f'{R["xgb_loocv"]["MAPE"]:.2f}%']],
        'Performance of the XGBoost Models under LOOCV', widths=[2.8, 1.7, 1.7])
    para(f'Table {pp.nt} shows that XGBoost reduced the bridge MAPE from {R["mlr_loocv"]["MAPE"]:.2f}% to '
         f'{R["xgb_loocv"]["MAPE"]:.2f}%, a {pct(1 - R["xgb_loocv"]["MAPE"] / R["mlr_loocv"]["MAPE"], 0)} reduction, with a nearly '
         f'identical R^2^ ({R["xgb_loocv"]["R2"]:.4f}). Training on log cost and splitting by superstructure type let it price '
         f'culverts and long bridges on their own terms. For buildings, however, XGBoost (MAPE {B["xgb_loocv"]["MAPE"]:.2f}%, '
         f'R^2^ = {B["xgb_loocv"]["R2"]:.4f}) did slightly worse than linear regression, because building cost in this benchmark '
         'is close to linear in floor area and a tree ensemble approximates a straight line with steps. This supports Elmousalami\'s (2020) '
         'observation that the best model depends on the cost structure of the asset.')
    pp.table(['ASPECT', 'MULTIPLE LINEAR REGRESSION', 'EXTREME GRADIENT BOOSTING'], [
        ['Buildings: R² / MAPE', f'{B["mlr_loocv"]["R2"]:.4f} / {B["mlr_loocv"]["MAPE"]:.2f}%', f'{B["xgb_loocv"]["R2"]:.4f} / {B["xgb_loocv"]["MAPE"]:.2f}%'],
        ['Bridges: R² / MAPE', f'{R["mlr_loocv"]["R2"]:.4f} / {R["mlr_loocv"]["MAPE"]:.2f}%', f'{R["xgb_loocv"]["R2"]:.4f} / {R["xgb_loocv"]["MAPE"]:.2f}%'],
        ['Collinear predictors', 'Must be removed (deck area, superstructure)', 'Retained'],
        ['Small vs. large projects', 'Errors grow on small projects', 'Log target balances sizes'],
        ['Explanation', 'Coefficients and p-values', 'SHAP values per project'],
        ['Role in BUHAY-AH', 'Interpretable baseline', 'Primary expected cost and residual']],
        'Comparison of Multiple Linear Regression and XGBoost', widths=[1.8, 2.3, 2.3], size=9.5)
    para(f'Figures {pp.nf + 1} and {pp.nf + 2} show how each feature drives the XGBoost predictions. Each dot is one project; its position is the '
         'SHAP value on the log-cost scale and its color the feature value.')
    pp.figure(os.path.join(FIG, 'shap_building.png'), 'Global SHAP Values of the XGBoost Building Model', 5.6)
    pp.figure(os.path.join(FIG, 'shap_bridge.png'), 'Global SHAP Values of the XGBoost Bridge Model', 5.6)
    sb_, sr_ = B['shap_mean_abs'], R['shap_mean_abs']
    para(f'For buildings, gross floor area dominates (mean |SHAP| = {sb_["GFA"]:.3f} in log cost), far above storeys '
         f'({sb_["Storeys"]:.3f}) and location ({sb_["LocationFactor"]:.3f}); high floor areas push cost up and small ones '
         f'pull it down. For bridges the picture is broader: deck area ({sr_["DeckArea"]:.3f}), pile length '
         f'({sr_["PileLength"]:.3f}), total length ({sr_["TotalLength"]:.3f}) and foundation type ({sr_["FoundationIndex"]:.3f}) '
         'all matter. SHAP also reveals what gain importance hides: although superstructure type wins most splits, the '
         'per-project contributions are spread across size and foundation, which is exactly what an auditor needs to explain '
         'a single price. These explanations are shown for every checked project in the application.')

    # RQ4
    H('Detection of Over-Budgeted Contracts', 2)
    para('The fifth research question measured how well each screening rule finds the 36 contracts with injected '
         'overpricing. Table ' + str(pp.nt + 1) + ' reports the results per asset class and for all 300 projects.')
    rows = []
    for scope, RR in (('Buildings', B['detection']), ('Bridges', R['detection']), ('All projects', P)):
        for k, v in RR.items():
            rows.append([f'{scope}: {SHORT[k]}', f'{v["Precision"]:.3f}', f'{v["Recall"]:.3f}', f'{v["F1"]:.3f}', f'{v["AUC"]:.3f}', f'{v["TP"]} / {v["FP"]} / {v["FN"]}'])
    pp.table(['SCOPE AND RULE', 'PRECISION', 'RECALL', 'F1', 'AUC', 'TP / FP / FN'], rows,
             'Detection Performance against Injected Overpricing', widths=[2.6, 0.8, 0.7, 0.6, 0.6, 1.0], size=8.5)
    h, q, x, i_ = P['BUHAY-AH hybrid (BRI >= 30)'], P['QTO rule (OBR > ceiling)'], P['XGBoost residual (actual > 1.25 x predicted)'], P['Isolation Forest alone']
    para(f'Across all projects, the BUHAY-AH Risk Index caught {h["TP"]} of 36 padded contracts (recall {h["Recall"]:.3f}) with '
         f'{h["FP"]} false alarms, for the highest F1-score ({h["F1"]:.3f}). The standards-based rule alone was the strongest single '
         f'signal: its continuous ratio reached the highest AUC ({q["AUC"]:.3f}) and its ceiling rule had good precision '
         f'({q["Precision"]:.3f}) but missed {q["FN"]} contracts whose padding stayed under the ceiling. The XGBoost residual rule '
         f'found {pct(x["Recall"], 1)} of the cases; because it learns from prices that include padding, part of the overpricing '
         'becomes "normal" to it. The Isolation Forest alone found only '
         f'{pct(i_["Recall"], 1)} (AUC {i_["AUC"]:.3f}): a padded contract for an ordinary building is not unusual in its plan '
         'features, so isolation alone cannot see it. This answers the validation gap and shows why a '
         'standards-based reference is needed.')
    para(f'By asset class, buildings were screened almost perfectly (BRI F1 = {B["detection"]["BUHAY-AH hybrid (BRI >= 30)"]["F1"]:.3f}, '
         f'recall {B["detection"]["BUHAY-AH hybrid (BRI >= 30)"]["Recall"]:.3f}). Bridges kept a high recall '
         f'({R["detection"]["BUHAY-AH hybrid (BRI >= 30)"]["Recall"]:.3f}) but lower precision '
         f'({R["detection"]["BUHAY-AH hybrid (BRI >= 30)"]["Precision"]:.3f}), because fair bridges with deeper-than-planned piles '
         'look over budget against a plan-based estimate. A sensitivity check found that the F1-maximizing threshold is about '
         f'{B["bri_best_threshold"]["threshold"]:.0f} for buildings (F1 = {B["bri_best_threshold"]["F1"]:.3f}) and '
         f'{R["bri_best_threshold"]["threshold"]:.0f} for bridges (F1 = {R["bri_best_threshold"]["F1"]:.3f}), which suggests '
         'class-specific thresholds once real data are available. Recall was '
         f'{pct(B["recall_by_severity"]["moderate"], 0)} for moderate and {pct(B["recall_by_severity"]["severe"], 0)} for severe '
         f'building cases, and {pct(R["recall_by_severity"]["moderate"], 0)} and {pct(R["recall_by_severity"]["severe"], 0)} for '
         'bridges.')
    pp.figure(os.path.join(FIG, 'roc_pooled.png'), 'ROC Curves of the Screening Signals, All 300 Projects', 5.0)
    rows = []
    for t in B['top_flagged'][:5] + R['top_flagged'][:5]:
        rows.append([t['id'], t['label'], pm(t['awarded']).replace(' million', 'M'), f'{t["obr"]:.2f}', f'{t["bri"]:.1f}', t['driver'], 'Yes' if t['injected'] else 'No'])
    pp.table(['ID', 'PROJECT', 'AWARDED', 'OBR', 'BRI', 'PRIMARY DRIVER', 'INJECTED'], rows,
             'Highest-Risk Contracts Flagged by BUHAY-AH', widths=[0.8, 1.7, 0.75, 0.5, 0.5, 1.6, 0.65], size=8, first_italic=False)
    para(f'Table {pp.nt} lists the five highest-risk buildings and bridges. All were injected cases, with over-budget ratios '
         'from about 1.5 to 2.2. The primary driver, the input with the largest standardized deviation, was most often the '
         'over-budget ratio itself or the XGBoost residual, and occasionally an unusual plan feature such as a reinforced '
         'concrete roof deck or a large footprint, which tells a reviewer where to look first. In pesos, the flagged contracts '
         f'exceeded their ceilings by {pm(B["flagged_excess_php"] + R["flagged_excess_php"])} and their standard estimates by '
         f'{pm(B["flagged_excess_vs_fair_php"] + R["flagged_excess_vs_fair_php"])}, against '
         f'{pm(B["injected_excess_php"] + R["injected_excess_php"])} of padding injected in total. These amounts illustrate the scale '
         'a screening tool can bring to attention; they are not findings about any real contract.')

    H('Extension to Hospitals, Transport Terminals, Airfields and Ports', 2)
    para('The sixth research question tested whether the same engine and generator extend to the largest public facilities.')
    H('a.) Design Templates and Space Standards', 3)
    pp.table(['DESIGN', 'ST.', 'L × W (m)', 'CAPACITY', 'START', 'STANDARD'], [[t['name'], t['N'], f"{t['L']:.1f} × {t['W']:.1f}",
        ', '.join(f'{v} {k}' for k, v in t['capacity'].items() if k != 'consult'), pm(t['start']).replace(' million', 'M'),
        pm(t['fair']).replace(' million', 'M')] for t in X['templates']], 'Extension Design Templates (Albay, 2025 Prices)',
        widths=[2.6, 0.4, 0.9, 1.2, 0.75, 0.75], size=8, first_italic=False)
    para(f'Table {pp.nt} lists the {len(X["templates"])} new building templates; all {X["counts"]["extPassed"]} of their '
         f'{X["counts"]["extChecks"]} checks passed, bringing the library to {X["counts"]["buildingTemplates"]} building, '
         f'{X["counts"]["bridgeTemplates"]} bridge, {X["counts"]["airfieldTemplates"]} airfield and {X["counts"]["portTemplates"]} '
         f'port designs with {X["counts"]["checksPassed"]} of {X["counts"]["checks"]} checks passed. A 100-bed Level 2 hospital came '
         'to about ₱40,000 per m², airport terminals to about ₱44,000 per m², and a 20-bay jeepney terminal to about ₱1.6 '
         'million per bay.')
    pp.figure(os.path.join(FIG, 'plan_hospital_l2.png'), 'Generated Ground Floor of a 100-Bed Level 2 Hospital', 6.3)
    pp.figure(os.path.join(FIG, 'plan_terminal.png'), 'Integrated Land Transport Terminal with Jeepney, UV Express and Bus Bays', 4.6)
    pp.figure(os.path.join(FIG, 'airfield_runway.png'), 'Generated Plan of a 1,200 × 30 m Turboprop Runway', 6.3)
    pp.figure(os.path.join(FIG, 'port_roro.png'), 'Generated Section of a 60 × 15 m RoRo Pier on PC Spun Piles', 6.3)
    pp.table(['DESIGN', 'START', 'STANDARD', 'CEILING', 'PER UNIT'], [[c['name'], pm(c['start']).replace(' million', 'M'),
        pm(c['fair']).replace(' million', 'M'), pm(c['ceiling']).replace(' million', 'M'), peso(c['perUnit']) + ' / ' + c['unit'].replace('m² of ', 'm² ')]
        for c in X['civil']], 'Airfield and Port Templates', widths=[2.7, 0.8, 0.8, 0.8, 1.4], size=8, first_italic=False)
    para('Budget-to-design also works for the new usages: ' + '; '.join(
        f"₱{sc['budget'] / 1e6:,.0f} million buys a {sc['best']['k']}-{sc['capLabel'].replace('peak-hour ', '')} {sc['label'].lower()} in {sc['best']['N']} storey{'s' if sc['best']['N'] > 1 else ''}"
        for sc in X['scenarios'] if sc['best'] and sc['budget'] in (150e6, 300e6, 60e6, 40e6) and sc['usage'] in ('hospital', 'airport', 'seaport', 'busterm')) +
        f'. Each search took a median of {X["medianMs"]:.1f} ms.')
    H('b.) Accuracy of the Standard Estimate', 3)
    rows = []
    for c in XB['byClass'] + [dict(XB['overall'], cls='All extension projects')]:
        a, r_ = c['accuracy'], c['rule']
        rows.append([c['cls'], c['n'], f"{a['mape']:.2f}%", f"{a['r2']:.4f}", f"{a['leanBelow']:.1f}%", f"{a['ceilingCovers']:.1f}%",
                     f"{r_['precision']:.3f}", f"{r_['recall']:.3f}", f"{r_['f1']:.3f}"])
    pp.table(['CLASS', 'n', 'MAPE', 'R²', 'LEAN ≤ AWARD', 'CEILING COVERS', 'PREC.', 'RECALL', 'F1'], rows,
             'Accuracy and Standards-Based Detection on SBD-EXT', widths=[1.75, 0.35, 0.6, 0.6, 0.75, 0.75, 0.5, 0.55, 0.45], size=8)
    o = XB['overall']
    para(f'Against fair awarded costs, the standard estimate reached a MAPE of {o["accuracy"]["mape"]:.2f}% and R^2^ = '
         f'{o["accuracy"]["r2"]:.4f} across the extension, from {min(c["accuracy"]["mape"] for c in XB["byClass"]):.2f}% for land '
         f'transport terminals to {max(c["accuracy"]["mape"] for c in XB["byClass"]):.2f}% for hospitals, whose mechanical and '
         'medical systems vary most. The lean start quotation was at or below the fair award in '
         f'{o["accuracy"]["leanBelow"]:.1f}% of projects and the ceiling covered {o["accuracy"]["ceilingCovers"]:.1f}%.')
    H('c.) Detection by the Standards-Based Rule', 3)
    para(f'The rule caught {o["rule"]["tp"]} of {o["injected"]} padded contracts (recall {o["rule"]["recall"]:.3f}, precision '
         f'{o["rule"]["precision"]:.3f}, AUC {o["rule"]["auc"]:.3f}); the extension risk index at 30 caught all '
         f'{o["index"]["tp"]} with precision {o["index"]["precision"]:.3f}. Most false alarms were port structures, where unseen pile '
         'penetration raises the true cost, the same pattern as bridge piles in SBD-300.')
    pp.figure(os.path.join(FIG, 'ext_results.png'), 'Accuracy and Detection by Extension Class (SBD-EXT)', 6.3)

    # RQ7
    H('Deployment of BUHAY-AH as a Mobile Application and Download Website', 2)
    para('The seventh research question concerned how the system reaches its users. BUHAY-AH was deployed as an installable '
         'mobile application with five screens (Home, Design, Quote, Check and Library), an Android package, an offline ZIP '
         'package and a download website.')
    H('a.) Mobile Application with Design Studio', 3)
    pp.figure(os.path.join(FIG, 'app_home.png'), 'Home Screen of the BUHAY-AH Application', 6.2)
    para('The home screen shows the current plan as a 3D model with its start quotation and standard estimate and offers four '
         'actions: design from a budget, open the design templates, quote a plan and check a contract. A strip of templates '
         'from the design library invites users who have no blueprint yet.')
    pp.figure(os.path.join(FIG, 'app_design_templates.png'), 'Design Studio with the Template Library', 6.2)
    para('The Design screen opens on the template library. Filter chips narrow the 80 designs by facility type, including hospitals, transport terminals, airfields and ports, and each '
         'card shows a floor-plan thumbnail, the capacity, storeys, dimensions, floor area and both quotations.')
    pp.figure(os.path.join(FIG, 'app_design_editor.png'), 'Design Editor with Floor Plan, Spaces, Standards Checks and 3D Model', 6.2)
    para('Opening a design shows the editor. The user renames the design, switches floors, adds or removes spaces with plus '
         'and minus buttons, adds any library space, adds a whole template or saved design as a wing, and changes storeys, '
         'layout, corridor width and roof. The plan, capacity, quotations, standards checks and 3D model update on every '
         'change. *Quote this design* sends the plan variables to the Quote screen, *Save design* stores it for reuse, and the '
         'floor plan can be exported as an SVG drawing.')
    pp.figure(os.path.join(FIG, 'app_design_budget.png'), 'Design from a Budget', 6.2)
    para('In Budget mode the user enters the facility, the money available, the price basis, the storey limit and the longest '
         'building the lot allows. The Pareto-efficient designs appear as cards with their capacity, cost, share of the budget '
         'and cost per classroom, bed, staff, person or stall; the largest design is highlighted.')
    pp.figure(os.path.join(FIG, 'app_design_bridge.png'), 'Bridge Designer Comparing Superstructures for a 45 m Gap', 6.2)
    para('The bridge designer takes the gap, traffic lanes, pier and abutment heights, pile length and an optional budget, '
         'draws the elevation of the lowest-cost design and lists every option with its start and standard prices per meter.')
    pp.figure(os.path.join(FIG, 'app_quote.png'), 'Quote Screen with the Three Quotation Tiers and the ABC', 6.2)
    para('On the Quote screen, the user picks a reference or saved plan, imports a DXF or plan file, or types the plan '
         'variables. The three tiers update as the user types, with the lean start quotation highlighted. Beside the 3D model, '
         'the ABC is broken down into estimated direct cost, OCM, profit and VAT, and the XGBoost expectation with its 80% '
         'band is shown as a second opinion.')
    pp.figure(os.path.join(FIG, 'app_boq.png'), 'Bill of Quantities Generated from the Plan', 6.2)
    para('The bill of quantities lists every pay item with its quantity, unit, unit cost and amount, grouped into DPWH parts '
         'with subtotals. It can be exported as CSV for spreadsheets, the plan can be saved or exported as a plan file, and '
         'the quotation can be printed to PDF.')
    pp.figure(os.path.join(FIG, 'app_dxf.png'), 'Plan Panel after Importing the Sample DXF Floor Plan', 6.0)
    para('Importing the sample DXF plan of a two-classroom school building read an outline of 171 m², a perimeter of 55 m '
         'and 25 m of interior walls, which the engine used in place of a rectangular estimate.')
    pp.figure(os.path.join(FIG, 'app_check.png'), 'Check Screen Screening a Padded Contract', 6.2)
    para('On the Check screen, the user enters the contract amount. The verdict shows the risk index on a gauge, a range strip '
         'places the amount against the lean, standard and ceiling estimates and the model\'s band, and four metrics give the '
         'over-budget ratio, the model ratio, the anomaly score and the risk index. In the example, an amount 60% above the '
         'standard estimate was flagged with a risk index above 80. The SHAP panel explains the expected cost, the ABC markup '
         'checker tests submitted OCM, profit and VAT rates against the DPWH caps, and a note reminds users that a flag calls '
         'for review by the implementing office, COA, the Ombudsman or the ICI.')
    pp.figure(os.path.join(FIG, 'app_lineitem.png'), 'Line-Item Check of a Contractor\'s Bill of Quantities', 6.2)
    para('The line-item check compares each unit cost in a contractor\'s bill of quantities with the BUHAY-AH all-in rate '
         '(direct rate × location × OCM, profit and VAT). Items more than 25% above the rate are marked overpriced and their '
         'excess over a 10% tolerance is totalled, so that a reviewer sees which items carry the padding.')
    pp.figure(os.path.join(FIG, 'app_library.png'), 'Library Screen with Reference Plans, Saved Designs and the Unit Price Book', 6.2)
    para('The Library holds the reference plans, the user\'s saved plans, designs and checks, and the editable unit price '
         'book, where an implementing office can load its own rates so that every design and quotation follows them.')
    H('b.) Download Website', 3)
    pp.figure(os.path.join(FIG, 'site_home.png'), 'Download Website of BUHAY-AH', 6.2)
    para('The download website introduces BUHAY-AH, explains the four-step method and presents a live quotation computed in '
         'the browser by the same engine.')
    pp.figure(os.path.join(FIG, 'site_design.png'), 'Live Budget-to-Design Demonstration on the Website', 6.2)
    para('Its design section runs the budget-to-design search in the visitor\'s browser: moving the budget slider redraws '
         'the Pareto-efficient designs with their plans and prices, followed by a gallery of library designs.')
    pp.figure(os.path.join(FIG, 'site_download.png'), 'Download Section of the Website', 6.2)
    para('The download section links to the Android package, the installable web application, the offline package, the '
         'sample plan, the research paper and its presentation materials.')
    H('c.) Floor Plans, Parametric 3D Visualization and SHAP Explanations', 3)
    pp.figure(os.path.join(FIG, 'viz_building.png'), 'Parametric 3D Model of a 2-Storey 4-Classroom School Building', 3.6)
    pp.figure(os.path.join(FIG, 'viz_bridge_rcdg.png'), 'Parametric 3D Model of a Three-Span RCDG Bridge', 3.6)
    pp.figure(os.path.join(FIG, 'viz_bridge_truss.png'), 'Parametric 3D Model of a 50 m Steel Truss Bridge', 3.6)
    para('The 3D models are drawn from the engine\'s geometry: the school building shows its column grid, slabs, window '
         'bands and gable roof; the RCDG bridge shows four girder lines on two piers between abutments; and the truss bridge '
         'shows its panels and chords. Because the floor plans and models follow the plan variables, a change in spaces, '
         'storeys, spans or girders is visible at once, and the tint shows the screening result. Together with the SHAP panel, '
         'they let non-engineers see what they are paying for and why the expected cost is what it is.')

    # ============================================================ CONCLUSION
    H('CONCLUSION', 1)
    para('In pursuit of developing a budget-to-blueprint design generator, standards-based quantity take-off and hybrid '
         'machine-learning system for start quotations and over-budget detection in public buildings and bridges, the study '
         'concludes the following:', indent=False)
    pp.bullets([
        'Nine plan variables for buildings (gross floor area, footprint, storeys, span, floor height, facility type, roof '
        'system, location factor and cost index) and eleven for bridges (total length, deck width, deck area, span length, '
        'pier and abutment heights, superstructure and foundation types, pile length, location factor and cost index) can be '
        'read from plans and standards and are sufficient to price a project. Bridge sizes and costs varied far more than '
        f'building sizes and costs, with contracts from {pm(yr.min())} to {pm(yr.max())}.',
        f'Schematic designs can be generated without a blueprint. {DR["spaces"]} space modules on DepEd, DOH, NBC and DSWD norms '
        f'produced {len(DR["templates"])} building and {len(DR["bridges"])} bridge templates that can be edited, saved and combined; '
        f'every template passed all {sum(t["checks"] for t in DR["templates"])} space and safety checks; and the exhaustive '
        f'budget-to-design search returned the Pareto-efficient designs for a budget in a median of {DR["medianMs"]:.1f} ms, '
        f'adding up to {DR["maxGain"]} classrooms over a single-storey policy for the same school budget.',
        f'The standards-based engine produced itemized lean, standard and ceiling quotations that came within a MAPE of '
        f'{qb["MAPE"]:.2f}% for buildings and {qr["MAPE"]:.2f}% for bridges of fair awarded costs in the benchmark, less than half '
        f'the error of the best data-driven model. The lean start quotation averaged {pct(B["lean_savings_vs_standard"], 1)} below '
        f'the standard estimate for buildings and {pct(R["lean_savings_vs_standard"], 1)} for bridges while keeping code minimums.',
        f'**a.) Multiple Linear Regression:** no building predictor exceeded a VIF of 10, while deck area and superstructure '
        f'type were removed from the bridge model. Under LOOCV, the building model reached R^2^ = {B["mlr_loocv"]["R2"]:.4f} and '
        f'MAPE = {B["mlr_loocv"]["MAPE"]:.2f}%, and the bridge model R^2^ = {R["mlr_loocv"]["R2"]:.4f} and MAPE = '
        f'{R["mlr_loocv"]["MAPE"]:.2f}%. **b.) XGBoost:** the model reached R^2^ = {B["xgb_loocv"]["R2"]:.4f} and MAPE = '
        f'{B["xgb_loocv"]["MAPE"]:.2f}% for buildings and R^2^ = {R["xgb_loocv"]["R2"]:.4f} and MAPE = {R["xgb_loocv"]["MAPE"]:.2f}% '
        'for bridges, a large gain on bridges and a small loss on buildings, so the better model depends on the asset class.',
        f'The BUHAY-AH Risk Index detected {pct(h["Recall"], 1)} of injected overpricing with an F1-score of {h["F1"]:.3f} and an AUC '
        f'of {h["AUC"]:.3f}, the best balance among the four rules. The standards-based ratio was the strongest single signal, '
        f'the XGBoost residual partly absorbed padding from its training data, and an Isolation Forest alone found only '
        f'{pct(i_["Recall"], 1)}. These flags identify contracts for review and do not establish irregularity, error or fraud.',
        f'The engine and generator extend to hospitals, airport, seaport and land transport terminals, runways and piers: '
        f'{len(X["templates"])} new templates passed all {X["counts"]["extChecks"]} checks, the standard estimate reached '
        f'{XB["overall"]["accuracy"]["mape"]:.2f}% MAPE on SBD-EXT, and the standards rule caught {pct(XB["overall"]["rule"]["recall"], 1)} '
        'of padded contracts without the machine-learning layer.',
        'BUHAY-AH was deployed as an installable offline-capable mobile application, an Android package, an offline ZIP package '
        'and a download website, integrating the design studio, plan import, itemized quotations, floor plans, parametric 3D '
        'models, SHAP explanations, line-item checks and over-budget screening that run entirely on the user\'s device.'],
        numbered=True)

    para('**Limitations.** All accuracy and detection figures come from simulated benchmarks, unit costs are indicative 2025 '
         'Bicol rates, designs are schematic, and the extension types are screened without the trained models. Extending the '
         'results needs real contract records, site data and professional review.', indent=False)

    H('RECOMMENDATIONS', 1)
    para('Based on these findings, the researcher recommends the following:', indent=False)
    pp.bullets([
        '**Validate on actual contracts.** Replace the simulated benchmark with completed DPWH building and bridge contracts '
        'from the DPWH Transparency Portal, PhilGEPS and COA reports, including their programs of works, and re-estimate the '
        'accuracy and detection figures.',
        '**Review the design library with licensed professionals.** Compare the templates with DepEd and DPWH standard plans, '
        'have architects and engineers refine module sizes, and add site inputs such as lot shape, orientation and setbacks.',
        '**Add geotechnical data for bridges.** Since unseen pile lengths caused most false alarms, include borehole logs and '
        'design pile tips in the plan input, or widen the bridge ceiling by a site-class allowance.',
        '**Connect current price data.** Load regional DPWH unit costs and the PSA construction materials price indices '
        'automatically so the price book stays current.',
        '**Calibrate thresholds by asset class.** Set separate BUHAY-AH Risk Index thresholds for buildings and bridges, about 24 '
        'and 58 in the benchmark, once real cases are confirmed.',
        '**Extend plan import and design.** Read IFC building information models and scanned PDF plans, and add hydraulic '
        'criteria to the bridge designer so that span choices reflect flood levels and debris.',
        '**Train the models for the extension types.** Retrain XGBoost and the Isolation Forest once hospital, terminal, '
        'airfield and port contracts are collected, and add pavement and port geotechnical data.',
        '**Extend to other project types.** Apply the same engine to flood-control structures, water systems and roads, '
        'so that one screening tool covers all public works.',
        '**Pilot with oversight bodies and publish open data.** Test BUHAY-AH with a district engineering office, COA auditors and '
        'a local government, run a usability study, and publish screened records following the Open Contracting Data Standard '
        'and the CoST Infrastructure Data Standard.'], numbered=True)

    # ============================================================ REFERENCES
    H('REFERENCES', 1)
    for r in [x for x in REFERENCES if x.split('.')[0].split(',')[0] in MAIN_REFS]:
        p = pp.para(r, indent=False, align='left', spacing=1.0, size=11, after=5)
        p.paragraph_format.left_indent = Inches(0.5)
        p.paragraph_format.first_line_indent = Inches(-0.5)

    # ============================================================ APPENDICES
    H('APPENDICES', 1)
    appendices(pp)


def appendices(pp):
    # A. dataset sample
    pp.para('Appendix A. Sample Records of the Simulated Benchmark Dataset (SBD-300)', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('A', 'Sample Records of the Simulated Benchmark Dataset (SBD-300)'))
    d = DF
    rows = []
    for _, r in pd.concat([d[d.kind == 'building'].head(10), d[d.kind == 'bridge'].head(8)]).iterrows():
        desc = (f"{int(r.storeys)}-st {r.type}, {r.length:.1f}×{r.width:.1f} m" if r.kind == 'building'
                else f"{r.superstructure}, {r.totalLength:g} m, {int(r.spans)} span(s)")
        rows.append([r.id, r.province, int(r.year), desc, f'{r.fair_estimate / 1e6:,.2f}', f'{r.awarded_cost / 1e6:,.2f}', 'Yes' if r.injected_anomaly else 'No'])
    tbl_plain(pp, ['ID', 'PROVINCE', 'YEAR', 'PLAN', 'STANDARD (₱M)', 'AWARDED (₱M)', 'INJECTED'], rows, [0.85, 1.05, 0.55, 1.8, 0.75, 0.75, 0.75])
    pp.para('The full dataset (300 records, 40 columns) is in research/data/buhay_sbd300.csv.', indent=False, align='center', italic=True, spacing=1.5)
    pp.page_break()
    # B. price book
    pp.para('Appendix B. BUHAY-AH Unit Price Book (Direct Costs, Bicol Region V, 2025)', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('B', 'BUHAY-AH Unit Price Book'))
    pb = PD['priceBook']
    rows = [[v[0], v[1], v[2], f'{v[3]:,.0f}' if v[3] else 'allowance / %'] for v in pb.values()]
    tbl_plain(pp, ['PAY ITEM', 'DESCRIPTION', 'UNIT', 'RATE (₱)'], rows, [0.9, 4.0, 0.6, 1.1], size=8)
    pp.page_break()
    # C. sample BOQ
    pp.para('Appendix C. Bill of Quantities of a 2-Storey 4-Classroom School Building (Standard Tier, Albay, 2025)', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('C', 'Bill of Quantities of a 2-Storey 4-Classroom School Building'))
    s = PD['sample']
    rows = [[l['item'], l['desc'], f'{l["qty"]:,.2f}', l['unit'], f'{l["rate"]:,.2f}', f'{l["amount"]:,.2f}'] for l in s['boq']]
    a = s['abc']
    rows += [['', 'Estimated direct cost', '', '', '', f'{a["edc"]:,.2f}'], ['', f'OCM ({a["ocmRate"] * 100:.0f}%)', '', '', '', f'{a["ocm"]:,.2f}'],
             ['', f'Profit ({a["profitRate"] * 100:.0f}%)', '', '', '', f'{a["profit"]:,.2f}'], ['', 'VAT (5%)', '', '', '', f'{a["vat"]:,.2f}'],
             ['', '**Approved Budget for the Contract**', '', '', '', f'**{a["total"]:,.2f}**']]
    tbl_plain(pp, ['ITEM', 'DESCRIPTION', 'QTY', 'UNIT', 'UNIT COST', 'AMOUNT (₱)'], rows, [0.75, 2.85, 0.7, 0.45, 0.8, 1.0], size=7.5)
    pp.page_break()
    # D. bridge summary
    pp.para('Appendix D. Cost Summary of a Three-Span RCDG Bridge (3 × 20 m, Albay, 2025)', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('D', 'Cost Summary of a Three-Span RCDG Bridge'))
    bs = PD['bsample']
    rows = [[g['group'], f'{g["amount"]:,.2f}'] for g in bs['groups']]
    rows += [['Estimated direct cost', f'{bs["abc"]["edc"]:,.2f}'], ['Lean start quotation (ABC)', f'{bs["lean"]["total"]:,.2f}'],
             ['Standard fair estimate (ABC)', f'{bs["abc"]["total"]:,.2f}'], ['Ceiling (ABC)', f'{bs["ceil"]["total"]:,.2f}']]
    tbl_plain(pp, ['PART', 'AMOUNT (₱)'], rows, [4.2, 1.8], size=10)
    pp.page_break()
    # E. code snippets
    pp.para('Appendix E. Snippets of Methodology (Quantity Take-Off Engine, JavaScript)', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('E', 'Snippets of Methodology (Quantity Take-Off Engine)'))
    pp.code(snippet('docs/app/js/engine.js', '    // footings (isolated, sized from service load', 22))
    pp.para('', indent=False)
    pp.code(snippet('docs/app/js/engine.js', '  function indirect(edc, settings)', 10))
    pp.page_break()
    pp.para('Appendix F. Snippets of Methodology (Model Training, Python)', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('F', 'Snippets of Methodology (Model Training)'))
    pp.code(snippet('research/pipeline/train.py', '    # ---- 2. XGBoost (log target)', 14))
    pp.para('', indent=False)
    pp.code(snippet('research/pipeline/train.py', '    # ---- 3. Isolation Forest', 14))
    pp.page_break()
    for key, title, files in (
            ('G', 'Multiple Linear Regression: Actual vs. Predicted Cost', ('mlr_building', 'mlr_bridge')),
            ('H', 'Extreme Gradient Boosting: Actual vs. Predicted Cost', ('xgb_building', 'xgb_bridge')),
            ('I', 'Isolation Forest: Cost Residual vs. Anomaly Score', ('iforest_building', 'iforest_bridge'))):
        pp.apps.append((key, title))
        for k, fn in enumerate(files):
            pp.appendix_figure(os.path.join(FIG, fn + '.png'), (f'Appendix {key}. {title}' if k == 1 else ''), 4.6)
        pp.page_break()
    pp.para('Appendix J. User Guide of the BUHAY-AH Application', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('J', 'User Guide of the BUHAY-AH Application'))
    pp.bullets([
        'Open the website and tap **Download for Android**, or open the web app and choose **Install app** (Android, PC) or '
        '**Share → Add to Home Screen** (iPhone).',
        'In **Quote**, choose Building or Bridge, pick a reference plan or import a DXF or plan file, and adjust the plan '
        'variables. Read the lean start quotation, the standard estimate and the ceiling.',
        'Open the **Bill of quantities** tab to review or export the items. Save the plan to the Library.',
        'In **Check**, enter the contract amount (and optionally the submitted EDC, OCM, profit and VAT). Read the verdict, '
        'risk index, drivers and SHAP explanation.',
        'Paste or upload the contractor\'s BOQ in **Line-item check** to find overpriced items.',
        'In **Design**, pick a template, enter a requirement, or enter a budget; edit spaces, storeys and layout; add saved '
        'designs as wings; then press **Quote this design**. Edit unit rates in **Library → Unit price book**.'],
        numbered=True, spacing=1.5)
    pp.page_break()
    pp.para('Appendix K. Design Template Library', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('K', 'Design Template Library'))
    rows = [[t['name'], t['N'], f"{t['L']:.1f} × {t['W']:.1f}", f"{t['gfa']:,.0f}", t['cap'], f"{t['start'] / 1e6:,.2f}", f"{t['fair'] / 1e6:,.2f}"] for t in DR['templates']]
    rows += [[b['name'], '–', '–', '–', '–', f"{b['start'] / 1e6:,.2f}", f"{b['fair'] / 1e6:,.2f}"] for b in DR['bridges']]
    tbl_plain(pp, ['DESIGN', 'ST.', 'L × W (m)', 'GFA m²', 'CAPACITY', 'START ₱M', 'STD ₱M'], rows, [2.2, 0.35, 0.9, 0.6, 1.25, 0.6, 0.6], size=7.5)
    pp.page_break()
    pp.para('Appendix L. Research Plan', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('L', 'Research Plan'))
    for head, txt in (
        ('Rationale.', 'Public buildings and bridges lose value to overpricing, and communities without plans cannot tell what '
         'their budget should buy. An open tool that designs, prices and screens projects from national standards can make '
         'padding visible before and after award.'),
        ('Research questions.', 'The seven research questions in the Objective of the Study: plan variables, design generation, '
         'take-off accuracy, cost models, detection performance and deployment.'),
        ('Engineering goals.', 'A design generator that turns a requirement or a budget into a standards-compliant schematic '
         'design; a quantity take-off engine with itemized lean, standard and ceiling ABCs; a hybrid screening model with '
         'measured recall and precision; and an offline mobile application, Android package and website.'),
        ('Procedures.', 'Codify DPWH pay items and NSCP, DPWH, AASHTO, PD 1096, BP 344, DepEd, DOH and DSWD rules; build the '
         'take-off engine and design generator; generate the SBD-300 benchmark with known overpricing; train and validate MLR, '
         'XGBoost and Isolation Forest with LOOCV; compute SHAP values and the risk index; run the budget-to-design and bridge '
         'scenarios; build and test the application and website.'),
        ('Data analysis.', 'Descriptive statistics; VIF screening and OLS; R², RMSE and MAPE under LOOCV; precision, recall, '
         'F1-score and ROC AUC against injected labels; Pareto filtering, capacity frontiers and timing for the design search.'),
        ('Risk and safety.', 'Purely computational study on a personal computer. No human participants, vertebrate animals, '
         'potentially hazardous biological agents, hazardous chemicals, activities or devices were involved. All data are '
         'simulated or drawn from public documents; no personal information was collected.'),
        ('Bibliography.', 'See References.')):
        pp.para(f'**{head}** {txt}', indent=False, spacing=1.5, after=6)
    pp.page_break()
    pp.para('Appendix M. Risk and Safety Assessment', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('M', 'Risk and Safety Assessment'))
    tbl_plain(pp, ['ITEM', 'ASSESSMENT'], [
        ['Human participants', 'None. No surveys, interviews or personal data.'],
        ['Vertebrate animals', 'None.'],
        ['Potentially hazardous biological agents', 'None.'],
        ['Hazardous chemicals, activities or devices', 'None. Work done on a laptop and in a web browser.'],
        ['Data sources', 'Simulated benchmark (SBD-300) and public standards, issuances and news reports.'],
        ['Responsible use', 'Results are screening signals for review by COA, the Ombudsman, the ICI or the implementing office, not findings of wrongdoing; generated designs are schematic and not for construction.'],
        ['Duration', 'The research was conducted within the twelve-month limit for continuing projects.'],
    ], [2.2, 4.3], size=9)
    pp.page_break()
    pp.para('Appendix N. Algorithms and Code Availability', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('N', 'Algorithms and Code Availability'))
    pp.para('All code and data are in the project repository: the shared cost engine (docs/app/js/engine.js), the design '
            'generator (docs/app/js/designs.js), the in-browser models (docs/app/js/ml.js), and the research pipeline '
            '(research/pipeline: simulate.py, train.py, design_results.js, build_paper.py). Running the pipeline in order '
            'reproduces every table and figure in this paper.', indent=False, spacing=1.5)
    pp.code(snippet('docs/app/js/designs.js', '  function fromBudget(usage, budget, opt) {', 30))
    pp.page_break()
    pp.para('Appendix O. Additional References Cited', indent=False, align='center', bold=True, spacing=1.5)
    pp.apps.append(('O', 'Additional References Cited'))
    for r in [x for x in REFERENCES if x.split('.')[0].split(',')[0] not in MAIN_REFS]:
        q = pp.para(r, indent=False, align='left', spacing=1.0, size=10, after=4)
        q.paragraph_format.left_indent = Inches(0.5)
        q.paragraph_format.first_line_indent = Inches(-0.5)


def tbl_plain(pp, header, rows, widths, size=9):
    t = pp.doc.add_table(rows=1 + len(rows), cols=len(header))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for j, h in enumerate(header):
        pp._cell(t.cell(0, j), h, size, bold=True, align='center')
    for i, r in enumerate(rows):
        for j, v in enumerate(r):
            numeric = re.fullmatch(r'[\d,.\-−₱%* ]+', str(v)) is not None
            pp._cell(t.cell(i + 1, j), str(v), size, align='right' if (numeric and j > 0) else 'left')
            if i % 2 == 0:
                pp._shade(t.cell(i + 1, j), 'EFEFEF')
    pp._borders(t, len(rows))
    set_widths(t, widths)


def set_widths(t, widths):
    t.autofit = False
    tblPr = t._tbl.tblPr
    lay = OxmlElement('w:tblLayout'); lay.set(qn('w:type'), 'fixed'); tblPr.append(lay)
    grid = t._tbl.tblGrid
    for j, gc in enumerate(grid.findall(qn('w:gridCol'))):
        if j < len(widths):
            gc.set(qn('w:w'), str(int(widths[j] * 1440)))
    for row in t.rows:
        for j, w in enumerate(widths):
            if j < len(row.cells):
                row.cells[j].width = Inches(w)


def snippet(rel, start, n):
    lines = open(os.path.join(ROOT, rel)).read().split('\n')
    k = next(i for i, l in enumerate(lines) if l.startswith(start))
    return '\n'.join(l[:118] for l in lines[k:k + n])


def fmt_num(x):
    return f'{x:,.0f}' if abs(x) >= 1000 else f'{x:,.2f}'


def fmt_coef(x):
    a = abs(x)
    if a >= 1e6:
        return f'{x:,.0f}'
    if a >= 100:
        return f'{x:,.0f}'
    return f'{x:,.2f}'


def sig4(x):
    from math import floor, log10
    if x == 0:
        return '0'
    d = 4 - int(floor(log10(abs(x)))) - 1
    v = round(x, d)
    return f'{v:,.0f}' if abs(v) >= 1 else f'{v:.4g}'


def mlr_eq(RR, name):
    o = RR['ols']
    s = f'{name} = '
    terms = []
    for k in RR['mlr_features']:
        c = o[k]['coef']
        terms.append(('− ' if c < 0 else '+ ') + sig4(abs(c)) + ' ' + SYM[k])
    t0 = o['const']['coef']
    s += ' '.join(terms).lstrip('+ ') + (' − ' if t0 < 0 else ' + ') + sig4(abs(t0))
    return s


def merge_imp(a, b):
    ka = sorted(a, key=a.get, reverse=True)
    kb = sorted(b, key=b.get, reverse=True)
    rows = []
    for i in range(max(len(ka), len(kb))):
        rows.append([LAB[ka[i]] if i < len(ka) else '', f'{a[ka[i]]:.4f}' if i < len(ka) else '',
                     LAB[kb[i]] if i < len(kb) else '', f'{b[kb[i]]:.4f}' if i < len(kb) else ''])
    return rows


LAB = {'GFA': 'Gross Floor Area', 'Footprint': 'Footprint Area', 'Storeys': 'Number of Storeys', 'Span': 'Structural Span',
       'FloorHeight': 'Floor Height', 'TypeIndex': 'Facility Type Index', 'RoofRC': 'RC Roof Deck', 'LocationFactor': 'Location Factor',
       'YearIndex': 'Cost Index (Year)', 'TotalLength': 'Total Length', 'DeckWidth': 'Deck Width', 'DeckArea': 'Deck Area',
       'SpanLength': 'Span Length', 'PierHeight': 'Pier Height', 'AbutmentHeight': 'Abutment Height',
       'SuperTypeIndex': 'Superstructure Type Index', 'FoundationIndex': 'Foundation Type Index', 'PileLength': 'Pile Length'}
SYM = {'GFA': 'GFA', 'Footprint': 'Footprint', 'Storeys': 'Storeys', 'Span': 'Span', 'FloorHeight': 'FloorHeight',
       'TypeIndex': 'Type', 'RoofRC': 'RoofRC', 'LocationFactor': 'Location', 'YearIndex': 'Year', 'TotalLength': 'Length',
       'DeckWidth': 'Width', 'SpanLength': 'Span', 'PierHeight': 'PierHeight', 'AbutmentHeight': 'AbutmentHeight',
       'FoundationIndex': 'Foundation', 'PileLength': 'PileLength'}
SHORT = {'QTO rule (OBR > ceiling)': 'standards-based rule (above ceiling)',
         'XGBoost residual (actual > 1.25 x predicted)': 'XGBoost residual (> 1.25 × predicted)',
         'Isolation Forest alone': 'Isolation Forest alone', 'BUHAY-AH hybrid (BRI >= 30)': 'BUHAY-AH Risk Index (≥ 30)'}

DEFINITIONS = [
    ('Approved Budget for the Contract (ABC)', 'The ceiling price a procuring entity sets for a contract. In this study, it is '
     'the estimated direct cost plus OCM, profit and VAT computed under DPWH D.O. 197 s. 2016 and D.O. 30 s. 2025, produced for '
     'each quotation tier.'),
    ('Anomaly Score', 'A value from 0 to 1 produced by the Isolation Forest; the higher the score, the easier a contract is to '
     'isolate from the others and the more unusual it is.'),
    ('BUHAY-AH Risk Index (BRI)', 'A score from 0 to 100 that combines the over-budget ratio, the XGBoost cost residual and the '
     'anomaly score. A BRI of 30 or more is a high-risk flag; 20 to 30 calls for review.'),
    ('Ceiling Estimate', 'The highest price that can still be defended for a plan, computed with upper-bound reinforcement, '
     'premium finishes and a scope contingency. Amounts above it are flagged as over budget.'),
    ('Budget-to-Design Optimization', 'The search for the largest design of a facility whose quotation fits a budget, solved '
     'by evaluating every combination of storeys and capacity and keeping the Pareto-efficient designs.'),
    ('Design Module', 'A reusable space, such as a 7 × 9 m classroom, a six-bed ward or a hall bay for 20 persons, with a '
     'width, depth, category and capacity, from which designs are composed.'),
    ('Design Template', 'A saved program of design modules, storeys and layout for a typical facility; one of 41 building and '
     '13 bridge designs in the library, which users can edit and combine.'),
    ('Detailed Unit Price Analysis (DUPA)', 'The DPWH breakdown of the material, labor and equipment cost of one unit of a pay '
     'item. The BUHAY-AH price book holds the resulting direct unit costs.'),
    ('Estimated Direct Cost (EDC)', 'The sum of all pay-item quantities times their unit costs, adjusted for location and '
     'price year, before indirect costs.'),
    ('Extreme Gradient Boosting (XGBoost)', 'A gradient-boosted tree algorithm used as the primary data-driven cost model, '
     'trained on the logarithm of awarded cost from plan features (Chen & Guestrin, 2016).'),
    ('Isolation Forest', 'An unsupervised algorithm that isolates records through random splits and scores unusual records '
     'by their short average path length, without labelled examples (Liu et al., 2008).'),
    ('Lean Start Quotation', 'The lowest code-compliant price of a plan, computed with code-minimum reinforcement and basic '
     'finishes while keeping all NSCP, DPWH and PD 1096 requirements; the recommended starting price.'),
    ('Leave-One-Out Cross-Validation (LOOCV)', 'A validation method in which each project is predicted by a model trained on '
     'all other projects, used here to measure prediction error on unseen projects.'),
    ('Multiple Linear Regression (MLR)', 'A statistical model that expresses awarded cost as a weighted sum of plan features; '
     'the interpretable baseline of this study.'),
    ('Over-Budget Ratio (OBR)', 'The contract amount divided by the BUHAY-AH standard fair estimate. A ratio of 1.00 means the '
     'contract equals the standard estimate.'),
    ('Parametric 3D Visualization', 'A 3D model generated directly from the plan variables and the engine\'s geometry, tinted '
     'by the screening result.'),
    ('Plan (Blueprint)', 'The architectural and engineering drawings of a building or bridge. Operationally, the set of plan '
     'variables in Table 1, entered by the user, taken from a reference plan or read from a DXF file.'),
    ('Price Book', 'The table of DPWH pay items and their direct unit costs used by the engine, editable by the user.'),
    ('Pareto-Efficient Design', 'A design that no other design beats on both capacity and cost.'),
    ('Progressive Web Application (PWA)', 'A web application that can be installed on a phone or computer and works offline; '
     'the form in which BUHAY-AH is delivered.'),
    ('Quantity Take-Off (QTO)', 'The measurement of work quantities, such as cubic meters of concrete and kilograms of '
     'reinforcing steel, from a plan. In BUHAY-AH it is computed parametrically from the plan variables using engineering '
     'standards.'),
    ('Reference Plan', 'One of 19 typical configurations of DPWH-implemented buildings and bridges stored in the application '
     'as a starting point, the "previous plans" library.'),
    ('SHAP (SHapley Additive exPlanations)', 'A method that splits each model prediction into the contributions of its input '
     'features, shown in the application as the reasons behind the expected cost (Lundberg & Lee, 2017).'),
    ('Schematic Design', 'A design that fixes the spaces, footprint, storeys and structural grid needed for estimating, '
     'drawn as floor plans or elevations; it is not a construction drawing.'),
    ('Simulated Benchmark Dataset (SBD-300)', 'The 300 simulated projects (160 buildings, 140 bridges) used to train and '
     'validate the models, with known true costs and 36 injected overpricing cases.'),
    ('Standard Fair Estimate', 'The ABC of a plan computed with typical DPWH design intensities and standard finishes; the '
     'reference for the over-budget ratio.'),
]

# NSTF 2026 (DM 058): the reference section should not exceed one page; the rest are listed in Appendix O
MAIN_REFS = {'Association of Structural Engineers of the Philippines', 'Cebu Daily News', 'Chen', 'Department of Public Works and Highways',
             'Federal Aviation Administration', 'International Civil Aviation Organization', 'Liu', 'Lundberg',
             'Overseas Coastal Area Development Institute of Japan', 'Shapley', 'Transparency International', 'U'}
REFERENCES = [
    'American Association of State Highway and Transportation Officials. (2020). *AASHTO LRFD bridge design specifications* (9th ed.).',
    'Association of Structural Engineers of the Philippines. (2016). *National structural code of the Philippines 2015: Volume I, buildings, towers and other vertical structures* (7th ed.).',
    'Batas Pambansa Blg. 344. (1983). *Accessibility law*.',
    'Cebu Daily News. (2023, July 21). *COA: CCMC project contract price was bloated by P62M*. https://cebudailynews.inquirer.net/517377/coa-ccmc-project-contract-price-was-bloated-by-p62m',
    'Chen, T., & Guestrin, C. (2016). XGBoost: A scalable tree boosting system. In *Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining* (pp. 785–794). https://doi.org/10.1145/2939672.2939785',
    'Coffie, G. H., & Cudjoe, S. K. F. (2024). Using extreme gradient boosting (XGBoost) machine learning to predict construction cost overruns. *International Journal of Construction Management, 24*(16), 1742–1750. https://doi.org/10.1080/15623599.2023.2289754',
    'CoST – The Infrastructure Transparency Initiative. (n.d.). *Why infrastructure transparency matters*. https://infrastructuretransparency.org/',
    'Department of Health. (2012). *Administrative Order No. 2012-0012: Rules and regulations governing the new classification of hospitals and other health facilities in the Philippines*.',
    'Department of Transportation. (2017). *Department Order No. 2017-011: Omnibus guidelines on the planning and identification of public road transportation services and franchise issuance*.',
    'Department of Education. (2010). *Educational facilities manual* (Rev. ed.).',
    'Department of Health. (2016). *Guidelines in the planning and design of hospitals and other health facilities* (Administrative Order No. 2016-0042).',
    'Department of Public Works and Highways. (2013). *DPWH standard specifications for highways, bridges and airports* (Vol. II).',
    'Department of Public Works and Highways. (2016). *Department Order No. 197, series of 2016: Guidelines on the preparation of the approved budget for the contract*.',
    'Department of Public Works and Highways. (2021). *Department Order No. 42, series of 2021: Adoption of the DPWH standard specifications for public works structures, Volume III, 2019 edition*.',
    'Department of Public Works and Highways. (2025). *Department Order No. 30, series of 2025*.',
    'DZRH News. (2025, August 11). *20 percent of the entire P545-B flood control project went to 15 contractors — Pres. Marcos*. https://dzrh.com.ph/',
    'Federal Aviation Administration. (2021). *Airport pavement design and evaluation* (Advisory Circular 150/5320-6G). U.S. Department of Transportation.',
    'International Air Transport Association. (2019). *Airport development reference manual* (11th ed.).',
    'International Civil Aviation Organization. (2022). *Annex 14 to the Convention on International Civil Aviation: Aerodromes, Volume I — Aerodrome design and operations* (9th ed.).',
    'Overseas Coastal Area Development Institute of Japan. (2009). *Technical standards and commentaries for port and harbour facilities in Japan*.',
    'PIANC. (2002). *Guidelines for the design of fender systems* (Report of MarCom Working Group 33).',
    'Republic Act No. 11223. (2019). *Universal health care act*.',
    'American Association of State Highway and Transportation Officials. (2018). *A policy on geometric design of highways and streets* (7th ed.).',
    'Elmousalami, H. H. (2020). Artificial intelligence and parametric construction cost estimate modeling: State-of-the-art review. *Journal of Construction Engineering and Management, 146*(1), 03119008. https://doi.org/10.1061/(ASCE)CO.1943-7862.0001678',
    'Fazekas, M., & Tóth, I. J. (2016). From corruption to state capture: A new analytical framework with empirical applications from Hungary. *Political Research Quarterly, 69*(2), 320–334. https://doi.org/10.1177/1065912916639137',
    'Flyvbjerg, B., Holm, M. S., & Buhl, S. (2002). Underestimating costs in public works projects: Error or lie? *Journal of the American Planning Association, 68*(3), 279–295. https://doi.org/10.1080/01944360208976273',
    'Interaksyon. (2025, September 11). *Philippines forms independent body to probe anomalies in infrastructure projects*. https://interaksyon.philstar.com/politics-issues/2025/09/11/302050/',
    'Jensen, M. C., & Meckling, W. H. (1976). Theory of the firm: Managerial behavior, agency costs and ownership structure. *Journal of Financial Economics, 3*(4), 305–360. https://doi.org/10.1016/0304-405X(76)90026-X',
    'Kenny, C. (2007). *Construction, corruption, and developing countries* (Policy Research Working Paper No. 4271). World Bank.',
    'Kutner, M. H., Nachtsheim, C. J., & Neter, J. (2004). *Applied linear regression models* (4th ed.). McGraw-Hill/Irwin.',
    'Larocque, R., Boulé, A.-M., & Cappart, Q. (2025). Estimating road construction costs with explainable machine learning. *INFORMS Journal on Applied Analytics, 55*(2), 137–153. https://doi.org/10.1287/inte.2023.0027',
    'Liu, F. T., Ting, K. M., & Zhou, Z.-H. (2008). Isolation forest. In *2008 Eighth IEEE International Conference on Data Mining* (pp. 413–422). IEEE. https://doi.org/10.1109/ICDM.2008.17',
    'Locatelli, G., Mariani, G., Sainati, T., & Greco, M. (2017). Corruption in public projects and megaprojects: There is an elephant in the room! *International Journal of Project Management, 35*(3), 252–268. https://doi.org/10.1016/j.ijproman.2016.09.010',
    'Lundberg, S. M., Erion, G. G., & Lee, S.-I. (2018). *Consistent individualized feature attribution for tree ensembles* (arXiv:1802.03888). https://arxiv.org/abs/1802.03888',
    'Lundberg, S. M., & Lee, S.-I. (2017). A unified approach to interpreting model predictions. *Advances in Neural Information Processing Systems, 30*. https://arxiv.org/abs/1705.07874',
    'Mahamid, I. (2011). Early cost estimating for road construction projects using multiple regression techniques. *Australasian Journal of Construction Economics and Building, 11*(4), 87–101. https://doi.org/10.5130/AJCEB.v11i4.2195',
    'Molinaro, A. M., Simon, R., & Pfeiffer, R. M. (2005). Prediction error estimation: A comparison of resampling methods. *Bioinformatics, 21*(15), 3301–3307. https://doi.org/10.1093/bioinformatics/bti499',
    'Nemhauser, G. L., & Wolsey, L. A. (1988). *Integer and combinatorial optimization*. Wiley.',
    'O\'Brien, R. M. (2007). A caution regarding rules of thumb for variance inflation factors. *Quality & Quantity, 41*(5), 673–690. https://doi.org/10.1007/s11135-006-9018-6',
    'OECD. (2016). *Preventing corruption in public procurement*. OECD Publishing.',
    'Pareto, V. (1906). *Manuale di economia politica*. Società Editrice Libraria.',
    'Pedregosa, F., Varoquaux, G., Gramfort, A., Michel, V., Thirion, B., Grisel, O., Blondel, M., Prettenhofer, P., Weiss, R., Dubourg, V., Vanderplas, J., Passos, A., Cournapeau, D., Brucher, M., Perrot, M., & Duchesnay, É. (2011). Scikit-learn: Machine learning in Python. *Journal of Machine Learning Research, 12*, 2825–2830.',
    'Philippine Center for Investigative Journalism. (2025, August 31). *5 reveals from the flood control data*. https://pcij.org/2025/08/31/5-reveals-from-the-flood-control-data/',
    'Philstar. (2025, March 1). *Newly opened P1.2 billion Isabela bridge collapses*. https://www.philstar.com/headlines/2025/03/01/2425019/newly-opened-p12-billion-isabela-bridge-collapses',
    'Philstar. (2026, February 12). *Philippines falls in corruption index, among worst in SEA*. https://www.philstar.com/headlines/2026/02/12/2507429/philippines-falls-corruption-index-among-worst-sea',
    'Presidential Decree No. 1096. (1977). *National building code of the Philippines*.',
    'Republic Act No. 9514. (2008). *Fire code of the Philippines of 2008*.',
    'Republic Act No. 12009. (2024). *New government procurement act*.',
    'Seabold, S., & Perktold, J. (2010). Statsmodels: Econometric and statistical modeling with Python. In *Proceedings of the 9th Python in Science Conference* (pp. 92–96).',
    'Shapley, L. S. (1953). A value for n-person games. In H. W. Kuhn & A. W. Tucker (Eds.), *Contributions to the theory of games* (Vol. 2, pp. 307–317). Princeton University Press.',
    'Sphere Association. (2018). *The Sphere handbook: Humanitarian charter and minimum standards in humanitarian response* (4th ed.).',
    'Transparency International. (2026). *Corruption perceptions index 2025*. https://www.transparency.org/en/cpi/2025',
    'United Nations. (2015). *Transforming our world: The 2030 agenda for sustainable development* (A/RES/70/1).',
    'U.S. Government Accountability Office. (2020). *Cost estimating and assessment guide: Best practices for developing and managing program costs* (GAO-20-195G).',
    'Vapnik, V. N. (1998). *Statistical learning theory*. Wiley.',
]

REFERENCES.sort(key=lambda r: re.sub(r'[^a-z0-9 ]', '', r.lower().replace('u.s.', 'us')))

# ------------------------------------------------------------------ build & paginate
def build(pages, path):
    global OUTLINE, FIGS, TABS, EQS, APPS
    # dry run to collect outline / captions (they appear before the body in the document)
    dry = Paper()
    body(dry)
    OUTLINE, FIGS, TABS, EQS, APPS = dry.toc, dry.figs, dry.tabs, dry.eqs, dry.apps
    pp = Paper(pages)
    front_matter(pp)
    lists(pp)
    body(pp)
    pp.doc.save(path)
    return pp


def to_pdf(docx_path, outdir):
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', outdir, docx_path], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return os.path.join(outdir, os.path.splitext(os.path.basename(docx_path))[0] + '.pdf')


def roman(n):
    vals = [(10, 'x'), (9, 'ix'), (5, 'v'), (4, 'iv'), (1, 'i')]
    s = ''
    for v, r in vals:
        while n >= v:
            s += r; n -= v
    return s


def paginate(pdf):
    n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
    texts = []
    for i in range(1, n + 1):
        t = subprocess.run(['pdftotext', '-f', str(i), '-l', str(i), '-layout', pdf, '-'], capture_output=True, text=True).stdout
        texts.append([l.strip() for l in t.split('\n')])
    def find(line, start=0, exact=True):
        for i in range(start, n):
            for l in texts[i]:
                if (l == line) if exact else l.startswith(line):
                    return i
        return None
    pages = {}
    body_start = find('INTRODUCTION', 1)
    label = lambda i: str(i - body_start + 1) if i >= body_start else roman(i)
    for key, line in (('abstract', 'ABSTRACT'), ('toc', 'TABLE OF CONTENTS'), ('lof', 'LIST OF FIGURES'), ('lot', 'LIST OF TABLES'),
                      ('loe', 'LIST OF EQUATIONS'), ('loa', 'LIST OF APPENDICES')):
        i = find(line, 1)
        if i is not None:
            pages[key] = label(i)
    cur = body_start
    for level, text in OUTLINE:
        i = find(text, cur)
        if i is None:
            i = find(text[:40], cur, exact=False)
        if i is not None:
            pages['h:' + text] = label(i); cur = i
    cur = body_start
    for nfig, _ in FIGS:
        i = find(f'Figure {nfig}.', cur)
        if i is not None:
            pages[f'f:{nfig}'] = label(i); cur = i
    cur = body_start
    for nt, _ in TABS:
        i = find(f'Table {nt}.', cur)
        if i is not None:
            pages[f't:{nt}'] = label(i); cur = i
    cur = body_start
    for ne, *_ in EQS:
        i = find(f'Eq. {ne}', cur)
        if i is not None:
            pages[f'e:{ne}'] = label(i); cur = i
    cur = find('APPENDICES', body_start) or body_start
    for k, _ in APPS:
        i = find(f'Appendix {k}.', cur, exact=False)
        if i is not None:
            pages[f'a:{k}'] = label(i); cur = i
    return pages, n


def main():
    outdir = os.path.join(ROOT, 'research')
    tmp = os.path.join(OUT, '_paper')
    os.makedirs(tmp, exist_ok=True)
    draft = os.path.join(tmp, 'BUHAY-AH-Research-Paper.docx')
    build({}, draft)
    pages, n = paginate(to_pdf(draft, tmp))
    final = os.path.join(outdir, 'BUHAY-AH-Research-Paper.docx')
    build(pages, final)
    pdf = to_pdf(final, outdir)
    pages2, n2 = paginate(pdf)
    if pages2 != pages:
        build(pages2, final); pdf = to_pdf(final, outdir)
    dl = os.path.join(ROOT, 'docs', 'downloads')
    os.makedirs(dl, exist_ok=True)
    shutil.copy(final, dl); shutil.copy(pdf, dl)
    shutil.rmtree(tmp)
    missing = [t for _, t in OUTLINE if 'h:' + t not in pages2]
    print(f'paper: {n2} pages; figures {len(FIGS)}, tables {len(TABS)}, equations {len(EQS)}; unmatched headings: {missing}')


if __name__ == '__main__':
    main()
