// Renders research/figures/svg/*.svg to PNG at print resolution (Playwright / Chromium).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = path.join(__dirname, '..', 'figures', 'svg'), out = path.join(__dirname, '..', 'figures');
  const b = await chromium.launch(), p = await b.newPage({ deviceScaleFactor: 1 });
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w = +vb[1], h = +vb[2], k = 2600 / w;
    await p.setViewportSize({ width: 2600, height: Math.ceil(h * k) });
    await p.setContent('<html><body style="margin:0;background:#fff">' + svg.replace('<svg ', '<svg width="2600" height="' + Math.ceil(h * k) + '" ') + '</body></html>');
    await p.screenshot({ path: path.join(out, f.replace('.svg', '.png')), clip: { x: 0, y: 0, width: 2600, height: Math.ceil(h * k) } });
    console.log(f);
  }
  await b.close();
})();
