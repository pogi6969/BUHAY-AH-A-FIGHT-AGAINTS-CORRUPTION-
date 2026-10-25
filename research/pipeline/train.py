"""
BUHAY hybrid machine-learning layer.

For each asset class (buildings, bridges):
  1. Multiple Linear Regression baseline with VIF screening and LOOCV,
  2. XGBoost primary model on log cost, tuned by randomized search, LOOCV,
  3. Isolation Forest on standardized features + model residual + over-budget ratio,
  4. SHAP (tree path-dependent) explanations,
  5. BUHAY Risk Index (BRI) combining the standards-based over-budget ratio (OBR),
     the data-driven residual and the isolation score, scored against the injected
     ground-truth anomalies.
Exports the fitted models to docs/app/data/models.json for in-browser inference,
and the scored projects to docs/app/data/projects.json for the map.

Run:  python3 -I research/pipeline/train.py
"""
import json
import os
import warnings

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
import statsmodels.api as sm
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from sklearn.metrics import (f1_score, make_scorer, mean_absolute_percentage_error, mean_squared_error,
                             precision_score, r2_score, recall_score, roc_auc_score, roc_curve, accuracy_score,
                             confusion_matrix)
from sklearn.model_selection import KFold, LeaveOneOut, RandomizedSearchCV, cross_val_predict
from sklearn.preprocessing import StandardScaler
from statsmodels.stats.outliers_influence import variance_inflation_factor
from xgboost import XGBRegressor

warnings.filterwarnings('ignore')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'research', 'data', 'buhay_sbd300.csv')
OUT = os.path.join(ROOT, 'research', 'outputs')
FIG = os.path.join(ROOT, 'research', 'figures')
APPDATA = os.path.join(ROOT, 'docs', 'app', 'data')
for d in (OUT, FIG, APPDATA):
    os.makedirs(d, exist_ok=True)

plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})

FEATURES = {
    'building': ['GFA', 'Footprint', 'Storeys', 'Span', 'FloorHeight', 'TypeIndex', 'RoofRC', 'LocationFactor', 'YearIndex'],
    'bridge': ['TotalLength', 'DeckWidth', 'DeckArea', 'SpanLength', 'PierHeight', 'AbutmentHeight', 'SuperTypeIndex',
               'FoundationIndex', 'PileLength', 'LocationFactor', 'YearIndex'],
}
LABELS = {
    'GFA': 'Gross Floor Area (m²)', 'Footprint': 'Footprint Area (m²)', 'Storeys': 'Number of Storeys', 'Span': 'Structural Span (m)',
    'FloorHeight': 'Floor-to-Floor Height (m)', 'TypeIndex': 'Facility Type Index', 'RoofRC': 'RC Roof Deck (0/1)',
    'LocationFactor': 'Location Factor', 'YearIndex': 'Cost Index (Year)', 'TotalLength': 'Total Bridge Length (m)',
    'DeckWidth': 'Deck Width (m)', 'DeckArea': 'Deck Area (m²)', 'SpanLength': 'Span Length (m)', 'PierHeight': 'Pier Height (m)',
    'AbutmentHeight': 'Abutment Height (m)', 'SuperTypeIndex': 'Superstructure Type Index', 'FoundationIndex': 'Foundation Type Index',
    'PileLength': 'Pile Length (m)', 'LogMLRatio': 'XGBoost Cost Residual', 'LogOBR': 'Over-Budget Ratio (vs. QTO)',
}
PARAMS = {
    'max_depth': [2, 3, 4, 5], 'n_estimators': [100, 150, 200, 300, 400], 'learning_rate': [0.02, 0.03, 0.05, 0.07, 0.1],
    'reg_alpha': [0, 0.2, 0.5, 1.0, 2.0], 'reg_lambda': [0.5, 1.0, 2.0, 3.0], 'min_child_weight': [1, 2, 3, 5],
    'subsample': [0.7, 0.8, 0.9, 1.0], 'colsample_bytree': [0.6, 0.7, 0.8, 0.9, 1.0],
}
BRI_W = {'obr': 0.5, 'ml': 0.3, 'iso': 0.2}
BRI_FLAG = 30.0   # high-risk threshold (red)
BRI_REVIEW = 20.0  # review threshold (amber)


def metrics(y, p):
    return {'R2': float(r2_score(y, p)), 'RMSE': float(np.sqrt(mean_squared_error(y, p))),
            'MAPE': float(mean_absolute_percentage_error(y, p) * 100)}


def vif_table(X):
    Xc = sm.add_constant(X.astype(float))
    return {c: float(variance_inflation_factor(Xc.values, i)) for i, c in enumerate(Xc.columns)}


def reduce_vif(X, limit=10.0):
    cols, dropped = list(X.columns), []
    while True:
        v = vif_table(X[cols])
        v.pop('const')
        worst = max(v, key=v.get)
        if v[worst] <= limit:
            return cols, dropped
        # drop the derived/composite variable first (area = length x width; GFA = footprint x storeys)
        pref = [c for c in ('DeckArea', 'Footprint') if c in cols and v.get(c, 0) > limit]
        drop = pref[0] if pref else worst
        cols.remove(drop)
        dropped.append(drop)


def base_score_of(model):
    cfg = json.loads(model.get_booster().save_config())
    bs = cfg['learner']['learner_model_param']['base_score']
    return float(bs.strip('[]').split(',')[0])


def export_xgb(model, feats):
    dumps = model.get_booster().get_dump(dump_format='json', with_stats=True)
    trees = []
    for d in dumps:
        nodes = {}

        def walk(n):
            if 'leaf' in n:
                nodes[n['nodeid']] = [-1, 0, -1, -1, -1, n['leaf'], n['cover']]
            else:
                fi = feats.index(n['split'])
                nodes[n['nodeid']] = [fi, n['split_condition'], n['yes'], n['no'], n['missing'], 0, n['cover']]
                for c in n['children']:
                    walk(c)
        walk(json.loads(d))
        size = max(nodes) + 1
        trees.append([nodes.get(i, [-1, 0, -1, -1, -1, 0, 0]) for i in range(size)])
    return {'base_score': base_score_of(model), 'trees': trees,
            'node_format': ['feature', 'threshold', 'yes', 'no', 'missing', 'leaf', 'cover']}


def export_iforest(iso, scaler, feats):
    trees = []
    for est, fidx in zip(iso.estimators_, iso.estimators_features_):
        t = est.tree_
        trees.append({'f': [int(fidx[f]) if f >= 0 else -1 for f in t.feature],
                      't': [round(float(x), 6) for x in t.threshold],
                      'l': [int(x) for x in t.children_left], 'r': [int(x) for x in t.children_right],
                      'n': [int(x) for x in t.n_node_samples]})
    return {'features': feats, 'mean': scaler.mean_.tolist(), 'scale': scaler.scale_.tolist(),
            'offset': float(iso.offset_), 'max_samples': int(iso.max_samples_), 'trees': trees}


def bri(obr, ml_ratio, iso_score):
    s1 = np.clip((obr - 1.0) / 0.5, 0, 1)
    s2 = np.clip((ml_ratio - 1.0) / 0.5, 0, 1)
    s3 = np.clip((iso_score - 0.40) / 0.25, 0, 1)
    return 100 * (BRI_W['obr'] * s1 + BRI_W['ml'] * s2 + BRI_W['iso'] * s3)


def detection(y, flag, score=None):
    tn, fp, fn, tp = confusion_matrix(y, flag, labels=[0, 1]).ravel()
    out = {'TP': int(tp), 'FP': int(fp), 'FN': int(fn), 'TN': int(tn),
           'Precision': float(precision_score(y, flag, zero_division=0)), 'Recall': float(recall_score(y, flag, zero_division=0)),
           'F1': float(f1_score(y, flag, zero_division=0)), 'Accuracy': float(accuracy_score(y, flag))}
    if score is not None:
        out['AUC'] = float(roc_auc_score(y, score))
    return out


def scatter(y, p, title, path, color, m):
    fig, ax = plt.subplots(figsize=(5.6, 4.6))
    ax.scatter(y / 1e6, p / 1e6, s=22, c=color, edgecolor='#222', linewidth=0.4, alpha=0.85, label='Projects (LOOCV prediction)')
    lim = max(y.max(), p.max()) / 1e6 * 1.05
    ax.plot([0, lim], [0, lim], '--', color='#c0392b', lw=1.2, label='Perfect prediction (y = x)')
    ax.set_xlabel('Actual awarded cost (PHP million)')
    ax.set_ylabel('Predicted cost (PHP million)')
    ax.set_title(title, fontsize=11)
    ax.text(0.03, 0.95, f"R² = {m['R2']:.4f}\nMAPE = {m['MAPE']:.2f}%", transform=ax.transAxes, va='top',
            bbox=dict(boxstyle='round', fc='white', ec='#888'))
    ax.legend(loc='lower right', fontsize=8)
    fig.tight_layout(); fig.savefig(path, dpi=200); plt.close(fig)


def run(kind, df, report, models, scored):
    d = df[df.kind == kind].reset_index(drop=True)
    feats = FEATURES[kind]
    X = d[[f'f_{c}' for c in feats]].copy(); X.columns = feats
    y = d['awarded_cost'].values
    R = {'n': int(len(d)), 'anomalies': int(d.injected_anomaly.sum())}

    # ---- descriptive statistics
    desc = X.describe(percentiles=[.25, .5, .75]).T[['mean', 'std', 'min', '25%', '50%', '75%', 'max']]
    R['descriptive'] = desc.round(4).to_dict(orient='index')
    R['cost_range'] = [float(y.min()), float(y.max())]
    R['cost_mean'] = float(y.mean()); R['cost_median'] = float(np.median(y))

    # ---- 1. Multiple linear regression
    R['vif_full'] = vif_table(X)
    keep, dropped = reduce_vif(X)
    R['vif_reduced'] = vif_table(X[keep]); R['mlr_dropped'] = dropped; R['mlr_features'] = keep
    ols = sm.OLS(y, sm.add_constant(X[keep].astype(float))).fit()
    ci = ols.conf_int()
    R['ols'] = {k: {'coef': float(ols.params[k]), 'se': float(ols.bse[k]), 't': float(ols.tvalues[k]), 'p': float(ols.pvalues[k]),
                    'ci_low': float(ci.loc[k, 0]), 'ci_high': float(ci.loc[k, 1])} for k in ols.params.index}
    R['ols_fit'] = {'R2': float(ols.rsquared), 'adjR2': float(ols.rsquared_adj), 'F': float(ols.fvalue), 'F_p': float(ols.f_pvalue),
                    'AIC': float(ols.aic), 'BIC': float(ols.bic), 'DW': float(sm.stats.stattools.durbin_watson(ols.resid))}
    mlr_pred = cross_val_predict(LinearRegression(), X[keep], y, cv=LeaveOneOut())
    R['mlr_loocv'] = metrics(y, mlr_pred)

    # ---- 2. XGBoost (log target), tuned then LOOCV
    ylog = np.log(y)
    scorer = make_scorer(lambda yt, yp: mean_absolute_percentage_error(np.exp(yt), np.exp(yp)), greater_is_better=False)
    search = RandomizedSearchCV(XGBRegressor(objective='reg:squarederror', random_state=42, n_jobs=4), PARAMS, n_iter=40,
                                scoring=scorer, cv=KFold(5, shuffle=True, random_state=42), random_state=42, n_jobs=1)
    search.fit(X, ylog)
    best = search.best_params_
    R['xgb_params'] = {k: (float(v) if isinstance(v, float) else int(v)) for k, v in best.items()}
    xgb_pred = np.exp(cross_val_predict(XGBRegressor(objective='reg:squarederror', random_state=42, n_jobs=4, **best), X, ylog, cv=LeaveOneOut()))
    R['xgb_loocv'] = metrics(y, xgb_pred)
    final = XGBRegressor(objective='reg:squarederror', random_state=42, n_jobs=4, **best).fit(X, ylog)
    imp = final.get_booster().get_score(importance_type='gain')
    tot = sum(imp.values())
    R['xgb_importance'] = {f: float(imp.get(f, 0) / tot) for f in feats}

    # ---- standards-based estimate accuracy (QTO engine) on non-anomalous projects
    normal = d.injected_anomaly.values == 0
    R['qto_vs_awarded_normal'] = metrics(y[normal], d.fair_estimate.values[normal])
    R['xgb_vs_awarded_normal'] = metrics(y[normal], xgb_pred[normal])
    R['lean_floor_rate'] = float(np.mean(d.start_quote.values[normal] <= y[normal]))
    R['ceiling_cover_rate'] = float(np.mean(y[normal] <= d.ceiling_estimate.values[normal]))
    R['lean_vs_awarded_median_gap'] = float(np.median(1 - d.start_quote.values[normal] / y[normal]))
    R['lean_savings_vs_standard'] = float(np.mean(1 - d.start_quote / d.fair_estimate))

    # ---- 3. Isolation Forest
    obr = y / d.fair_estimate.values
    ceil_ratio = d.ceiling_estimate.values / d.fair_estimate.values
    ml_ratio = y / xgb_pred
    Z = X.copy(); Z['LogMLRatio'] = np.log(ml_ratio); Z['LogOBR'] = np.log(obr)
    scaler = StandardScaler().fit(Z.astype(float))
    Zs = scaler.transform(Z.astype(float))
    iso = IsolationForest(n_estimators=200, contamination=0.10, random_state=42).fit(Zs)
    iso_score = -iso.score_samples(Zs)            # 0..1, higher = easier to isolate
    iso_raw = iso.predict(Zs) == -1
    overcost = (ml_ratio > 1) & (obr > 1)
    iso_flag = iso_raw & overcost
    zabs = np.abs(Zs)
    zcols = list(Z.columns)
    driver = [zcols[int(np.argmax(r))] for r in zabs]
    driver_z = [float(np.max(r)) for r in zabs]

    # ---- 4. SHAP
    explainer = shap.TreeExplainer(final)
    sv = explainer.shap_values(X)
    R['shap_mean_abs'] = {f: float(v) for f, v in zip(feats, np.abs(sv).mean(0))}
    R['shap_base'] = float(np.ravel(explainer.expected_value)[0])
    plt.figure()
    shap.summary_plot(sv, X.rename(columns=LABELS), show=False, plot_size=(7.2, 4.6), color_bar_label='Feature value')
    plt.title(f'Global SHAP values — XGBoost, {kind}s (log cost)', fontsize=11)
    plt.tight_layout(); plt.savefig(os.path.join(FIG, f'shap_{kind}.png'), dpi=200); plt.close('all')

    # ---- 5. BUHAY Risk Index and detection benchmark
    risk = bri(obr, ml_ratio, iso_score)
    yt = d.injected_anomaly.values
    R['detection'] = {
        'QTO rule (OBR > ceiling)': detection(yt, (obr > ceil_ratio).astype(int), obr),
        'XGBoost residual (actual > 1.25 x predicted)': detection(yt, (ml_ratio > 1.25).astype(int), ml_ratio),
        'Isolation Forest (CORA-style)': detection(yt, iso_flag.astype(int), iso_score),
        'BUHAY hybrid (BRI >= 30)': detection(yt, (risk >= BRI_FLAG).astype(int), risk),
    }
    sev = d.severity.values
    R['recall_by_severity'] = {s: float(np.mean((risk >= BRI_FLAG)[sev == s])) for s in ('moderate', 'severe')}
    flagged = risk >= BRI_FLAG
    R['flagged_excess_php'] = float(np.sum((y - d.ceiling_estimate.values)[flagged].clip(min=0)))
    R['flagged_excess_vs_fair_php'] = float(np.sum((y - d.fair_estimate.values)[flagged].clip(min=0)))
    R['injected_excess_php'] = float(np.sum((y - y / d.injected_markup.values)[yt == 1]))
    # best-F1 threshold as a sensitivity check
    ths = np.arange(10, 60, 1.0)
    f1s = [f1_score(yt, (risk >= t).astype(int)) for t in ths]
    R['bri_best_threshold'] = {'threshold': float(ths[int(np.argmax(f1s))]), 'F1': float(max(f1s))}

    # top flagged table
    top = np.argsort(-risk)[:8]
    R['top_flagged'] = [{'id': d.id[i], 'label': label_of(d.iloc[i]), 'province': d.province[i], 'awarded': float(y[i]), 'fair': float(d.fair_estimate[i]),
                         'obr': float(obr[i]), 'ml_ratio': float(ml_ratio[i]), 'iso': float(iso_score[i]), 'bri': float(risk[i]),
                         'driver': LABELS.get(driver[i], driver[i]), 'driver_z': driver_z[i], 'injected': int(yt[i]), 'severity': sev[i]}
                        for i in top]

    # ---- figures
    scatter(y, mlr_pred, f'MLR: actual vs. predicted cost ({kind}s, LOOCV)', os.path.join(FIG, f'mlr_{kind}.png'), '#4a78b5', R['mlr_loocv'])
    scatter(y, xgb_pred, f'XGBoost: actual vs. predicted cost ({kind}s, LOOCV)', os.path.join(FIG, f'xgb_{kind}.png'), '#e08a2c', R['xgb_loocv'])
    fig, ax = plt.subplots(figsize=(5.6, 4.4))
    ax.scatter(np.log(ml_ratio)[~iso_flag], iso_score[~iso_flag], s=18, c='#7f8fa6', label='Not flagged')
    ax.scatter(np.log(ml_ratio)[iso_flag], iso_score[iso_flag], s=30, c='#d35400', edgecolor='#222', label='Isolation Forest flag (over-cost)')
    ax.scatter(np.log(ml_ratio)[yt == 1], iso_score[yt == 1], s=70, facecolor='none', edgecolor='#c0392b', lw=1.2, label='Injected anomaly (truth)')
    ax.set_xlabel('XGBoost cost residual, ln(actual / predicted)'); ax.set_ylabel('Anomaly score')
    ax.set_title(f'Isolation Forest: residual vs. anomaly score ({kind}s)', fontsize=11); ax.legend(fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, f'iforest_{kind}.png'), dpi=200); plt.close(fig)

    # ---- export models for the app
    background = X.sample(n=min(40, len(X)), random_state=7).values.tolist()
    resid_log = np.log(ml_ratio[normal])
    models[kind] = {
        'features': feats, 'labels': {f: LABELS[f] for f in feats},
        'mlr': {'features': keep, 'intercept': float(ols.params['const']), 'coef': {k: float(ols.params[k]) for k in keep}},
        'xgb': export_xgb(final, feats),
        'iforest': export_iforest(iso, scaler, zcols),
        'residual_quantiles': {q: float(np.quantile(resid_log, p)) for q, p in (('p05', .05), ('p10', .10), ('p50', .5), ('p90', .9), ('p95', .95))},
        'metrics': {'mlr': R['mlr_loocv'], 'xgb': R['xgb_loocv']},
        'shap_base': R['shap_base'], 'background': background,
    }
    # python reference predictions for parity tests in JS
    models[kind]['_parity'] = {'x': X.iloc[:5].values.tolist(), 'xgb_log': final.predict(X.iloc[:5]).tolist(),
                               'iso': (-iso.score_samples(Zs[:5])).tolist(), 'z': Z.iloc[:5].values.tolist(),
                               'shap': sv[:5].tolist()}

    for i in range(len(d)):
        row = d.iloc[i]
        status = 'red' if risk[i] >= BRI_FLAG else 'amber' if risk[i] >= BRI_REVIEW else 'green'
        scored.append({'id': row.id, 'kind': kind, 'label': label_of(row), 'province': row.province, 'year': int(row.year),
                       'lat': float(row.lat), 'lon': float(row.lon), 'plan': json.loads(row.plan_json),
                       'awarded': round(float(y[i])), 'start': round(float(row.start_quote)), 'fair': round(float(row.fair_estimate)),
                       'ceiling': round(float(row.ceiling_estimate)), 'obr': round(float(obr[i]), 4), 'mlPred': round(float(xgb_pred[i])),
                       'iso': round(float(iso_score[i]), 4), 'bri': round(float(risk[i]), 1), 'status': status,
                       'driver': LABELS.get(driver[i], driver[i]), 'simInjected': int(yt[i])})
    report[kind] = R
    return obr, ceil_ratio, ml_ratio, iso_score, risk, yt, iso_flag.astype(int)


def label_of(row):
    if row.kind == 'building':
        names = {'school': 'school building', 'office': 'government office building', 'health': 'health facility',
                 'evacuation': 'multi-purpose / evacuation center', 'dorm': 'dormitory', 'market': 'public market'}
        return f"{int(row.storeys)}-storey {names[row.type]}"
    names = {'box_culvert': 'RC box culvert', 'rcdg': 'RCDG bridge', 'pscg': 'PSCG bridge', 'steel_truss': 'steel truss bridge'}
    return f"{names[row.superstructure]}, {row.totalLength:g} m ({int(row.spans)} span{'s' if row.spans > 1 else ''})"


def main():
    df = pd.read_csv(DATA)
    report, models, scored, curves = {}, {}, [], {}
    for kind in ('building', 'bridge'):
        curves[kind] = run(kind, df, report, models, scored)
        print(kind, 'MLR', report[kind]['mlr_loocv'], 'XGB', report[kind]['xgb_loocv'])
        for k, v in report[kind]['detection'].items():
            print('   ', k, {m: round(v[m], 3) for m in ('Precision', 'Recall', 'F1', 'AUC')})

    # pooled detection benchmark
    yt = np.concatenate([curves[k][5] for k in curves])
    obr = np.concatenate([curves[k][0] for k in curves]); cr = np.concatenate([curves[k][1] for k in curves])
    mlr_ = np.concatenate([curves[k][2] for k in curves]); iso = np.concatenate([curves[k][3] for k in curves])
    risk = np.concatenate([curves[k][4] for k in curves])
    isf = np.concatenate([curves[k][6] for k in curves])
    report['pooled'] = {
        'QTO rule (OBR > ceiling)': detection(yt, (obr > cr).astype(int), obr),
        'XGBoost residual (actual > 1.25 x predicted)': detection(yt, (mlr_ > 1.25).astype(int), mlr_),
        'Isolation Forest (CORA-style)': detection(yt, isf, iso),
        'BUHAY hybrid (BRI >= 30)': detection(yt, (risk >= BRI_FLAG).astype(int), risk),
    }
    report['bri'] = {'weights': BRI_W, 'flag': BRI_FLAG, 'review': BRI_REVIEW}

    fig, ax = plt.subplots(figsize=(5.8, 4.8))
    for name, score, c in (('QTO over-budget ratio', obr, '#2c6fbb'), ('XGBoost residual', mlr_, '#e08a2c'),
                           ('Isolation Forest score', iso, '#7f8c8d'), ('BUHAY Risk Index', risk, '#c0392b')):
        fpr, tpr, _ = roc_curve(yt, score)
        ax.plot(fpr, tpr, lw=2 if 'BUHAY' in name else 1.4, color=c, label=f'{name} (AUC = {roc_auc_score(yt, score):.3f})')
    ax.plot([0, 1], [0, 1], ':', color='#999')
    ax.set_xlabel('False positive rate'); ax.set_ylabel('True positive rate (recall)')
    ax.set_title('Detection of injected overpricing, all 300 projects', fontsize=11); ax.legend(fontsize=8, loc='lower right')
    fig.tight_layout(); fig.savefig(os.path.join(FIG, 'roc_pooled.png'), dpi=200); plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    bins = np.linspace(0.6, 2.3, 44)
    ax.hist(obr[yt == 0], bins=bins, color='#7fa7d6', label='Not injected (n = %d)' % (yt == 0).sum())
    ax.hist(obr[yt == 1], bins=bins, color='#c0392b', alpha=0.85, label='Injected overpricing (n = %d)' % (yt == 1).sum())
    ax.axvline(1.10, color='#e5a50a', ls='--', lw=1.2, label='Review line (1.10)')
    ax.axvline(np.median(cr), color='#8b0000', ls='--', lw=1.2, label='Median ceiling ratio (%.2f)' % np.median(cr))
    ax.set_xlabel('Over-budget ratio = awarded cost / BUHAY standard estimate'); ax.set_ylabel('Projects')
    ax.set_title('Over-budget ratio distribution', fontsize=11); ax.legend(fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, 'obr_hist.png'), dpi=200); plt.close(fig)

    json.dump(report, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=1, default=float)
    models['bri'] = report['bri']
    models['generated'] = 'research/pipeline/train.py on research/data/buhay_sbd300.csv (simulated benchmark)'
    json.dump(models, open(os.path.join(APPDATA, 'models.json'), 'w'), separators=(',', ':'))
    json.dump({'note': 'Simulated benchmark projects (SBD-300) for demonstration. Not real DPWH contracts.',
               'projects': scored}, open(os.path.join(APPDATA, 'projects.json'), 'w'), separators=(',', ':'))
    print('pooled', {k: {m: round(v[m], 3) for m in ('Precision', 'Recall', 'F1', 'AUC')} for k, v in report['pooled'].items()})


if __name__ == '__main__':
    main()
