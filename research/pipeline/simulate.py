"""
BUHAY simulated benchmark dataset (SBD-300).

Generates 160 public-building and 140 bridge projects across the six Bicol provinces
(2022-2025). Each project has
  * a declared plan (what appears in the program of works / engineering plans),
  * a hidden "as-built" reality: unit prices, reinforcement and concrete intensities,
    earthwork and pile lengths drawn around the plan (site and market variation the
    plan-level estimator cannot see),
  * an awarded contract amount = true cost x bid-competition factor, and
  * for ~12% of projects, an injected overpricing markup (ground-truth label).

The declared plan is priced by the same engine the app uses (docs/app/js/engine.js),
so every number in the paper can be reproduced by the app.

Run:  python3 -I research/pipeline/simulate.py
"""
import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'research', 'data')
TMP = os.path.join(ROOT, 'research', 'outputs')
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

rng = np.random.default_rng(2026)

PROVINCES = ['Camarines Sur', 'Albay', 'Sorsogon', 'Masbate', 'Camarines Norte', 'Catanduanes']
PROV_W = np.array([0.30, 0.22, 0.14, 0.14, 0.10, 0.10])
YEARS = [2022, 2023, 2024, 2025]

# ---------------------------------------------------------------- geography
geo = json.load(open(os.path.join(ROOT, 'docs', 'app', 'data', 'bicol.geojson')))
POLYS = {}
for f in geo['features']:
    rings = [poly[0] for poly in f['geometry']['coordinates']]  # outer rings
    POLYS[f['properties']['name']] = rings


def _inside(x, y, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            c = not c
        j = i
    return c


def random_point(prov):
    rings = POLYS[prov]
    # weight rings by bounding-box area so the mainland dominates
    boxes = [(min(p[0] for p in r), min(p[1] for p in r), max(p[0] for p in r), max(p[1] for p in r)) for r in rings]
    areas = np.array([(b[2] - b[0]) * (b[3] - b[1]) for b in boxes])
    for _ in range(5000):
        k = rng.choice(len(rings), p=areas / areas.sum())
        b = boxes[k]
        x, y = rng.uniform(b[0], b[2]), rng.uniform(b[1], b[3])
        if _inside(x, y, rings[k]):
            return round(float(y), 5), round(float(x), 5)
    raise RuntimeError(prov)


# ---------------------------------------------------------------- plan samplers
def sample_building():
    t = rng.choice(['school', 'office', 'health', 'evacuation', 'dorm', 'market'], p=[0.40, 0.14, 0.12, 0.16, 0.06, 0.12])
    if t == 'school':
        n = int(rng.choice([1, 2, 3, 4], p=[0.25, 0.40, 0.25, 0.10]))
        rooms = int(rng.integers(2, 6))
        L, W, h, bx, by = 9.0 * rooms, rng.uniform(8.5, 10.0), rng.uniform(3.1, 3.4), 4.5, None
    elif t == 'office':
        n = int(rng.choice([1, 2, 3, 4], p=[0.20, 0.45, 0.25, 0.10]))
        L, W, h, bx, by = rng.uniform(15, 40), rng.uniform(10, 18), rng.uniform(3.2, 3.8), rng.uniform(4.5, 6.5), None
    elif t == 'health':
        n = int(rng.choice([1, 2, 3], p=[0.45, 0.40, 0.15]))
        L, W, h, bx, by = rng.uniform(10, 32), rng.uniform(8, 16), rng.uniform(3.0, 3.5), rng.uniform(3.5, 5.5), None
    elif t == 'evacuation':
        n = int(rng.choice([1, 2], p=[0.75, 0.25]))
        L, W, h, bx, by = rng.uniform(18, 36), rng.uniform(12, 22), rng.uniform(4.5, 6.0), rng.uniform(5, 7), None
    elif t == 'dorm':
        n = int(rng.choice([2, 3, 4], p=[0.35, 0.45, 0.20]))
        L, W, h, bx, by = rng.uniform(18, 36), rng.uniform(9, 14), rng.uniform(2.9, 3.2), rng.uniform(4, 5.5), None
    else:
        n = int(rng.choice([1, 2], p=[0.80, 0.20]))
        L, W, h, bx, by = rng.uniform(20, 50), rng.uniform(15, 30), rng.uniform(4.0, 5.0), rng.uniform(5.5, 7), None
    if by is None:
        by = W / max(1, round(W / rng.uniform(4.0, 7.0)))
    roof = 'rc_deck' if (t in ('office', 'health') and n >= 3 and rng.random() < 0.6) or rng.random() < 0.05 else 'steel_truss'
    return {
        'kind': 'building', 'type': str(t), 'length': round(float(L), 2), 'width': round(float(W), 2), 'storeys': n,
        'floorHeight': round(float(h), 2), 'bayX': round(float(bx), 2), 'bayY': round(float(by), 2), 'roof': roof,
        'soilBearing': int(rng.choice([100, 150, 200, 250], p=[0.2, 0.45, 0.25, 0.10])), 'seismicZone': 4
    }


def sample_bridge():
    s = rng.choice(['box_culvert', 'rcdg', 'pscg', 'steel_truss'], p=[0.18, 0.42, 0.30, 0.10])
    cw = float(rng.choice([4.0, 6.7, 7.32, 13.4], p=[0.15, 0.62, 0.18, 0.05]))
    if s == 'box_culvert':
        n = int(rng.choice([1, 2, 3], p=[0.5, 0.35, 0.15]))
        span = float(rng.choice([2.0, 2.5, 3.0, 3.5, 4.0]))
        plan = {'superstructure': 'box_culvert', 'spans': n, 'totalLength': span * n, 'abutmentHeight': round(float(rng.uniform(2.0, 4.0)), 2),
                'foundation': 'spread', 'sidewalk': 0, 'approachLength': 0}
    else:
        if s == 'rcdg':
            n = int(rng.choice([1, 2, 3, 4], p=[0.45, 0.25, 0.20, 0.10])); span = rng.uniform(8, 22)
            fnd = rng.choice(['spread', 'driven_pile', 'bored_pile'], p=[0.30, 0.50, 0.20])
        elif s == 'pscg':
            n = int(rng.choice([1, 2, 3, 4, 5], p=[0.25, 0.30, 0.25, 0.12, 0.08])); span = rng.uniform(24, 40)
            fnd = rng.choice(['driven_pile', 'bored_pile'], p=[0.40, 0.60])
        else:
            n = int(rng.choice([1, 2], p=[0.7, 0.3])); span = rng.uniform(40, 70)
            fnd = 'bored_pile'
        plan = {'superstructure': str(s), 'spans': n, 'totalLength': round(float(span * n), 1),
                'pierHeight': round(float(rng.uniform(3, 12)), 2), 'abutmentHeight': round(float(rng.uniform(3.5, 8)), 2),
                'foundation': str(fnd), 'pileLength': round(float(rng.uniform(10, 30)), 1),
                'sidewalk': float(rng.choice([0.5, 0.75, 1.0, 1.2])), 'approachLength': float(rng.choice([10, 15, 20, 30]))}
    plan.update({'kind': 'bridge', 'carriageway': cw, 'waterway': bool(rng.random() < 0.9)})
    return plan


def hidden_reality(kind):
    """Site and market variation the plan-level estimate cannot observe."""
    price = {c: float(np.exp(rng.normal(0, 0.07))) for c in
             ['concrete', 'rebar', 'formwork', 'earth', 'masonry', 'finish', 'roof', 'steel', 'mepf', 'openings',
              'pile', 'girder', 'misc', 'general']}
    qty = {'rebar': float(rng.normal(1.0, 0.10)), 'concrete': float(rng.normal(1.0, 0.06)),
           'formwork': float(rng.normal(1.0, 0.08)), 'earth': float(max(0.7, rng.normal(1.05, 0.15))),
           'masonry': float(rng.normal(1.0, 0.07)), 'steel': float(rng.normal(1.0, 0.08)),
           'mepf': float(rng.normal(1.0, 0.10)), 'pile': float(rng.uniform(0.95, 1.35)) if kind == 'bridge' else 1.0}
    return {'price': price, 'qty': qty}


def main():
    rows, jobs = [], []
    for kind, count in (('building', 160), ('bridge', 140)):
        for i in range(count):
            plan = sample_building() if kind == 'building' else sample_bridge()
            prov = str(rng.choice(PROVINCES, p=PROV_W))
            plan['province'] = prov
            plan['year'] = int(rng.choice(YEARS))
            lat, lon = random_point(prov)
            pid = ('SIM-B-%03d' if kind == 'building' else 'SIM-R-%03d') % (i + 1)
            rows.append({'id': pid, 'kind': kind, 'province': prov, 'year': plan['year'], 'lat': lat, 'lon': lon, 'plan': plan})
            jobs.append({'plan': plan, 'adjust': hidden_reality(kind)})

    jf, of = os.path.join(TMP, '_jobs.json'), os.path.join(TMP, '_priced.json')
    json.dump(jobs, open(jf, 'w'))
    subprocess.run(['node', os.path.join(ROOT, 'research', 'pipeline', 'engine_cli.js'), jf, of], check=True)
    priced = json.load(open(of))

    n = len(rows)
    # bid competition: awarded amounts sit a little under the true cost on average
    market = np.exp(rng.normal(-0.02, 0.045, n))
    anomaly = np.zeros(n, dtype=int)
    markup = np.ones(n)
    severity = np.array([''] * n, dtype=object)
    idx = rng.permutation(n)
    n_anom = int(round(0.12 * n))
    for k, j in enumerate(idx[:n_anom]):
        anomaly[j] = 1
        if k % 2 == 0:
            markup[j] = rng.uniform(1.20, 1.40); severity[j] = 'moderate'
        else:
            markup[j] = rng.uniform(1.40, 2.10); severity[j] = 'severe'
    # a few aggressive low bids (not overpricing)
    for j in idx[n_anom:n_anom + int(0.04 * n)]:
        markup[j] = rng.uniform(0.78, 0.88); severity[j] = 'low-bid'

    recs = []
    for r, p, m, a, mk, sv in zip(rows, priced, market, anomaly, markup, severity):
        awarded = p['trueCost'] * m * mk
        rec = {'id': r['id'], 'kind': r['kind'], 'province': r['province'], 'year': r['year'], 'lat': r['lat'], 'lon': r['lon']}
        plan = r['plan']
        if r['kind'] == 'building':
            rec.update({'type': plan['type'], 'storeys': plan['storeys'], 'length': plan['length'], 'width': plan['width'],
                        'floorHeight': plan['floorHeight'], 'bayX': plan['bayX'], 'bayY': plan['bayY'], 'roof': plan['roof'],
                        'soilBearing': plan['soilBearing']})
        else:
            rec.update({'superstructure': plan['superstructure'], 'spans': plan['spans'], 'totalLength': plan['totalLength'],
                        'carriageway': plan['carriageway'], 'sidewalk': plan.get('sidewalk', 0), 'pierHeight': plan.get('pierHeight', 0),
                        'abutmentHeight': plan['abutmentHeight'], 'foundation': plan['foundation'], 'pileLength': plan.get('pileLength', 0),
                        'approachLength': plan.get('approachLength', 0), 'waterway': plan['waterway']})
        rec.update({f'f_{k}': v for k, v in p['features'].items()})
        rec.update({'start_quote': p['start'], 'fair_estimate': p['fair'], 'ceiling_estimate': p['ceiling'],
                    'true_cost': p['trueCost'], 'awarded_cost': awarded, 'injected_anomaly': int(a), 'injected_markup': float(mk),
                    'severity': sv, 'plan_json': json.dumps(plan, separators=(',', ':'))})
        recs.append(rec)
    df = pd.DataFrame(recs)
    df.to_csv(os.path.join(OUT, 'buhay_sbd300.csv'), index=False)
    os.remove(jf); os.remove(of)
    print(df.groupby('kind').agg(n=('id', 'count'), anomalies=('injected_anomaly', 'sum'),
                                 min_cost=('awarded_cost', 'min'), max_cost=('awarded_cost', 'max')))


if __name__ == '__main__':
    sys.exit(main())
