# Multi-Asset Financial Market Volatility Rise Analysis

A browser-based dashboard that analyzes market volatility from a built-in sample dataset or your own CSV / Excel file.
No backend, no API key, no internet needed (all libraries are bundled in `lib/`).

## Run it
**Option A (simplest):** unzip the folder and double-click `index.html`.

**Option B (local server):**
```
cd multi-asset-volatility
python -m http.server 8000      # or: npx serve
```
Open http://localhost:8000

## Workflow
Select Sample Dataset / Upload Dataset -> Preview Data -> Analyze Dataset -> View Results -> Download PDF/CSV

## Upload format
- Files: .csv, .xlsx, .xls (first sheet is used, first row = column names)
- Needs one numeric price column (Close, Price, Rate, Value ...). It is auto-detected and can be changed in the preview.
- A Date column is optional. Example:
```
Date,Close
2024-01-01,100.5
2024-01-02,101.2
```
- At least 5 valid positive numbers are required, otherwise a clear error is shown.

## How the numbers are calculated (all from the loaded data)
- Price change % between records = (price_t - price_t-1) / price_t-1 x 100
- Volatility % = sample standard deviation of those percentage changes
- Standard deviation = sample standard deviation of the prices
- Risk: LOW < 1%, MEDIUM 1% to 2.5%, HIGH > 2.5% (edit `riskLevel()` in js/analysis.js to change)

## Structure
```
index.html
css/style.css
js/samples.js    built-in SAMPLE data generator (simulated, not real-time)
js/analysis.js   validation + statistics
js/app.js        UI, charts, PDF/CSV export
lib/             Chart.js, SheetJS (xlsx), jsPDF
```
Sample datasets are simulated for demonstration and are NOT real-time market data.
