# BUHAY — A Fight Against Corruption

**B**uildings-and-Bridges **U**nit-cost **H**ybrid **A**nalytics and **Y**ardstick.

Give BUHAY the plan of a public building or bridge. It takes off the quantities under NSCP 2015, the DPWH Standard
Specifications and AASHTO LRFD, prices them with DPWH pay items, and returns a **lean start quotation**, a **standard
fair estimate** and a **ceiling** (ABC with D.O. 197 s. 2016 / D.O. 30 s. 2025 indirect costs). Give it a contract
amount and it screens for over-budgeting with the BUHAY Risk Index (over-budget ratio + XGBoost + Isolation Forest,
explained with SHAP).

Lead researcher: **Enrique Miguel C. Buban**

## What is in this repository

| Path | Contents |
| --- | --- |
| `research/BUHAY-Research-Paper.docx` / `.pdf` | The research paper (Introduction → Appendices) |
| `docs/app/` | The BUHAY app (installable PWA; also wrapped as the Android APK) |
| `docs/index.html` | Download website with the interactive project map |
| `docs/downloads/` | Paper (DOCX/PDF) and the offline app ZIP |
| `docs/app/js/engine.js` | Cost engine: quantity take-off, price book, ABC, tiers (shared by app and research) |
| `docs/app/js/ml.js` | In-browser XGBoost, exact TreeSHAP, Isolation Forest, risk index |
| `research/pipeline/` | `simulate.py` → `train.py` → `bundle.py` → `equations.py` → `build_paper.py` |
| `research/data/buhay_sbd300.csv` | Simulated benchmark dataset (300 projects, 36 injected overpricing cases) |
| `research/outputs/metrics.json` | All model and detection results used in the paper |
| `.github/workflows/android-apk.yml` | Builds `BUHAY.apk` and publishes it to the `apk-latest` release |

## Use it

- **Website + web app:** enable GitHub Pages (Settings → Pages → Deploy from a branch → `main`, folder `/docs`).
  The site is then at `https://<user>.github.io/<repo>/` and the app at `.../app/`.
- **Android:** every push that touches the app runs the *Build Android APK* workflow; download `BUHAY.apk`
  from the `apk-latest` release (the website's Android button points there).
- **Offline:** unzip `docs/downloads/BUHAY-App-Offline.zip` and open `index.html`.
- **Local:** `python3 -m http.server 8080 --directory docs`, then open `http://localhost:8080`.

## Reproduce the research

```bash
pip install scikit-learn xgboost shap statsmodels pandas matplotlib python-docx
python3 research/pipeline/simulate.py      # SBD-300 dataset
python3 research/pipeline/train.py         # models, metrics, figures, app model export
python3 research/pipeline/bundle.py        # app data bundle
node research/pipeline/paper_data.js > research/outputs/paper_data.json
python3 research/pipeline/equations.py
python3 research/pipeline/build_paper.py   # DOCX + PDF (needs LibreOffice)
```

## Important

The models are trained and validated on a **simulated** benchmark because machine-readable plans and BOQs of awarded
DPWH buildings and bridges are not publicly available in bulk. Re-validate with actual contracts before operational use.
Unit costs are indicative 2025 Bicol rates and are editable in the app. A flag is a screening signal for review by the
implementing office, COA, the Ombudsman or the ICI — not proof of wrongdoing.
