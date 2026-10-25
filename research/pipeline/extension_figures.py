"""Charts for the extension study (SBD-EXT): accuracy and standards-based detection by asset class."""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
X = json.load(open(os.path.join(ROOT, 'research', 'outputs', 'extension_results.json')))
C = X['benchmark']['byClass']
short = ['Hospitals', 'Airport\nterminals', 'Seaport\nterminals', 'Land transport\nterminals', 'Airfield\npavements', 'Port\nstructures']
mape = [c['accuracy']['mape'] for c in C]
rec = [c['rule']['recall'] for c in C]
prec = [c['rule']['precision'] for c in C]
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11})
fig, ax = plt.subplots(1, 2, figsize=(12.4, 4.8))
ax[0].bar(range(6), mape, color='#12345a')
for i, v in enumerate(mape):
    ax[0].text(i, v + 0.15, f'{v:.2f}%', ha='center', fontsize=10)
ax[0].set_xticks(range(6)); ax[0].set_xticklabels(short, fontsize=9)
ax[0].set_ylabel('MAPE of the standard estimate (%)'); ax[0].set_title('Accuracy against fair awarded costs (SBD-EXT)')
ax[0].spines[['top', 'right']].set_visible(False); ax[0].set_ylim(0, max(mape) * 1.25)
w = 0.38
ax[1].bar([i - w / 2 for i in range(6)], rec, w, color='#12345a', label='Recall')
ax[1].bar([i + w / 2 for i in range(6)], prec, w, color='#e3a51a', label='Precision')
for i in range(6):
    ax[1].text(i - w / 2, rec[i] + 0.02, f'{rec[i]:.2f}', ha='center', fontsize=9)
    ax[1].text(i + w / 2, prec[i] + 0.02, f'{prec[i]:.2f}', ha='center', fontsize=9)
ax[1].set_xticks(range(6)); ax[1].set_xticklabels(short, fontsize=9); ax[1].set_ylim(0, 1.32)
ax[1].set_title('Standards-based rule (contract above ceiling)')
ax[1].legend(frameon=False, loc='upper center', ncol=2)
ax[1].spines[['top', 'right']].set_visible(False)
fig.tight_layout()
fig.savefig(os.path.join(ROOT, 'research', 'figures', 'ext_results.png'), dpi=200)
print('ext_results.png')
