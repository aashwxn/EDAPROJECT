// Core analysis logic. Works only on the rows it is given.
const PRICE_HINTS = ['close', 'adj close', 'adj_close', 'closing', 'price', 'last', 'rate', 'value'];

function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[,$€£₹\s]/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  return parseFloat(s);
}
function numericColumns(rows, headers) {
  return headers.filter(h => {
    const vals = rows.filter(r => r[h] !== '' && r[h] != null);
    return vals.length && vals.filter(r => toNum(r[h]) !== null).length / vals.length >= 0.6;
  });
}
function detectPriceColumn(rows, headers) {
  const nums = numericColumns(rows, headers);
  for (const hint of PRICE_HINTS) {
    const f = nums.find(h => String(h).trim().toLowerCase() === hint);
    if (f) return f;
  }
  for (const hint of PRICE_HINTS) {
    const f = nums.find(h => String(h).toLowerCase().includes(hint));
    if (f) return f;
  }
  return nums.find(h => !/volume|^id$|index|^no\.?$|serial/i.test(h)) || nums[0] || null;
}
function detectDateColumn(headers) {
  return headers.find(h => /date|time|day|month|period/i.test(h)) || null;
}
function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function riskLevel(vol) { return vol < 1 ? 'LOW' : vol <= 2.5 ? 'MEDIUM' : 'HIGH'; }

function analyze(rows, col, headers) {
  if (!rows || !rows.length) throw new Error('The dataset is empty. Please load a file with at least 5 records.');
  if (!col) throw new Error('No numeric price column was found. Your file needs a column with numbers, such as "Close" or "Price".');
  const dcol = detectDateColumn(headers.filter(h => h !== col));
  let pts = [], invalid = 0;
  rows.forEach((r, i) => {
    const p = toNum(r[col]);
    if (p === null || p <= 0) { invalid++; return; }
    pts.push({ p, label: dcol && r[dcol] !== '' ? String(r[dcol]) : 'Record ' + (i + 1) });
  });
  if (pts.length < 5) throw new Error(`Only ${pts.length} valid positive numeric value(s) found in column "${col}". At least 5 are needed. Check that the column contains numbers (not text) greater than 0.`);
  if (dcol) { // make sure data runs oldest -> newest
    const a = Date.parse(pts[0].label), b = Date.parse(pts[pts.length - 1].label);
    if (!isNaN(a) && !isNaN(b) && a > b) pts.reverse();
  }
  const prices = pts.map(x => x.p);
  const returns = [];
  for (let i = 1; i < prices.length; i++) returns.push((prices[i] - prices[i - 1]) / prices[i - 1] * 100);

  const avg = mean(prices), sd = stdev(prices), vol = stdev(returns);
  let imax = 0, imin = 0;
  prices.forEach((p, i) => { if (p > prices[imax]) imax = i; if (p < prices[imin]) imin = i; });
  const first = prices[0], last = prices[prices.length - 1];
  const gain = Math.max(...returns), loss = Math.min(...returns);

  // rolling volatility
  const w = Math.max(2, Math.min(10, Math.floor(returns.length / 3)));
  const rolling = [];
  for (let j = w - 1; j < returns.length; j++) rolling.push({ label: pts[j + 1].label, v: stdev(returns.slice(j - w + 1, j + 1)) });

  // period comparison
  const k = Math.max(1, Math.min(6, Math.floor(returns.length / 3)));
  const size = Math.ceil(returns.length / k), segments = [];
  for (let s = 0; s < returns.length; s += size) {
    const part = returns.slice(s, s + size);
    if (part.length < 2) continue;
    segments.push({ label: pts[s + 1].label + ' → ' + pts[Math.min(s + part.length, pts.length - 1)].label, v: stdev(part) });
  }

  return {
    col, dateCol: dcol, labels: pts.map(x => x.label), prices, returns, rolling, rollWindow: w, segments,
    stats: {
      total: rows.length, valid: pts.length, invalid, avg, max: prices[imax], maxLabel: pts[imax].label,
      min: prices[imin], minLabel: pts[imin].label, first, last, change: last - first, changePct: (last - first) / first * 100,
      sd, vol, meanReturn: mean(returns), gain, loss, cv: sd / avg * 100, risk: riskLevel(vol)
    }
  };
}

function explainResult(r) {
  const s = r.stats, f = n => fmtNum(n, s.avg);
  const out = [];
  out.push(`The analysis used ${s.valid} valid records from the "${r.col}" column. The price started at ${f(s.first)} and ended at ${f(s.last)}, a ${s.change >= 0 ? 'rise' : 'fall'} of ${Math.abs(s.changePct).toFixed(2)}%. The average price was ${f(s.avg)}, with a high of ${f(s.max)} and a low of ${f(s.min)}.`);
  const word = { LOW: 'calm and stable, with small price movements between records', MEDIUM: 'moderately active, with noticeable but manageable price swings', HIGH: 'highly unstable, with large price swings between records' }[s.risk];
  out.push(`Volatility is ${s.vol.toFixed(2)}%, which is classified as ${s.risk} risk. This means the market was ${word}. The biggest single increase was ${s.gain.toFixed(2)}% and the biggest single drop was ${s.loss.toFixed(2)}%.`);
  if (r.segments.length >= 2) {
    const seg = r.segments, hi = seg.reduce((a, b) => b.v > a.v ? b : a), lo = seg.reduce((a, b) => b.v < a.v ? b : a);
    const half = r.returns.length >> 1, vA = stdev(r.returns.slice(0, half)), vB = stdev(r.returns.slice(half));
    out.push(`Volatility was highest in the period ${hi.label} (${hi.v.toFixed(2)}%) and lowest in ${lo.label} (${lo.v.toFixed(2)}%). Comparing the two halves of the data, volatility ${vB > vA ? 'ROSE' : 'FELL'} from ${vA.toFixed(2)}% to ${vB.toFixed(2)}% (${vA ? (((vB - vA) / vA) * 100).toFixed(0) : 0}% change).`);
  }
  out.push(`The standard deviation of the price itself is ${f(s.sd)} (${s.cv.toFixed(2)}% of the average), which shows how widely prices spread around the mean.`);
  if (s.invalid) out.push(`Note: ${s.invalid} row(s) were skipped because the price was missing, non-numeric or not above zero.`);
  return out;
}
function fmtNum(n, ref) {
  const d = Math.abs(ref) < 10 ? 4 : 2;
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
