# BUHAY-AH — A Fight Against Corruption

**B**uildings-and-Bridges **U**nit-cost **H**ybrid **A**nalytics and **Y**ardstick for **A**ccountable and **H**onest
infrastructure.

BUHAY-AH designs, prices and checks public buildings and bridges.

- **Design:** no blueprint needed. Start from one of 41 building and 13 bridge templates, from a requirement
  (classrooms, beds, staff, evacuees, stalls), or from a budget alone. 55 reusable space modules on DepEd, DOH, NBC and
  DSWD norms are laid out into schematic floor plans that can be edited, saved and combined into other designs. The
  budget-to-design solver returns the largest Pareto-efficient designs a budget can build; the bridge designer picks the
  cheapest superstructure and span arrangement for a gap.
- **Quote:** quantities are taken off under NSCP 2015, the DPWH Standard Specifications and AASHTO LRFD, priced with
  DPWH pay items, and returned as a **lean start quotation**, a **standard fair estimate** and a **ceiling** (ABC with
  D.O. 197 s. 2016 / D.O. 30 s. 2025 indirect costs). Plans can also come from DXF or BUHAY-AH plan files.
- **Check:** a contract amount is screened with the BUHAY-AH Risk Index (over-budget ratio + XGBoost + Isolation
  Forest, explained with SHAP), plus markup and line-item checks of a contractor's BOQ.

Lead researcher: **Enrique Miguel C. Buban**

## What is in this repository

| Path | Contents |
| --- | --- |
| `research/BUHAY-AH-Research-Paper.docx` / `.pdf` | The research paper (Introduction → Appendices) |
| `research/BUHAY-AH-Rationale-Script.pdf` | Presentation script: the whole study and the role of Mathematical and Computational Sciences |
| `research/BUHAY-AH-PR2-Introduction-Methodology.pptx` | PR2 deck, IMRaD Introduction and Methodology |
| `research/BUHAY-AH-PR2-Full-Research.pptx` | PR2 deck, full research |
| `docs/app/` | The BUHAY-AH app (installable PWA; also wrapped as the Android APK) |
| `docs/index.html` | Download website with a live budget-to-design demo |
| `docs/downloads/` | Paper, rationale script, decks and the offline app ZIP |
| `docs/app/js/engine.js` | Cost engine: quantity take-off, price book, ABC, tiers (shared by app and research) |
| `docs/app/js/designs.js` | Design generator: space modules, templates, budget-to-design, bridge options, SVG plans |
| `docs/app/js/ml.js` | In-browser XGBoost, exact TreeSHAP, Isolation Forest, risk index |
| `research/pipeline/` | `simulate.py` → `train.py` → `bundle.py` → `paper_data.js` → `design_results.js` → `equations.py` → `build_paper.py`; `build_decks.js` |
| `research/data/buhay_sbd300.csv` | Simulated benchmark dataset (300 projects, 36 injected overpricing cases) |
| `research/outputs/` | Model, detection and design-generation results used in the paper |
| `.github/workflows/android-apk.yml` | Builds `BUHAY-AH.apk` and publishes it to the `apk-latest` release |

## Use it

- **Website + web app:** enable GitHub Pages (Settings → Pages → Deploy from a branch → `main`, folder `/docs`).
  The site is then at `https://<user>.github.io/<repo>/` and the app at `.../app/`.
- **Android:** every push that touches the app runs the *Build Android APK* workflow; download `BUHAY-AH.apk`
  from the `apk-latest` release (the website's Android button points there).
- **Offline:** unzip `docs/downloads/BUHAY-AH-App-Offline.zip` and open `BUHAY-AH-App/index.html`.
- **Local:** `python3 -m http.server 8080 --directory docs`, then open `http://localhost:8080`.

## Reproduce the research

```bash
pip install scikit-learn xgboost shap statsmodels pandas matplotlib python-docx
python3 research/pipeline/simulate.py      # SBD-300 dataset
python3 research/pipeline/train.py         # models, metrics, figures, app model export
python3 research/pipeline/bundle.py        # app data bundle
node research/pipeline/paper_data.js > research/outputs/paper_data.json
node research/pipeline/design_results.js   # templates, budget scenarios, bridge selection
python3 research/pipeline/equations.py
python3 research/pipeline/build_paper.py   # DOCX + PDF (needs LibreOffice)
NODE_PATH=<dir with pptxgenjs, react-icons, react, react-dom, sharp> node research/pipeline/build_decks.js
```

## Important

The models are trained and validated on a **simulated** benchmark because machine-readable plans and BOQs of awarded
DPWH buildings and bridges are not publicly available in bulk. Re-validate with actual contracts before operational use.
Unit costs are indicative 2025 Bicol rates and are editable in the app. Generated designs are schematic and for
estimating only; licensed architects and engineers must develop them. A flag is a screening signal for review by the
implementing office, COA, the Ombudsman or the ICI — not proof of wrongdoing.
