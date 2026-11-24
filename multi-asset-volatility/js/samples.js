// Built-in SAMPLE datasets (simulated, reproducible). NOT real market data.
(function () {
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gen(seed, start, drift, vol, dec, volBase, days) {
    const r = rng(seed);
    const nrm = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    const d0 = Date.UTC(2024, 0, 1), rows = [];
    let p = start;
    for (let i = 0; i < days; i++) {
      const open = p, regime = (i > 90 && i < 125) ? 1.9 : 1; // volatility burst = "volatility rise"
      p = open * (1 + drift + vol * regime * nrm());
      const hi = Math.max(open, p) * (1 + Math.abs(nrm()) * vol * 0.4);
      const lo = Math.min(open, p) * (1 - Math.abs(nrm()) * vol * 0.4);
      rows.push({
        Date: new Date(d0 + i * 864e5).toISOString().slice(0, 10),
        Open: +open.toFixed(dec), High: +hi.toFixed(dec), Low: +lo.toFixed(dec),
        Close: +p.toFixed(dec), Volume: Math.round(volBase * (0.7 + r() * 0.6))
      });
    }
    return rows;
  }
  window.SAMPLES = {
    stock:   { name: 'Stock Market Dataset', desc: 'Simulated stock index, daily',   rows: gen(11, 4500, 0.0004, 0.011, 2, 3.2e9, 180) },
    gold:    { name: 'Gold Price Dataset',   desc: 'Simulated gold (USD/oz), daily', rows: gen(22, 1950, 0.0003, 0.0075, 2, 180000, 180) },
    silver:  { name: 'Silver Price Dataset', desc: 'Simulated silver (USD/oz), daily', rows: gen(33, 23, 0.0003, 0.018, 3, 60000, 180) },
    bitcoin: { name: 'Bitcoin Dataset',      desc: 'Simulated BTC (USD), daily',     rows: gen(44, 30000, 0.0008, 0.03, 2, 25000, 180) },
    forex:   { name: 'Forex Dataset',        desc: 'Simulated EUR/USD rate, daily',  rows: gen(55, 1.08, 0, 0.0035, 4, 100000, 180) }
  };
})();
