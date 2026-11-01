/* Lab for "How to read an LLM benchmark without fooling yourself":
   two models, N test questions, independent or paired scoring.
   All numbers come from the post's formulas:
     SE_i   = sqrt(p(1-p)/N)
     SE_d   = sqrt((pA qA + pB qB - 2 rho sqrt(pA qA pB qB)) / N)      (rho = 0 -> independent)
     N*     = (pA qA + pB qB - 2 cov) (z / d)^2,  z = 1.96 for the 95% bar, 2.80 for 80% power
   The bootstrap button draws resamples of the test set (question outcomes ~ multinomial) and bins A - B. */
(function () {
  'use strict';
  var root = document.querySelector('.lab[data-lab="read-benchmarks"]');
  if (!root) return;
  var body = root.querySelector('.lab-b');
  if (!body) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function fmtN(n) { return Math.round(n).toLocaleString('en-US'); }
  function f1(x) { return x.toFixed(1); }
  function f2(x) { return x.toFixed(2); }
  function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
  function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  var st = { pA: 82.1, pB: 80.4, logN: Math.log10(500), paired: false, rho: 0.5 };
  var runs = [], R_MAX = 2000, raf = 0, seed = 20261101;
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function gauss() { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }
  function binom(n, p) {
    if (p <= 0 || n <= 0) return 0; if (p >= 1) return n;
    if (n <= 300) { var c = 0; for (var i = 0; i < n; i++) if (rnd() < p) c++; return c; }
    var x = Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gauss());   // normal draw: n p q > 50 here
    return Math.max(0, Math.min(n, x));
  }

  function model() {
    var pA = st.pA / 100, pB = st.pB / 100, N = Math.round(Math.pow(10, st.logN));
    var qA = 1 - pA, qB = 1 - pB, vA = pA * qA, vB = pB * qB;
    var rho = st.paired ? st.rho : 0, cov = Math.min(rho * Math.sqrt(vA * vB), pA * qB, pB * qA);   // keep the joint distribution valid
    var v = vA + vB - 2 * cov;                       // per-question variance of the difference
    var seD = Math.sqrt(v / N) * 100, d = (pA - pB) * 100;
    var hA = 196 * Math.sqrt(vA / N), hB = 196 * Math.sqrt(vB / N);   // 1.96 * SE in points
    return { pA: pA, pB: pB, N: N, v: v, cov: cov, seD: seD, d: d, half: 1.96 * seD, hA: hA, hB: hB };
  }
  function nNeeded(m, z) { var d = Math.abs(m.d) / 100; return d < 0.0005 ? Infinity : m.v * Math.pow(z / d, 2); }

  /* ---------- build UI ---------- */
  body.textContent = '';
  var intro = el('p', null, 'Set two models’ true accuracies and the size of the test set. The tiles use the formulas above; the bootstrap button resamples the test set so you can watch the same numbers appear as a histogram.');
  body.appendChild(intro);

  var controls = el('div', 'controls'); body.appendChild(controls);
  function range(label, min, max, step, value, fmt, on) {
    var w = el('label', 'ctl ctl-range'); w.appendChild(el('span', 'ctl-l', label));
    var i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value; i.setAttribute('aria-label', label);
    var o = el('output', 'ctl-o', fmt(value));
    i.addEventListener('input', function () { var v = parseFloat(i.value); o.textContent = fmt(v); on(v); });
    w.appendChild(i); w.appendChild(o); controls.appendChild(w);
    return { wrap: w, input: i, out: o, fmt: fmt };
  }
  var rA = range('Model A', 60, 95, 0.1, st.pA, function (v) { return f1(v) + '%'; }, function (v) { st.pA = v; changed(); });
  var rB = range('Model B', 60, 95, 0.1, st.pB, function (v) { return f1(v) + '%'; }, function (v) { st.pB = v; changed(); });
  var rN = range('N questions', 1.7, 4.3, 0.01, st.logN, function (v) { return fmtN(Math.pow(10, v)); }, function (v) { st.logN = v; syncPresets(); changed(); });

  var presets = el('div', 'tabs'); presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', 'Test-set size presets');
  var PRE = [[100, '100'], [500, '500'], [2000, '2,000'], [4250, '4,250'], [14000, '14,000']], pBtns = [];
  PRE.forEach(function (p) {
    var b = el('button', null, p[1]); b.type = 'button';
    b.addEventListener('click', function () { st.logN = Math.log10(p[0]); rN.input.value = st.logN; rN.out.textContent = rN.fmt(st.logN); syncPresets(); changed(); });
    pBtns.push([p[0], b]); presets.appendChild(b);
  });
  function syncPresets() { var n = Math.round(Math.pow(10, st.logN)); pBtns.forEach(function (x) { x[1].setAttribute('aria-pressed', String(Math.abs(Math.log10(x[0]) - st.logN) < 0.006)); }); }
  body.appendChild(presets);

  var controls2 = el('div', 'controls'); body.appendChild(controls2);
  var modeTabs = el('div', 'tabs'); modeTabs.setAttribute('role', 'group'); modeTabs.setAttribute('aria-label', 'Scoring design');
  var mInd = el('button', null, 'Scored independently'), mPair = el('button', null, 'Same questions (paired)');
  mInd.type = mPair.type = 'button';
  modeTabs.appendChild(mInd); modeTabs.appendChild(mPair); controls2.appendChild(modeTabs);
  var rRho = (function () {
    var w = el('label', 'ctl ctl-range'); w.appendChild(el('span', 'ctl-l', 'Agreement'));
    var i = el('input'); i.type = 'range'; i.min = 0; i.max = 0.9; i.step = 0.05; i.value = st.rho; i.setAttribute('aria-label', 'Correlation of the two models’ per-question correctness');
    var o = el('output', 'ctl-o', 'ρ = ' + f2(st.rho));
    i.addEventListener('input', function () { st.rho = parseFloat(i.value); o.textContent = 'ρ = ' + f2(st.rho); changed(); });
    w.appendChild(i); w.appendChild(o); controls2.appendChild(w); return { wrap: w };
  })();
  function syncMode() { mInd.setAttribute('aria-pressed', String(!st.paired)); mPair.setAttribute('aria-pressed', String(st.paired)); rRho.wrap.style.display = st.paired ? '' : 'none'; }
  mInd.addEventListener('click', function () { st.paired = false; syncMode(); changed(); });
  mPair.addEventListener('click', function () { st.paired = true; syncMode(); changed(); });

  var out = el('div', 'lab-out'); out.setAttribute('aria-live', 'polite'); body.appendChild(out);
  var tiles = {};
  [['gap', 'gap A − B'], ['half', '95% half-width of the gap'], ['verdict', 'verdict'], ['overlap', 'individual bars overlap?'], ['flip', 'P(B ≥ A) on a rerun'], ['n95', 'N to clear the 95% bar'], ['n80', 'N for 80% power']].forEach(function (t) {
    var r = el('div', 'ro'); var b = el('b', null, '–'); r.appendChild(b); r.appendChild(el('span', null, t[1])); out.appendChild(r); tiles[t[0]] = b;
  });
  var take = el('p', 'lab-note'); take.setAttribute('aria-live', 'polite'); body.appendChild(take);

  var bar = el('div', 'controls'); body.appendChild(bar);
  var go = el('button', 'btn-s', 'Bootstrap × 2,000'); go.type = 'button';
  var clr = el('button', 'btn-s', 'Clear'); clr.type = 'button';
  bar.appendChild(go); bar.appendChild(clr);
  var cnt = el('span', 'ctl-l', ''); cnt.setAttribute('aria-live', 'polite'); bar.appendChild(cnt);

  var cv = el('canvas'); cv.width = 920; cv.height = 300; cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Histogram of bootstrapped score gaps A minus B from resampled test sets, with the normal-approximation curve overlaid.');
  body.appendChild(cv);
  body.appendChild(el('p', 'lab-note', 'Histogram of A − B over resampled test sets (red: B ties or beats A). The ink curve is the normal approximation behind the tiles. For N above 300 each score is drawn as a normal approximation to the binomial, for speed. This is the question-sampling error only, a lower bound on honest uncertainty.'));

  /* ---------- rendering ---------- */
  function css(name, fb) { var v = getComputedStyle(root).getPropertyValue(name).trim(); return v || fb; }
  function draw(m) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, padL = 14, padR = 14, padT = 18, padB = 36;
    ctx.clearRect(0, 0, W, H);
    var ink = css('--ink', '#1c1f3a'), ink2 = css('--ink-2', '#4a4c63'), signal = css('--signal', '#e2502f'), teal = css('--teal', '#2a7f86'), amber = css('--amber', '#f0a93a');
    var lo = m.d - 4.6 * m.seD, hi = m.d + 4.6 * m.seD;
    if (lo > -0.5) lo = -0.5 - 0.1 * (hi - lo);          // keep the zero line on screen
    if (hi < 0.5) hi = 0.5 + 0.1 * (hi - lo);
    var NB = 46, bw = (hi - lo) / NB, counts = new Array(NB).fill(0);
    runs.forEach(function (x) { var b = Math.floor((x - lo) / bw); if (b >= 0 && b < NB) counts[b]++; });
    var pdfMax = 1 / (m.seD * Math.sqrt(2 * Math.PI)), expMax = Math.max(1, runs.length) * bw * pdfMax;
    var top = Math.max(Math.max.apply(null, counts), expMax) * 1.12 || 1;
    function X(v) { return padL + (v - lo) / (hi - lo) * (W - padL - padR); }
    function Y(c) { return H - padB - c / top * (H - padB - padT); }
    // bars
    for (var i = 0; i < NB; i++) {
      if (!counts[i]) continue;
      var v0 = lo + i * bw, v1 = v0 + bw;
      ctx.fillStyle = (v0 + v1) / 2 <= 0 ? signal : teal;
      ctx.fillRect(X(v0) + 1, Y(counts[i]), Math.max(1, X(v1) - X(v0) - 2), H - padB - Y(counts[i]));
    }
    // normal curve
    ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.beginPath();
    for (var s = 0; s <= 120; s++) {
      var v = lo + (hi - lo) * s / 120, z = (v - m.d) / m.seD, c = Math.max(1, runs.length) * bw * pdfMax * Math.exp(-0.5 * z * z);
      if (s === 0) ctx.moveTo(X(v), Y(c)); else ctx.lineTo(X(v), Y(c));
    }
    ctx.stroke();
    // axis, zero line, observed gap
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
    ctx.setLineDash([7, 5]); ctx.strokeStyle = signal; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(0), padT - 4); ctx.lineTo(X(0), H - padB); ctx.stroke();
    ctx.strokeStyle = amber; ctx.beginPath(); ctx.moveTo(X(m.d), padT - 4); ctx.lineTo(X(m.d), H - padB); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ink2; ctx.font = '600 15px "Space Grotesk", "Segoe UI", sans-serif'; ctx.textBaseline = 'top';
    var ticks = 5;
    for (var t = 0; t <= ticks; t++) { var tv = lo + (hi - lo) * t / ticks; ctx.textAlign = t === 0 ? 'left' : t === ticks ? 'right' : 'center'; ctx.fillText((tv > 0 ? '+' : '') + tv.toFixed(1), X(tv), H - padB + 8); }
    ctx.textAlign = 'left'; ctx.fillStyle = signal; ctx.fillText('0', X(0) + 6, padT - 2);
    ctx.fillStyle = ink2; ctx.textAlign = 'right'; ctx.fillText('score gap A − B (points)', W - padR, padT - 2);
  }

  var current = null;
  function render() {
    var m = current = model();
    tiles.gap.textContent = (m.d >= 0 ? '+' : '') + f1(m.d) + ' pts';
    tiles.half.textContent = '±' + f2(m.half);
    var real = Math.abs(m.d) > m.half;
    tiles.verdict.textContent = real ? 'real' : 'noise';
    tiles.verdict.style.color = real ? 'var(--teal)' : 'var(--signal)';
    var over = Math.abs(m.d) < m.hA + m.hB;
    tiles.overlap.textContent = over ? 'yes' : 'no';
    var flip = m.seD > 0 ? Phi(-m.d / m.seD) : (m.d <= 0 ? 1 : 0);
    tiles.flip.textContent = (flip * 100 < 0.05 ? '<0.1' : (flip * 100).toFixed(flip < 0.1 ? 1 : 0)) + '%';
    var n95 = nNeeded(m, 1.96), n80 = nNeeded(m, 2.8);
    tiles.n95.textContent = isFinite(n95) ? fmtN(n95) : '∞';
    tiles.n80.textContent = isFinite(n80) ? fmtN(n80) : '∞';
    var how = st.paired ? 'paired on the same questions (ρ = ' + f2(st.rho) + ')' : 'scored independently';
    take.textContent = 'With N = ' + fmtN(m.N) + ', ' + how + ', a ' + f1(Math.abs(m.d)) + '-point gap has a 95% half-width of ±' + f2(m.half) + ': it ' +
      (real ? 'clears' : 'does not clear') + ' the bar, and the order would flip in about ' + (flip * 100 < 0.5 ? 'none' : Math.round(flip * 100) + '%') + ' of reruns.' +
      (Math.abs(m.d) > 0.4 && !real && isFinite(n95) ? ' You would need roughly ' + fmtN(n95) + ' questions.' : '');
    draw(m);
  }
  function changed() { runs = []; cnt.textContent = ''; render(); }

  /* ---------- bootstrap ---------- */
  function resample(m) {
    var N = m.N, both = m.pA * m.pB + m.cov, onlyA = m.pA - both, onlyB = m.pB - both;
    var cA = binom(N, both), r1 = N - cA;
    var a1 = r1 > 0 ? binom(r1, onlyA / Math.max(1e-9, 1 - both)) : 0, r2 = r1 - a1;
    var b1 = r2 > 0 ? binom(r2, onlyB / Math.max(1e-9, 1 - both - onlyA)) : 0;
    return ((cA + a1) - (cA + b1)) / N * 100;           // A score minus B score, in points
  }
  function batch() {
    raf = 0;
    var m = current, k = Math.min(R_MAX - runs.length, reduce ? R_MAX : 50);
    for (var i = 0; i < k; i++) runs.push(resample(m));
    var flips = 0; runs.forEach(function (x) { if (x <= 0) flips++; });
    var s = runs.slice().sort(function (a, b) { return a - b; });
    cnt.textContent = fmtN(runs.length) + ' resamples · B ties or beats A in ' + (flips / runs.length * 100).toFixed(1) + '% · 95% interval [' +
      (s[Math.floor(0.025 * s.length)]).toFixed(1) + ', ' + (s[Math.min(s.length - 1, Math.floor(0.975 * s.length))]).toFixed(1) + ']';
    draw(m);
    if (runs.length < R_MAX) raf = requestAnimationFrame(batch);
  }
  go.addEventListener('click', function () { if (raf) cancelAnimationFrame(raf); runs = []; raf = requestAnimationFrame(batch); });
  clr.addEventListener('click', function () { if (raf) cancelAnimationFrame(raf); raf = 0; changed(); });

  new MutationObserver(function () { if (current) draw(current); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (current) draw(current); });
  syncPresets(); syncMode(); render();
  root.__lab = { st: st, render: render, model: model };
})();
