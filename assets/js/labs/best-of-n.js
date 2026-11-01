/* Lab for "Thinking longer, voting more": a best-of-n explorer and a majority-vote explorer.
   Best-of-n: true quality theta ~ N(0,1); the grader sees theta + noise; we keep the answer with the highest score.
     KL cost            ln n - (n-1)/n                    (exact for a continuous reward)
     oracle best        E[max of n standard normals]      (numerical integral)
     true quality, Gaussian noise sigma    M_n / sqrt(1 + sigma^2)   (closed form: E[theta | s] = s / (1 + sigma^2))
     true quality, heavy-tailed noise      Monte Carlo (noise = sigma * Student-t with 2 d.o.f.)
   Majority vote: each question has its own success probability q ~ Beta with mean p and correlation rho
     (alpha + beta = 1/rho - 1); n samples are iid Bernoulli(q); the vote is exact beta-binomial arithmetic.
     n_eff = n / (1 + (n-1) rho). */
(function () {
  'use strict';
  var root = document.querySelector('.lab[data-lab="best-of-n"]');
  if (!root) return;
  var host = root.querySelector('[data-lab-ui]');
  if (!host) return;
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------- maths ---------- */
  function erfc(x) {                       // Numerical Recipes erfcc, |error| < 1.2e-7
    var z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function Phi(x) { return 0.5 * erfc(-x / Math.SQRT2); }
  function phi(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
  function expMax(n) {                     // integral of n x phi(x) Phi(x)^(n-1)
    if (n === 1) return 0;
    var s = 0, h = 0.004, x;
    for (x = -9; x <= 9; x += h) s += n * x * phi(x) * Math.exp((n - 1) * Math.log(Math.max(Phi(x), 1e-300))) * h;
    return s;
  }
  function klBoN(n) { return Math.log(n) - (n - 1) / n; }
  function lgamma(x) {                     // Lanczos
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, t = x + 5.5, ser = 1.000000000190015, j;
    t -= (x + 0.5) * Math.log(t);
    for (j = 0; j < 6; j++) ser += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * ser / x);
  }
  function lbeta(a, b) { return lgamma(a) + lgamma(b) - lgamma(a + b); }
  function lchoose(n, k) { return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1); }

  function rng(seed) {
    var a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
  function t2(r) { var u = Math.min(1 - 1e-9, Math.max(1e-9, r())); return (2 * u - 1) / Math.sqrt(2 * u * (1 - u)); }
  function noise(r, heavy) { return heavy ? t2(r) : gauss(r); }

  /* Monte Carlo: n answers, grader noise sigma * eps; returns mean true quality of the pick and P(pick is truly best) */
  function simulate(n, trials, r, sigma, heavy) {
    var sumQ = 0, wins = 0, t, i, th, s, bestS, bestT, pickTh, argT, argS;
    for (t = 0; t < trials; t++) {
      bestS = -Infinity; bestT = -Infinity; pickTh = 0; argT = -1; argS = -1;
      for (i = 0; i < n; i++) {
        th = gauss(r); s = th + sigma * noise(r, heavy);
        if (s > bestS) { bestS = s; pickTh = th; argS = i; }
        if (th > bestT) { bestT = th; argT = i; }
      }
      sumQ += pickTh; if (argS === argT) wins++;
    }
    return { q: sumQ / trials, win: wins / trials };
  }

  /* majority vote, exact */
  function pmf(n, k, p, rho) {
    if (rho <= 0) return Math.exp(lchoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
    var m = 1 / rho - 1, a = p * m, b = (1 - p) * m;
    return Math.exp(lchoose(n, k) + lbeta(k + a, n - k + b) - lbeta(a, b));
  }
  function voteAcc(n, p, rho) {
    var s = 0, k;
    for (k = Math.floor(n / 2) + 1; k <= n; k++) s += pmf(n, k, p, rho);
    if (n % 2 === 0) s += 0.5 * pmf(n, n / 2, p, rho);
    return s;
  }
  function voteCeiling(p, rho) {           // P(q > 1/2): the share of questions where the vote eventually wins
    if (rho <= 0) return p > 0.5 ? 1 : (p === 0.5 ? 0.5 : 0);
    var m = 1 / rho - 1, a = p * m, b = (1 - p) * m, lb = lbeta(a, b), s = 0, N = 4000, i, q;
    for (i = 0; i < N; i++) { q = 0.5 + 0.5 * (i + 0.5) / N; s += Math.exp((a - 1) * Math.log(q) + (b - 1) * Math.log(1 - q) - lb) * 0.5 / N; }
    return Math.min(1, s);
  }
  function betaPdf(q, p, rho) {
    var m = 1 / rho - 1, a = p * m, b = (1 - p) * m;
    return Math.exp((a - 1) * Math.log(q) + (b - 1) * Math.log(1 - q) - lbeta(a, b));
  }

  /* ---------- tiny DOM helpers ---------- */
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function sv(tag, attrs, style) {
    var e = document.createElementNS(SVGNS, tag), k;
    for (k in attrs) e.setAttribute(k, attrs[k]);
    if (style) e.setAttribute('style', style);
    return e;
  }
  function svText(x, y, str, style, anchor, extra) {
    var t = sv('text', { x: x, y: y, 'text-anchor': anchor || 'middle' }, style); t.textContent = str;
    if (extra) for (var k in extra) t.setAttribute(k, extra[k]);
    return t;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function fmt(x, d) { return (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d); }
  function pct(x) { return x >= 0.99995 ? '100%' : (100 * x).toFixed(x > 0.9995 ? 2 : 1) + '%'; }

  var M = [], i;                           // E[max of 2^i standard normals], i = 0..12
  for (i = 0; i <= 12; i++) M.push(expMax(Math.pow(2, i)));

  /* ---------- state ---------- */
  var S = { mode: 'bon', li: 4, sigma: 1, heavy: false, seed: 12345, vli: 6, p: 0.6, rho: 0.05 };
  var heavyCache = {};

  /* ---------- UI skeleton ---------- */
  clear(host);
  var tabs = el('div', 'tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Experiment');
  var tabB = el('button', '', 'Best-of-n'), tabV = el('button', '', 'Majority vote');
  tabB.type = tabV.type = 'button'; tabs.appendChild(tabB); tabs.appendChild(tabV);

  function rangeCtl(parent, label, min, max, step, value, f, onInput) {
    var wrap = el('label', 'ctl ctl-range'); wrap.appendChild(el('span', 'ctl-l', label));
    var inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value; inp.setAttribute('aria-label', label);
    var out = el('output', 'ctl-o'); out.textContent = f(value);
    inp.addEventListener('input', function () { var v = parseFloat(inp.value); out.textContent = f(v); onInput(v); });
    wrap.appendChild(inp); wrap.appendChild(out); parent.appendChild(wrap);
    return { inp: inp, out: out, set: function (v) { inp.value = v; out.textContent = f(parseFloat(v)); } };
  }
  var cB = el('div', 'controls'), cV = el('div', 'controls');
  var nSlider = rangeCtl(cB, 'answers n', 0, 10, 1, S.li, function (v) { return Math.pow(2, v); }, function (v) { S.li = v; render(); });
  var sSlider = rangeCtl(cB, 'grader noise', 0, 2, 0.05, S.sigma, function (v) { return v.toFixed(2); }, function (v) { S.sigma = v; render(); });
  var errSeg = el('div', 'ctl ctl-seg'); errSeg.setAttribute('role', 'group'); errSeg.setAttribute('aria-label', 'Grader error shape');
  errSeg.appendChild(el('span', 'ctl-l', 'errors'));
  var eG = el('button', '', 'Gaussian'), eH = el('button', '', 'Heavy-tailed'); eG.type = eH.type = 'button';
  errSeg.appendChild(eG); errSeg.appendChild(eH); cB.appendChild(errSeg);
  var again = el('div', 'ctl ctl-act'), againB = el('button', '', 'Resample'); againB.type = 'button'; again.appendChild(againB); cB.appendChild(again);

  var vnSlider = rangeCtl(cV, 'samples n', 0, 8, 1, S.vli, function (v) { return Math.pow(2, v); }, function (v) { S.vli = v; render(); });
  var pSlider = rangeCtl(cV, 'one sample right', 0.5, 0.9, 0.01, S.p, function (v) { return v.toFixed(2); }, function (v) { S.p = v; render(); });
  var rSlider = rangeCtl(cV, 'correlation', 0, 0.3, 0.01, S.rho, function (v) { return v.toFixed(2); }, function (v) { S.rho = v; render(); });

  var tiles = el('div', 'lab-out'); tiles.setAttribute('aria-live', 'polite');
  var panels = el('div', ''); panels.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px';
  var svgL = sv('svg', { viewBox: '0 0 360 270', role: 'img', 'class': 'stage' }), svgR = sv('svg', { viewBox: '0 0 360 270', role: 'img', 'class': 'stage' });
  panels.appendChild(svgL); panels.appendChild(svgR);
  var take = el('p', 'lab-note'); take.style.fontStyle = 'normal'; take.style.fontWeight = '600'; take.style.color = 'var(--ink)';
  var how = el('p', 'lab-note');
  [tabs, cB, cV, tiles, panels, take, how].forEach(function (n) { host.appendChild(n); });

  function setTab(mode) {
    S.mode = mode;
    tabB.setAttribute('aria-pressed', String(mode === 'bon')); tabV.setAttribute('aria-pressed', String(mode === 'vote'));
    cB.hidden = mode !== 'bon'; cV.hidden = mode !== 'vote';
    render();
  }
  tabB.addEventListener('click', function () { setTab('bon'); });
  tabV.addEventListener('click', function () { setTab('vote'); });
  function setErr(heavy) {
    S.heavy = heavy; eG.setAttribute('aria-pressed', String(!heavy)); eH.setAttribute('aria-pressed', String(heavy));
    S.sigma = heavy ? 0.7 : 1; sSlider.set(S.sigma);          // the two defaults used in the post
    render();
  }
  eG.addEventListener('click', function () { setErr(false); });
  eH.addEventListener('click', function () { setErr(true); });
  againB.addEventListener('click', function () { S.seed = (S.seed * 1664525 + 1013904223) | 0; heavyCache = {}; render(); });

  function tile(value, label) { var d = el('div', 'ro'); d.appendChild(el('b', '', value)); d.appendChild(el('span', '', label)); tiles.appendChild(d); }

  /* ---------- best-of-n view ---------- */
  function trueQualityCurve() {            // index 0..10 -> expected true quality of the pick
    var out = [], k, n;
    if (!S.heavy) { for (k = 0; k <= 10; k++) out.push(M[k] / Math.sqrt(1 + S.sigma * S.sigma)); return out; }
    var key = Math.round(S.sigma * 100) + ':' + S.seed;
    if (heavyCache[key]) return heavyCache[key];
    for (k = 0; k <= 10; k++) {
      n = Math.pow(2, k);
      out.push(simulate(n, Math.max(150, Math.min(4000, Math.floor(300000 / n))), rng(S.seed + 97 * k + 5), S.sigma, true).q);
    }
    heavyCache[key] = out; return out;
  }

  function axes(svg, x0, y0, w, h, xt, yt, xl, yl) {
    svg.appendChild(sv('line', { x1: x0, y1: y0 + h, x2: x0 + w, y2: y0 + h }, 'stroke:var(--ink);stroke-width:1.5'));
    svg.appendChild(sv('line', { x1: x0, y1: y0, x2: x0, y2: y0 + h }, 'stroke:var(--ink);stroke-width:1.5'));
    xt.forEach(function (t) {
      svg.appendChild(sv('line', { x1: t.x, y1: y0 + h, x2: t.x, y2: y0 + h + 4 }, 'stroke:var(--ink)'));
      svg.appendChild(svText(t.x, y0 + h + 16, t.s, 'font-size:10px;fill:var(--ink-2)'));
    });
    yt.forEach(function (t) {
      svg.appendChild(sv('line', { x1: x0 - 4, y1: t.y, x2: x0, y2: t.y }, 'stroke:var(--ink)'));
      svg.appendChild(sv('line', { x1: x0, y1: t.y, x2: x0 + w, y2: t.y }, 'stroke:var(--rule);stroke-width:1;stroke-dasharray:2 4'));
      svg.appendChild(svText(x0 - 7, t.y + 3.5, t.s, 'font-size:10px;fill:var(--ink-2)', 'end'));
    });
    svg.appendChild(svText(x0 + w / 2, 264, xl, 'font-size:10.5px;font-weight:700;letter-spacing:.06em;fill:var(--ink)'));
    var yt2 = svText(11, y0 + h / 2, yl, 'font-size:10.5px;font-weight:700;letter-spacing:.06em;fill:var(--ink)');
    yt2.setAttribute('transform', 'rotate(-90 11 ' + (y0 + h / 2) + ')'); svg.appendChild(yt2);
  }

  function renderBoN() {
    var n = Math.pow(2, S.li), sigma = S.sigma, heavy = S.heavy;
    var curve = trueQualityCurve();
    var q = curve[S.li];
    var w = simulate(n, Math.max(150, Math.min(2000, Math.floor(1200000 / n))), rng(S.seed * 7 + n), sigma, heavy);
    var kl = klBoN(n);

    /* one concrete draw for the scatter */
    var r = rng(S.seed + n * 31), pts = [], bestS = -Infinity, pickI = 0, bestT = -Infinity, bestI = 0, j, th, s;
    for (j = 0; j < n; j++) {
      th = gauss(r); s = th + sigma * noise(r, heavy); pts.push([s, th]);
      if (s > bestS) { bestS = s; pickI = j; }
      if (th > bestT) { bestT = th; bestI = j; }
    }
    var rank = 1; for (j = 0; j < n; j++) if (pts[j][1] > pts[pickI][1]) rank++;

    clear(tiles);
    tile(fmt(kl, 2) + ' nats', 'KL bill of the pick');
    tile(fmt(M[S.li], 2), 'oracle best quality, E[max of n]');
    tile(fmt(q, 2), 'true quality of the pick (' + (heavy ? 'simulated' : 'exact') + ')');
    tile(pct(w.win), 'P(pick is truly the best of n)');
    tile(n === 1 ? '—' : fmt(q / kl, 2), 'true quality per nat');
    tile(rank + ' of ' + n, 'rank of the pick, this draw');

    /* left: scatter of score vs true quality */
    clear(svgL);
    var X0 = 38, Y0 = 12, W = 312, Hh = 214, XD = [-5, 5], YD = [-4, 4];
    function px(v) { return X0 + (Math.max(XD[0], Math.min(XD[1], v)) - XD[0]) / (XD[1] - XD[0]) * W; }
    function py(v) { return Y0 + Hh - (Math.max(YD[0], Math.min(YD[1], v)) - YD[0]) / (YD[1] - YD[0]) * Hh; }
    axes(svgL, X0, Y0, W, Hh, [-4, -2, 0, 2, 4].map(function (v) { return { x: px(v), s: String(v) }; }),
      [-3, 0, 3].map(function (v) { return { y: py(v), s: String(v) }; }), 'GRADER SCORE', 'TRUE QUALITY');
    if (!heavy) svgL.appendChild(sv('line', { x1: px(-5), y1: py(-5 / (1 + sigma * sigma)), x2: px(5), y2: py(5 / (1 + sigma * sigma)) }, 'stroke:var(--ink-2);stroke-width:1.4;stroke-dasharray:5 4'));
    var rad = n <= 64 ? 3.4 : n <= 256 ? 2.4 : 1.7;
    for (j = 0; j < n; j++) {
      if (j === pickI || j === bestI) continue;
      svgL.appendChild(sv('circle', { cx: px(pts[j][0]), cy: py(pts[j][1]), r: rad }, 'fill:var(--ink-2);fill-opacity:.45'));
    }
    if (bestI !== pickI) svgL.appendChild(sv('circle', { cx: px(pts[bestI][0]), cy: py(pts[bestI][1]), r: 6 }, 'fill:var(--teal);stroke:var(--ink);stroke-width:1.5'));
    svgL.appendChild(sv('circle', { cx: px(pts[pickI][0]), cy: py(pts[pickI][1]), r: 6.5 }, 'fill:var(--signal);stroke:var(--ink);stroke-width:1.8'));
    svgL.appendChild(svText(X0 + 6, Y0 + 12, 'red: picked', 'font-size:10px;font-weight:700;fill:var(--signal)', 'start'));
    if (bestI !== pickI) svgL.appendChild(svText(X0 + 6, Y0 + 25, 'teal: truly best', 'font-size:10px;font-weight:700;fill:var(--teal)', 'start'));
    if (!heavy) svgL.appendChild(svText(X0 + W - 4, Y0 + Hh - 6, 'dashed: E[quality | score]', 'font-size:9.5px;fill:var(--ink-2)', 'end'));
    svgL.setAttribute('aria-label', 'Scatter of grader score against true quality for ' + n + ' answers. The picked answer has true quality ' + fmt(pts[pickI][1], 2) + ', rank ' + rank + ' of ' + n + '.');

    /* right: true quality of the pick against n */
    clear(svgR);
    var RX0 = 40, RY0 = 12, RW = 308, RH = 214, RD = [-0.2, 3.6];
    function rx(k) { return RX0 + k / 10 * RW; }
    function ry(v) { return RY0 + RH - (Math.max(RD[0], Math.min(RD[1], v)) - RD[0]) / (RD[1] - RD[0]) * RH; }
    axes(svgR, RX0, RY0, RW, RH, [0, 2, 4, 6, 8, 10].map(function (k) { return { x: rx(k), s: String(Math.pow(2, k)) }; }),
      [0, 1, 2, 3].map(function (v) { return { y: ry(v), s: String(v) }; }), 'ANSWERS n (LOG SCALE)', 'QUALITY');
    var d1 = '', d2 = '', k;
    for (k = 0; k <= 10; k++) { d1 += (k ? 'L' : 'M') + rx(k).toFixed(1) + ' ' + ry(M[k]).toFixed(1); d2 += (k ? 'L' : 'M') + rx(k).toFixed(1) + ' ' + ry(curve[k]).toFixed(1); }
    svgR.appendChild(sv('path', { d: d1 }, 'fill:none;stroke:var(--teal);stroke-width:2.4;stroke-dasharray:6 5'));
    svgR.appendChild(sv('path', { d: d2 }, 'fill:none;stroke:var(--signal);stroke-width:3;stroke-linecap:round;stroke-linejoin:round'));
    svgR.appendChild(sv('line', { x1: rx(S.li), y1: RY0, x2: rx(S.li), y2: RY0 + RH }, 'stroke:var(--ink);stroke-width:1;stroke-dasharray:3 3'));
    svgR.appendChild(sv('circle', { cx: rx(S.li), cy: ry(q), r: 5.5 }, 'fill:var(--signal);stroke:var(--ink);stroke-width:1.8'));
    svgR.appendChild(svText(RX0 + 8, RY0 + 13, 'teal dashed: perfect grader', 'font-size:10px;font-weight:700;fill:var(--teal)', 'start'));
    svgR.appendChild(svText(RX0 + 8, RY0 + 26, 'red: your grader', 'font-size:10px;font-weight:700;fill:var(--signal)', 'start'));
    svgR.setAttribute('aria-label', 'True quality of the chosen answer against n. At n = ' + n + ' it is ' + fmt(q, 2) + ' against ' + fmt(M[S.li], 2) + ' for a perfect grader.');

    /* takeaway */
    var peak = 0; for (k = 1; k <= 10; k++) if (curve[k] > curve[peak]) peak = k;
    var msg;
    if (heavy && peak < 10 && curve[10] < curve[peak] - 0.05) {
      msg = 'With these grader errors the true quality peaks near n = ' + Math.pow(2, peak) + ' (' + fmt(curve[peak], 2) + ') and then falls to ' + fmt(curve[10], 2) + ' at n = 1024: the pick is increasingly an answer the grader overrates by luck.';
    } else if (S.li > 0) {
      msg = 'Doubling n from ' + Math.pow(2, S.li - 1) + ' to ' + n + ' costs ' + fmt(kl - klBoN(n / 2), 2) + ' more nats of KL and moves the pick’s true quality by ' + (curve[S.li] - curve[S.li - 1] >= 0 ? '+' : '−') + fmt(Math.abs(curve[S.li] - curve[S.li - 1]), 2) + '.';
    } else {
      msg = 'n = 1 is the base policy: no KL spent, true quality 0 on average, whatever the grader is like.';
    }
    take.textContent = msg;
    how.textContent = heavy
      ? 'Heavy-tailed noise is the grader score plus the slider value times a Student-t draw with 2 degrees of freedom (infinite variance, so the slider is a scale, not a standard deviation). Quality values are Monte Carlo averages; Resample draws fresh ones.'
      : 'Gaussian noise: the grader sees quality plus N(0, σ²) noise, so the pick’s expected true quality is E[max of n]/√(1+σ²), which is exact. With zero noise you get the perfect-grader line. The win rate is a Monte Carlo estimate.';
  }

  /* ---------- majority-vote view ---------- */
  function renderVote() {
    var n = Math.pow(2, S.vli), p = S.p, rho = S.rho;
    var acc = voteAcc(n, p, rho), ceil = voteCeiling(p, rho), neff = n / (1 + (n - 1) * rho);
    clear(tiles);
    tile(pct(acc), 'vote accuracy at n = ' + n);
    tile(pct(p), 'one sample alone');
    tile(fmt(neff, 1), 'effective samples out of ' + n);
    tile(rho > 0 ? fmt(1 / rho, 0) : '∞', 'ceiling on effective samples, 1 over correlation');
    tile(pct(ceil), 'accuracy as n → ∞');

    /* left: spread of the per-question success probability */
    clear(svgL);
    var X0 = 38, Y0 = 12, W = 312, Hh = 214;
    function px(q) { return X0 + q * W; }
    axes(svgL, X0, Y0, W, Hh, [0, 0.25, 0.5, 0.75, 1].map(function (q) { return { x: px(q), s: String(q) }; }), [], 'PER-QUESTION SUCCESS PROBABILITY q', 'SHARE OF QUESTIONS');
    if (rho <= 0) {
      svgL.appendChild(sv('line', { x1: px(p), y1: Y0 + 6, x2: px(p), y2: Y0 + Hh }, 'stroke:var(--teal);stroke-width:4'));
      svgL.appendChild(svText(px(p) + (p > 0.75 ? -8 : 8), Y0 + 20, 'all questions equally hard', 'font-size:10px;font-weight:700;fill:var(--teal)', p > 0.75 ? 'end' : 'start'));
    } else {
      var G = 160, ys = [], top = 0, g, q;
      for (g = 0; g < G; g++) { q = (g + 0.5) / G; var v = Math.min(10, betaPdf(q, p, rho)); ys.push(v); if (v > top) top = v; }
      function py(v) { return Y0 + Hh - v / top * (Hh - 14); }
      var dUp = '', dLo = '';
      for (g = 0; g < G; g++) {
        q = (g + 0.5) / G;
        if (q >= 0.5) dUp += (dUp ? 'L' : 'M') + px(q).toFixed(1) + ' ' + py(ys[g]).toFixed(1);
        else dLo += (dLo ? 'L' : 'M') + px(q).toFixed(1) + ' ' + py(ys[g]).toFixed(1);
      }
      svgL.appendChild(sv('path', { d: dLo + 'L' + px(0.5) + ' ' + (Y0 + Hh) + 'L' + px(0) + ' ' + (Y0 + Hh) + 'Z' }, 'fill:var(--signal);fill-opacity:.55;stroke:var(--signal);stroke-width:1.5'));
      svgL.appendChild(sv('path', { d: dUp + 'L' + px(1) + ' ' + (Y0 + Hh) + 'L' + px(0.5) + ' ' + (Y0 + Hh) + 'Z' }, 'fill:var(--teal);fill-opacity:.5;stroke:var(--teal);stroke-width:1.5'));
      svgL.appendChild(svText(px(0.5) - 6, Y0 + 14, 'mostly wrong', 'font-size:10px;font-weight:700;fill:var(--signal)', 'end'));
      svgL.appendChild(svText(px(0.5) + 6, Y0 + 14, 'mostly right', 'font-size:10px;font-weight:700;fill:var(--teal)', 'start'));
    }
    svgL.appendChild(sv('line', { x1: px(0.5), y1: Y0, x2: px(0.5), y2: Y0 + Hh }, 'stroke:var(--ink);stroke-width:1.2;stroke-dasharray:4 3'));
    svgL.setAttribute('aria-label', 'Distribution of per-question success probability with mean ' + fmt(p, 2) + ' and correlation ' + fmt(rho, 2) + '. About ' + pct(ceil) + ' of questions lie above one half.');

    /* right: vote accuracy against n */
    clear(svgR);
    var RX0 = 40, RY0 = 12, RW = 308, RH = 214, lo = Math.min(0.5, p) - 0.02;
    function rx(k) { return RX0 + k / 8 * RW; }
    function ry(v) { return RY0 + RH - (Math.max(lo, Math.min(1, v)) - lo) / (1 - lo) * RH; }
    var yt = []; [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach(function (v) { if (v >= lo) yt.push({ y: ry(v), s: String(v) }); });
    axes(svgR, RX0, RY0, RW, RH, [0, 2, 4, 6, 8].map(function (k) { return { x: rx(k), s: String(Math.pow(2, k)) }; }), yt, 'SAMPLES n (LOG SCALE)', 'VOTE ACCURACY');
    var dA = '', dI = '', k, nn;
    for (k = 0; k <= 8; k++) {
      nn = Math.pow(2, k);
      dA += (k ? 'L' : 'M') + rx(k).toFixed(1) + ' ' + ry(voteAcc(nn, p, rho)).toFixed(1);
      dI += (k ? 'L' : 'M') + rx(k).toFixed(1) + ' ' + ry(voteAcc(nn, p, 0)).toFixed(1);
    }
    if (rho > 0) svgR.appendChild(sv('path', { d: dI }, 'fill:none;stroke:var(--amber);stroke-width:2.4;stroke-dasharray:6 5'));
    if (rho > 0) svgR.appendChild(sv('line', { x1: RX0, y1: ry(ceil), x2: RX0 + RW, y2: ry(ceil) }, 'stroke:var(--teal);stroke-width:1.6;stroke-dasharray:2 4'));
    svgR.appendChild(sv('path', { d: dA }, 'fill:none;stroke:var(--signal);stroke-width:3;stroke-linecap:round;stroke-linejoin:round'));
    svgR.appendChild(sv('line', { x1: rx(S.vli), y1: RY0, x2: rx(S.vli), y2: RY0 + RH }, 'stroke:var(--ink);stroke-width:1;stroke-dasharray:3 3'));
    svgR.appendChild(sv('circle', { cx: rx(S.vli), cy: ry(acc), r: 5.5 }, 'fill:var(--signal);stroke:var(--ink);stroke-width:1.8'));
    svgR.appendChild(svText(RX0 + RW - 4, RY0 + RH - 8, 'red: with correlation', 'font-size:10px;font-weight:700;fill:var(--signal)', 'end'));
    if (rho > 0) {
      svgR.appendChild(svText(RX0 + RW - 4, RY0 + RH - 21, 'amber: independent samples', 'font-size:10px;font-weight:700;fill:var(--amber)', 'end'));
      svgR.appendChild(svText(RX0 + 8, ry(ceil) - 5, 'ceiling ' + pct(ceil), 'font-size:10px;font-weight:700;fill:var(--teal)', 'start'));
    }
    svgR.setAttribute('aria-label', 'Majority-vote accuracy against n. At n = ' + n + ' it is ' + pct(acc) + '; the ceiling as n grows is ' + pct(ceil) + '.');

    take.textContent = rho > 0
      ? n + ' samples behave like ' + fmt(neff, 1) + '. Voting tops out at ' + pct(ceil) + ' however many you draw, because about ' + pct(1 - ceil) + ' of questions are ones this model mostly gets wrong.'
      : 'With independent samples and p above one half the vote climbs to 100%. Real samples are not independent, so push ρ above zero.';
    how.textContent = 'Each question has its own success probability q drawn from a Beta distribution with mean p; its correlation between two samples is ρ. Votes are counted exactly (beta-binomial); a tie at even n counts as half a win.';
  }

  function render() {
    if (S.mode === 'bon') renderBoN(); else renderVote();
  }

  setErr(false);
  setTab('bon');
  root.setAttribute('data-ready', '1');
})();
