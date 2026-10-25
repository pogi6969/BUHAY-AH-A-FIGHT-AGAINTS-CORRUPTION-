// Batch runner for the BUHAY cost engine. Reads a JSON array of {plan, adjust} from a file
// and writes, for each, the lean / standard / ceiling ABC and the ML feature vector.
// Usage: node engine_cli.js in.json out.json
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'docs', 'app', 'js', 'engine.js'));

const [, , inFile, outFile] = process.argv;
const jobs = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const out = jobs.map(({ plan, adjust }) => {
  const declared = E.quote(plan);
  const res = {
    start: declared.start, fair: declared.fair, ceiling: declared.ceiling,
    edc: declared.tiers.standard.abc.edc,
    features: E.features(plan),
    perUnit: declared.tiers.standard.perUnit,
    unitBase: declared.tiers.standard.metrics.unitBase
  };
  if (adjust) {
    const truth = E.compute(plan, 'standard', { adjust });
    res.trueCost = truth.abc.total;
  }
  return res;
});
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`engine ${E.VERSION}: ${out.length} plans priced`);
