const $ = s => document.querySelector(s);
const views = { home: $('#home'), preview: $('#preview'), results: $('#results') };
let state = null, result = null, charts = [];

/* ---------- helpers ---------- */
function show(v) {
  Object.keys(views).forEach(k => views[k].hidden = k !== v);
  const n = { home: 1, preview: 2, results: 4 }[v];
  document.querySelectorAll('.step').forEach(s => {
    const i = +s.dataset.s;
    s.classList.toggle('active', i === n); s.classList.toggle('done', i < n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showAlert(msg, warn) { const a = $('#alert'); a.textContent = msg; a.className = 'alert' + (warn ? ' warn' : ''); a.hidden = false; }
function clearAlert() { $('#alert').hidden = true; }
function killCharts() { charts.forEach(c => c.destroy()); charts = []; }
function resetAll() { state = null; result = null; killCharts(); clearAlert(); $('#fileInput').value = ''; show('home'); }
function fmt(n) { return fmtNum(n, result ? result.stats.avg : n); }

/* ---------- sample list ---------- */
const list = $('#sampleList');
Object.entries(SAMPLES).forEach(([key, s]) => {
  const b = document.createElement('button');
  b.className = 'sample'; b.type = 'button';
  b.innerHTML = `<span><b>${s.name}</b><small>${s.desc}</small></span><span class="tag">Sample data</span>`;
  b.onclick = () => loadDataset({ name: s.name, sample: true, rows: s.rows.map(r => ({ ...r })) });
  list.appendChild(b);
});

/* ---------- upload ---------- */
const drop = $('#drop'), input = $('#fileInput');
$('#btnBrowse').onclick = () => input.click();
drop.onclick = e => { if (e.target === drop || e.target.tagName === 'P') input.click(); };
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
input.onchange = () => handleFile(input.files[0]);
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));

function cellText(v) {
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 60000), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return v;
}
async function handleFile(file) {
  clearAlert();
  if (!file) return;
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return showAlert('Unsupported file type. Please upload a .csv, .xlsx or .xls file.');
  if (file.size > 10 * 1024 * 1024) return showAlert('File is too large (limit 10 MB). Please upload a smaller file.');
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    if (!wb.SheetNames.length) throw new Error();
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
    if (!raw.length) return showAlert('The file has no data rows. Make sure the first row contains column names followed by records.');
    const rows = raw.map(r => { const o = {}; Object.keys(r).forEach(k => o[k] = cellText(r[k])); return o; });
    loadDataset({ name: file.name, sample: false, rows });
  } catch (e) {
    showAlert('Could not read this file. Please check that it is a valid CSV or Excel file and is not password protected.');
  }
}

/* ---------- preview ---------- */
function loadDataset(ds) {
  clearAlert(); killCharts(); result = null;
  ds.headers = Object.keys(ds.rows[0]);
  state = ds;
  const nums = numericColumns(ds.rows, ds.headers), best = detectPriceColumn(ds.rows, ds.headers);
  $('#pvTitle').textContent = 'Data preview: ' + ds.name;
  $('#pvMeta').textContent = `${ds.rows.length.toLocaleString()} records, ${ds.headers.length} columns`;
  const tag = $('#pvTag'); tag.textContent = ds.sample ? 'Sample data (not real-time)' : 'Your uploaded file';
  const sel = $('#priceCol'); sel.innerHTML = '';
  (nums.length ? nums : ds.headers).forEach(h => sel.add(new Option(h, h)));
  if (best) sel.value = best;
  sel.disabled = !nums.length;
  sel.onchange = drawTable;
  drawTable();
  $('#pvNote').textContent = `Showing the first ${Math.min(10, ds.rows.length)} of ${ds.rows.length.toLocaleString()} records. The highlighted column will be analyzed.`;
  show('preview');
  if (!nums.length) showAlert('Warning: no numeric column was detected in this file. You can still try to analyze, but an error will be shown if no valid prices are found.', true);
}
function drawTable() {
  const t = $('#pvTable'), col = $('#priceCol').value;
  t.innerHTML = '';
  const tr = t.createTHead().insertRow();
  state.headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; if (h === col) th.className = 'sel'; tr.appendChild(th); });
  const body = t.createTBody();
  state.rows.slice(0, 10).forEach(r => {
    const row = body.insertRow();
    state.headers.forEach(h => row.insertCell().textContent = r[h] === '' ? '-' : r[h]);
  });
}

/* ---------- analyze ---------- */
$('#btnAnalyze').onclick = () => {
  clearAlert();
  try {
    result = analyze(state.rows, $('#priceCol').value, state.headers);
  } catch (e) { return showAlert(e.message); }
  renderResults();
  show('results');
  if (result.stats.invalid) showAlert(`${result.stats.invalid} row(s) were skipped (missing, non-numeric or zero prices).`, true);
};

function renderResults() {
  const r = result, s = r.stats, cls = s.risk.toLowerCase();
  $('#rsTitle').textContent = 'Analysis results: ' + state.name;
  $('#rsMeta').textContent = `Price column: ${r.col}` + (state.sample ? ' | Sample data, not real-time' : '');
  const b = $('#riskBadge'); b.textContent = s.risk + ' RISK'; b.className = 'badge ' + cls;
  document.querySelectorAll('.lvl').forEach(l => l.classList.toggle('active', l.classList.contains(cls)));
  const cards = [
    ['Total records', s.total.toLocaleString()], ['Valid price records', s.valid.toLocaleString()],
    ['Average price', fmt(s.avg)], ['Maximum price', fmt(s.max)], ['Minimum price', fmt(s.min)],
    ['Starting price', fmt(s.first)], ['Ending price', fmt(s.last)],
    ['Price change', (s.change >= 0 ? '+' : '') + fmt(s.change), s.change >= 0 ? 'up' : 'down'],
    ['Price change %', (s.changePct >= 0 ? '+' : '') + s.changePct.toFixed(2) + '%', s.changePct >= 0 ? 'up' : 'down'],
    ['Volatility %', s.vol.toFixed(2) + '%'], ['Standard deviation', fmt(s.sd)],
    ['Max daily gain', '+' + s.gain.toFixed(2) + '%', 'up'], ['Max daily drop', s.loss.toFixed(2) + '%', 'down'],
    ['Risk level', s.risk]
  ];
  $('#stats').innerHTML = cards.map(c => `<div class="stat"><span>${c[0]}</span><b class="${c[2] || ''}">${c[1]}</b></div>`).join('');
  $('#explain').innerHTML = explainResult(r).map(t => `<p>${t}</p>`).join('');
  drawCharts();
}

const whiteBg = { id: 'whiteBg', beforeDraw(c) { const x = c.ctx; x.save(); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.restore(); } };
const riskColor = v => v < 1 ? '#2e9e5b' : v <= 2.5 ? '#e39a12' : '#d93b3b';
function mk(id, type, labels, datasets, yTitle) {
  const c = new Chart($(id), {
    type, data: { labels, datasets }, plugins: [whiteBg],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: datasets.length > 1 } },
      scales: { x: { ticks: { maxTicksLimit: 7, maxRotation: 0, autoSkip: true } }, y: { title: { display: !!yTitle, text: yTitle } } }
    }
  });
  charts.push(c);
}
function drawCharts() {
  killCharts();
  const r = result, blue = '#1e88e5', n = r.prices.length;
  const ma = r.prices.map((_, i) => i < 4 ? null : mean(r.prices.slice(i - 4, i + 1)));
  const line = (label, data, color, extra) => Object.assign({ label, data, borderColor: color, backgroundColor: color + '22', borderWidth: 2, pointRadius: n > 150 ? 0 : 2, tension: .2 }, extra);
  mk('#c1', 'line', r.labels, [line('Price', r.prices, blue, { fill: true }), line('5-record average', ma, '#e39a12', { borderDash: [5, 4], pointRadius: 0 })], 'Price');
  const rl = r.rolling.map(x => x.label);
  mk('#c2', 'line', rl, [
    line(`Rolling volatility (${r.rollWindow} records)`, r.rolling.map(x => x.v), blue, { fill: true }),
    line('Low/Medium limit (1%)', rl.map(() => 1), '#2e9e5b', { borderDash: [4, 4], pointRadius: 0, borderWidth: 1 }),
    line('Medium/High limit (2.5%)', rl.map(() => 2.5), '#d93b3b', { borderDash: [4, 4], pointRadius: 0, borderWidth: 1 })
  ], 'Volatility %');
  mk('#c3', 'bar', r.labels.slice(1), [{ label: 'Daily change %', data: r.returns, backgroundColor: r.returns.map(v => v >= 0 ? '#5fbf8a' : '#e57373') }], 'Change %');
  mk('#c4', 'bar', r.segments.map(x => x.label), [{ label: 'Volatility %', data: r.segments.map(x => x.v), backgroundColor: r.segments.map(x => riskColor(x.v)) }], 'Volatility %');
  const names = ['This dataset'], vals = [r.stats.vol], cols = ['#0d47a1'];
  Object.values(SAMPLES).forEach(sm => {
    try { const a = analyze(sm.rows, 'Close', ['Date', 'Close']); names.push(sm.name.replace(' Dataset', '')); vals.push(a.stats.vol); cols.push('#90caf9'); } catch (e) {}
  });
  mk('#c5', 'bar', names, [{ label: 'Volatility %', data: vals, backgroundColor: cols }], 'Volatility %');
}

/* ---------- reports ---------- */
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const base = () => state.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_');
const q = v => '"' + String(v).replace(/"/g, '""') + '"';

$('#btnCsv').onclick = () => {
  const r = result, s = r.stats, L = [];
  L.push('Multi-Asset Financial Market Volatility Rise Analysis');
  L.push('Dataset,' + q(state.name)); L.push('Data type,' + (state.sample ? 'Sample data (not real-time)' : 'User uploaded'));
  L.push('Price column,' + q(r.col)); L.push('Generated,' + new Date().toLocaleString().replace(/,/g, ''));
  L.push(''); L.push('Metric,Value');
  [['Total records', s.total], ['Valid price records', s.valid], ['Average price', s.avg], ['Maximum price', s.max], ['Minimum price', s.min],
   ['Starting price', s.first], ['Ending price', s.last], ['Price change', s.change], ['Price change %', s.changePct],
   ['Volatility %', s.vol], ['Standard deviation', s.sd], ['Max daily gain %', s.gain], ['Max daily drop %', s.loss], ['Risk level', s.risk]]
    .forEach(m => L.push(q(m[0]) + ',' + (typeof m[1] === 'number' && !Number.isInteger(m[1]) ? +m[1].toFixed(6) : m[1])));
  L.push(''); L.push('Period,Volatility %,Risk');
  r.segments.forEach(x => L.push(q(x.label) + ',' + x.v.toFixed(4) + ',' + riskLevel(x.v)));
  L.push(''); L.push('Label,Price,Change %');
  r.prices.forEach((p, i) => L.push(q(r.labels[i]) + ',' + p + ',' + (i ? r.returns[i - 1].toFixed(4) : '')));
  download(new Blob(['\ufeff' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' }), base() + '_volatility_report.csv');
};

$('#btnPdf').onclick = () => {
  const { jsPDF } = window.jspdf, doc = new jsPDF('p', 'pt', 'a4'), r = result, s = r.stats;
  const W = 595, M = 40, H = 800; let y = 0;
  const need = h => { if (y + h > H) { doc.addPage(); y = 50; } };
  doc.setFillColor(30, 136, 229); doc.rect(0, 0, W, 70, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Multi-Asset Financial Market Volatility Rise Analysis', M, 32);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text('Analysis Report', M, 52);
  doc.setTextColor(30); y = 95; doc.setFontSize(10);
  [`Dataset: ${state.name}`, `Data type: ${state.sample ? 'Sample data (simulated, not real-time market data)' : 'User uploaded file'}`,
   `Price column: ${r.col}`, `Generated: ${new Date().toLocaleString()}`].forEach(t => { doc.text(t, M, y); y += 15; });
  y += 6;
  const col = { LOW: [46, 158, 91], MEDIUM: [227, 154, 18], HIGH: [217, 59, 59] }[s.risk];
  doc.setFillColor(...col); doc.roundedRect(M, y, 170, 28, 6, 6, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(`${s.risk} RISK  (${s.vol.toFixed(2)}%)`, M + 12, y + 19);
  doc.setTextColor(30); y += 48;
  doc.setFontSize(12); doc.text('Statistical summary', M, y); y += 8;
  const f = n => fmtNum(n, s.avg);
  const rows = [['Total records', s.total], ['Valid price records', s.valid], ['Average price', f(s.avg)], ['Maximum price', f(s.max)], ['Minimum price', f(s.min)],
    ['Starting price', f(s.first)], ['Ending price', f(s.last)], ['Price change', f(s.change)], ['Price change %', s.changePct.toFixed(2) + '%'],
    ['Volatility %', s.vol.toFixed(2) + '%'], ['Standard deviation', f(s.sd)], ['Max daily gain', s.gain.toFixed(2) + '%'], ['Max daily drop', s.loss.toFixed(2) + '%'], ['Risk level', s.risk]];
  doc.setFontSize(10);
  rows.forEach((rw, i) => {
    y += 17; need(17);
    if (i % 2 === 0) { doc.setFillColor(227, 242, 253); doc.rect(M, y - 12, W - 2 * M, 17, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.text(String(rw[0]), M + 6, y); doc.setFont('helvetica', 'bold'); doc.text(String(rw[1]), M + 220, y);
  });
  y += 28; need(40); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Explanation', M, y); y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  explainResult(r).forEach(t => { doc.splitTextToSize(t, W - 2 * M).forEach(line => { y += 14; need(14); doc.text(line, M, y); }); y += 6; });
  charts.forEach((c, i) => {
    const w = W - 2 * M, h = Math.min(w * c.height / c.width, 230);
    need(h + 30); if (y === 0) y = 50;
    y += 24; doc.setFont('helvetica', 'bold'); doc.text(['Price trend', 'Rolling volatility', 'Daily price change %', 'Volatility across periods', 'Comparison with sample assets'][i], M, y);
    doc.addImage(c.toBase64Image('image/png', 1), 'PNG', M, y + 6, w, h); y += h + 8;
  });
  doc.setFontSize(8); doc.setTextColor(110);
  doc.text('Sample datasets are simulated and not real-time market data. For education only, not financial advice.', M, 825);
  doc.save(base() + '_volatility_report.pdf');
};

/* ---------- navigation buttons ---------- */
['#btnReset', '#btnReset2'].forEach(id => $(id).onclick = resetAll);
['#btnUploadOther1', '#btnUploadOther2'].forEach(id => $(id).onclick = () => { resetAll(); input.click(); });
['#btnAnalyzeOther1', '#btnAnalyzeOther2'].forEach(id => $(id).onclick = () => { resetAll(); $('#sampleList').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
show('home');
