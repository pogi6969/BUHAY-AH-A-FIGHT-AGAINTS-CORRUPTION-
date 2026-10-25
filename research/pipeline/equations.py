"""Render the paper's equations as images (matplotlib mathtext)."""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'research', 'figures', 'eq')
os.makedirs(OUT, exist_ok=True)
plt.rcParams['mathtext.fontset'] = 'stix'
EQ = {
    'edc': r'$\mathrm{EDC}=\sum_{i=1}^{m} Q_i\, r_i\, \lambda_{\mathrm{loc}}\, \lambda_{\mathrm{yr}}$',
    'abc': r'$\mathrm{ABC}=\mathrm{EDC}\,(1+o+\pi)\,(1+v)$',
    'footing': r'$B=\sqrt{\dfrac{\alpha\, s_x\, s_y\, N\, w}{q_a}}$',
    'rebar': r'$M_s=\tau\,\zeta\,\sum_{e}\rho_e\, V_e$',
    'obr': r'$\mathrm{OBR}=\dfrac{C_{\mathrm{contract}}}{\mathrm{ABC}_{\mathrm{std}}}$',
    'sim': r'$C_{\mathrm{awarded}}=C_{\mathrm{true}}\cdot e^{\eta}\cdot \mu,\qquad \eta\sim N(-0.02,\ 0.045^{2})$',
    'mlr': r'$y_i=\beta_0+\sum_{k=1}^{p}\beta_k\, x_{ik}+\epsilon_i$',
    'vif': r'$\mathrm{VIF}_j=\dfrac{1}{1-R_j^{2}}$',
    'xgb': r'$\hat{y}_i=\phi(x_i)=\sum_{k=1}^{K} f_k(x_i),\qquad \mathcal{L}=\sum_i l(y_i,\hat{y}_i)+\sum_k\left(\gamma T_k+\frac{1}{2}\lambda\|w_k\|^{2}\right)$',
    'iforest': r'$s(x,n)=2^{-E[h(x)]/c(n)},\qquad c(n)=2H(n-1)-\dfrac{2(n-1)}{n}$',
    'shap': r'$\hat{y}_i=\phi_0+\sum_{j=1}^{M}\phi_j(x_i)$',
    'bri': r'$\mathrm{BRI}=100\,\left[\,0.5\,S_{\mathrm{OBR}}+0.3\,S_{\mathrm{ML}}+0.2\,S_{\mathrm{ISO}}\,\right]$',
    'bri_s': r'$S_{\mathrm{OBR}}=\left[\dfrac{\mathrm{OBR}-1}{0.5}\right]_0^1,\quad S_{\mathrm{ML}}=\left[\dfrac{C/\hat{C}-1}{0.5}\right]_0^1,\quad S_{\mathrm{ISO}}=\left[\dfrac{s-0.40}{0.25}\right]_0^1$',
    'rmse': r'$\mathrm{RMSE}=\sqrt{\dfrac{1}{n}\sum_{i=1}^{n}(y_i-\hat{y}_i)^{2}}$',
    'r2': r'$R^{2}=1-\dfrac{\sum_i (y_i-\hat{y}_i)^{2}}{\sum_i (y_i-\bar{y})^{2}}$',
    'mape': r'$\mathrm{MAPE}=\dfrac{100\%}{n}\sum_{i=1}^{n}\left|\dfrac{y_i-\hat{y}_i}{y_i}\right|$',
    'prf': r'$P=\dfrac{TP}{TP+FP},\qquad R=\dfrac{TP}{TP+FN},\qquad F_1=\dfrac{2PR}{P+R}$',
}
for k, tex in EQ.items():
    fig = plt.figure(figsize=(0.1, 0.1))
    fig.text(0, 0, tex, fontsize=15)
    fig.savefig(os.path.join(OUT, k + '.png'), dpi=300, bbox_inches='tight', pad_inches=0.04, transparent=False, facecolor='white')
    plt.close(fig)
print(len(EQ), 'equations')
