/* Chinchilla lab: pick a compute budget and a scaling law, read off the compute-optimal N and D, then compare
   a smaller "over-trained" model that reaches the same loss. All numbers come from the post's own formulas:
     L(N,D) = E + A/N^alpha + B/D^beta,  C = 6ND,  N* = G (C/6)^a,  a = beta/(alpha+beta),
     G = (alpha A / beta B)^(1/(alpha+beta)).
   Serving cost per token is taken as 2N FLOPs (a forward pass), so cumulative cost = 6ND + 2N * T for T served tokens.
   Laws: Published = Hoffmann et al. Approach 3 constants as printed in Besiroglu et al. (2024) Eq. 4;
         Refit = Besiroglu et al. refit; Kaplan-style = exponents a=0.73, b=0.27 anchored to the published-fit
         optimum at Chinchilla's budget (5.9e23), with loss read off the published fit. */
(function () {
  'use strict';
  var root = document.querySelector('.lab[data-lab="chinchilla"]');
  if (!root) return;
  var body = root.querySelector('.lab-b');
  if (!body) return;

  var LAWS = {
    pub: { E: 1.6934, A: 406.4, B: 410.7, al: 0.3392, be: 0.2849 },
    ref: { E: 1.8172, A: 482.01, B: 2085.43, al: 0.3478, be: 0.3658 }
  };
  Object.keys(LAWS).forEach(function (key) {
    var w = LAWS[key];
    w.a = w.be / (w.al + w.be);
    w.G = Math.pow(w.al * w.A / (w.be * w.B), 1 / (w.al + w.be));
  });
  var C0 = 5.9e23;
  var KAPLAN_A = 0.73;
  function lossAt(w, N, D) { return w.E + w.A * Math.pow(N, -w.al) + w.B * Math.pow(D, -w.be); }
  function optimum(w, C) { var N = w.G * Math.pow(C / 6, w.a); return { N: N, D: C / (6 * N) }; }
  var pubOpt0 = optimum(LAWS.pub, C0);

  /* the allocation the chosen law recommends for budget C, and the loss function used to judge it */
  function plan(lawKey, C) {
    if (lawKey === 'kap') {
      var N = pubOpt0.N * Math.pow(C / C0, KAPLAN_A);
      return { w: LAWS.pub, N: N, D: C / (6 * N) };
    }
    var w = LAWS[lawKey], o = optimum(w, C);
    return { w: w, N: o.N, D: o.D };
  }
  /* the smaller model's data bill at equal loss; null reason explains why there is none */
  function smaller(p, C, Ns) {
    var Lstar = lossAt(p.w, p.N, p.D);
    if (Ns >= p.N) return { reason: 'big', Lstar: Lstar };
    var floor = p.w.E + p.w.A * Math.pow(Ns, -p.w.al), need = Lstar - floor;
    if (need <= 0) return { reason: 'floor', Lstar: Lstar, floor: floor };
    var Ds = Math.pow(p.w.B / need, 1 / p.w.be), train = 6 * Ns * Ds;
    var Tstar = (train - C) / (2 * (p.N - Ns));
    return { Lstar: Lstar, Ds: Ds, train: train, mult: train / C, saving: 1 - Ns / p.N, Tstar: Tstar };
  }

  /* ---- formatting ---- */
  function fmtSci(v) { var e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e); return m.toFixed(1) + 'e' + e; }
  function fmtN(v) {
    var t;
    if (v >= 1e15) return fmtSci(v);
    if (v >= 1e12) t = (v / 1e12).toFixed(v < 1e13 ? 1 : 0) + 'T';
    else if (v >= 1e9) t = (v / 1e9).toFixed(v < 1e10 ? 1 : 0) + 'B';
    else if (v >= 1e6) t = (v / 1e6).toFixed(v < 1e7 ? 1 : 0) + 'M';
    else return Math.round(v).toString();
    return t.replace('.0', '');
  }
  function fmtX(v) { return (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '×'; }

  /* ---- build the UI ---- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; }

  var state = { law: 'ref', logC: 23.0, logN: Math.log10(8e9) };
  body.textContent = '';

  body.appendChild(el('p', '', 'Pick a training budget and a scaling law. The first row is what the law says is compute-optimal; the second row is a smaller model trained on more data until it reaches the same loss. Where the lines cross, the small model has paid back its extra training.'));

  var ctrl = el('div', 'controls');
  var lawTabs = el('div', 'tabs'); lawTabs.setAttribute('role', 'group'); lawTabs.setAttribute('aria-label', 'Scaling law');
  var lawBtns = {};
  [['ref', 'Refit (Besiroglu)'], ['pub', 'Published fit'], ['kap', 'Kaplan-style']].forEach(function (d) {
    var b = el('button', '', d[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(d[0] === state.law));
    b.addEventListener('click', function () { state.law = d[0]; render(); });
    lawBtns[d[0]] = b; lawTabs.appendChild(b);
  });
  ctrl.appendChild(lawTabs);
  body.appendChild(ctrl);

  var ctrl2 = el('div', 'controls');
  function slider(label, min, max, step, val, onInput) {
    var wrap = el('label', 'ctl ctl-range'); wrap.appendChild(el('span', 'ctl-l', label));
    var inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = val; inp.setAttribute('aria-label', label);
    var out = el('output', 'ctl-o'); inp.addEventListener('input', function () { onInput(parseFloat(inp.value)); });
    wrap.appendChild(inp); wrap.appendChild(out); ctrl2.appendChild(wrap);
    return { inp: inp, out: out };
  }
  var sC = slider('Budget C', 21, 26, 0.05, state.logC, function (v) { state.logC = v; render(); });
  var sN = slider('Small model', 8.5, 11, 0.01, state.logN, function (v) { state.logN = v; render(); });
  body.appendChild(ctrl2);

  var presets = el('div', 'tabs'); presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', 'Presets');
  function preset(label, fn) { var b = el('button', 'btn-s', label); b.type = 'button'; b.addEventListener('click', fn); presets.appendChild(b); }
  preset('Chinchilla’s budget', function () { state.logC = Math.log10(C0); render(); });
  preset('Small model: 1B', function () { state.logN = 9; render(); });
  preset('3B', function () { state.logN = Math.log10(3e9); render(); });
  preset('8B', function () { state.logN = Math.log10(8e9); render(); });
  preset('30B', function () { state.logN = Math.log10(30e9); render(); });
  body.appendChild(presets);

  function tiles(title) {
    var wrap = el('div'); var h = el('div', 'lab-note', title); h.style.marginBottom = '6px'; wrap.appendChild(h);
    var grid = el('div', 'lab-out'); wrap.appendChild(grid);
    return { wrap: wrap, grid: grid };
  }
  function tile(grid, label) { var t = el('div', 'ro'), b = el('b', '', '—'), s = el('span', '', label); t.appendChild(b); t.appendChild(s); grid.appendChild(t); return b; }
  var g1 = tiles('Compute-optimal model for this budget'), g2 = tiles('Smaller model, same loss');
  var rN = tile(g1.grid, 'parameters N*'), rD = tile(g1.grid, 'tokens D*'), rR = tile(g1.grid, 'tokens / parameter'), rL = tile(g1.grid, 'predicted loss');
  var sD = tile(g2.grid, 'tokens it needs'), sR = tile(g2.grid, 'tokens / parameter'), sM = tile(g2.grid, 'training compute vs optimal'), sS = tile(g2.grid, 'cheaper per served token'), sT = tile(g2.grid, 'break-even tokens served');
  body.appendChild(g1.wrap); body.appendChild(g2.wrap);

  var svg = sv('svg', { 'class': 'stage', viewBox: '0 0 640 270', role: 'img' });
  body.appendChild(svg);
  var take = el('p', 'lab-note'); take.setAttribute('aria-live', 'polite'); take.style.fontStyle = 'normal'; take.style.fontWeight = '600';
  body.appendChild(take);
  var foot = el('p', 'lab-note', 'Assumptions: training costs 6ND FLOPs, serving costs 2N FLOPs per token. Kaplan-style uses the exponents 0.73 / 0.27, anchored to the published fit at Chinchilla’s budget, with loss read off the published fit. For scale, a model with 8B parameters trained on 15T tokens sits at 1,875 tokens per parameter.');
  body.appendChild(foot);

  /* ---- the cumulative-cost chart ---- */
  var X0 = 62, X1 = 624, Y0 = 18, Y1 = 224, TLO = 9, THI = 16;
  function drawChart(p, C, Ns, s) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!s || s.reason) {
      svg.appendChild(sv('rect', { x: 0, y: 0, width: 640, height: 270, fill: 'none' }));
      svg.appendChild(sv('text', { x: 320, y: 128, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700 }, s && s.reason === 'floor' ? 'No amount of data lets this model reach that loss' : 'Pick a model smaller than the optimum'));
      svg.setAttribute('aria-label', 'No comparison available for these settings.');
      return;
    }
    function cost(train, n, T) { return train + 2 * n * T; }
    var ymin = Math.log10(C), ymax = Math.log10(cost(s.train, Ns, Math.pow(10, THI))), ymax2 = Math.log10(cost(C, p.N, Math.pow(10, THI)));
    var lo = Math.floor(ymin - 0.2), hi = Math.ceil(Math.max(ymax, ymax2) + 0.1);
    function px(lt) { return X0 + (lt - TLO) / (THI - TLO) * (X1 - X0); }
    function py(ly) { return Y1 - (ly - lo) / (hi - lo) * (Y1 - Y0); }
    var i;
    svg.appendChild(sv('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, fill: 'none', stroke: 'var(--rule)', 'stroke-width': 1 }));
    for (i = TLO; i <= THI; i++) {
      svg.appendChild(sv('line', { x1: px(i), x2: px(i), y1: Y1, y2: Y1 + 5, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
      svg.appendChild(sv('text', { x: px(i), y: Y1 + 19, 'text-anchor': 'middle', 'font-size': 11 }, i === 9 ? '1B' : i === 12 ? '1T' : i === 15 ? '1P' : ''));
    }
    var step = Math.max(1, Math.round((hi - lo) / 5));
    for (i = lo; i <= hi; i += step) {
      svg.appendChild(sv('line', { x1: X0 - 5, x2: X0, y1: py(i), y2: py(i), stroke: 'var(--ink)', 'stroke-width': 1.5 }));
      svg.appendChild(sv('text', { x: X0 - 9, y: py(i) + 4, 'text-anchor': 'end', 'font-size': 11 }, '1e' + i));
    }
    svg.appendChild(sv('text', { x: (X0 + X1) / 2, y: 262, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, 'letter-spacing': '1.5' }, 'TOKENS SERVED  →'));
    var yl = sv('text', { x: 14, y: (Y0 + Y1) / 2, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, 'letter-spacing': '1.5', transform: 'rotate(-90 14 ' + ((Y0 + Y1) / 2) + ')' }, 'TOTAL FLOPs');
    svg.appendChild(yl);
    function path(train, n, colour, dash) {
      var d = '', j;
      for (j = 0; j <= 56; j++) { var lt = TLO + (THI - TLO) * j / 56; d += (j ? 'L' : 'M') + px(lt).toFixed(1) + ' ' + py(Math.log10(cost(train, n, Math.pow(10, lt)))).toFixed(1); }
      var pth = sv('path', { d: d, fill: 'none', stroke: colour, 'stroke-width': 3.2, 'stroke-linecap': 'round' });
      if (dash) pth.setAttribute('stroke-dasharray', dash);
      svg.appendChild(pth);
    }
    path(C, p.N, 'var(--signal)');
    path(s.train, Ns, 'var(--teal)');
    var lt = Math.log10(s.Tstar);
    if (lt >= TLO && lt <= THI) {
      var cx = px(lt), cy = py(Math.log10(cost(C, p.N, s.Tstar)));
      svg.appendChild(sv('line', { x1: cx, x2: cx, y1: cy, y2: Y1, stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }));
      svg.appendChild(sv('circle', { cx: cx, cy: cy, r: 7, fill: 'var(--amber)', stroke: 'var(--ink)', 'stroke-width': 2 }));
      var anchor = cx > 480 ? 'end' : 'start', tx = cx > 480 ? cx - 12 : cx + 12;
      svg.appendChild(sv('text', { x: tx, y: Y1 - 8, 'text-anchor': anchor, 'font-size': 12, 'font-weight': 700 }, 'break-even ' + fmtN(s.Tstar)));
    }
    svg.appendChild(sv('rect', { x: X0 + 10, y: Y0 + 8, width: 12, height: 12, fill: 'var(--signal)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
    svg.appendChild(sv('text', { x: X0 + 28, y: Y0 + 18, 'font-size': 12 }, 'compute-optimal ' + fmtN(p.N) + ' model'));
    svg.appendChild(sv('rect', { x: X0 + 10, y: Y0 + 28, width: 12, height: 12, fill: 'var(--teal)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
    svg.appendChild(sv('text', { x: X0 + 28, y: Y0 + 38, 'font-size': 12 }, 'smaller ' + fmtN(Ns) + ' model, trained to the same loss'));
    svg.setAttribute('aria-label', 'Line chart of total FLOPs against tokens served for the compute-optimal model and the smaller model; they cross at ' + fmtN(s.Tstar) + ' served tokens.');
  }

  /* ---- render ---- */
  function render() {
    var C = Math.pow(10, state.logC), Ns = Math.pow(10, state.logN);
    var p = plan(state.law, C), s = smaller(p, C, Ns);
    Object.keys(lawBtns).forEach(function (kk) { lawBtns[kk].setAttribute('aria-pressed', String(kk === state.law)); });
    sC.inp.value = state.logC; sN.inp.value = state.logN;
    sC.out.textContent = fmtSci(C); sN.out.textContent = fmtN(Ns);
    rN.textContent = fmtN(p.N); rD.textContent = fmtN(p.D); rR.textContent = (p.D / p.N).toFixed(1);
    rL.textContent = lossAt(p.w, p.N, p.D).toFixed(3);
    if (s.reason) {
      sD.textContent = sR.textContent = sM.textContent = sS.textContent = sT.textContent = '—';
      take.textContent = s.reason === 'floor'
        ? 'A ' + fmtN(Ns) + ' model cannot reach this loss: even with unlimited data its floor is ' + s.floor.toFixed(3) + ', above the target ' + s.Lstar.toFixed(3) + '. Pick a bigger small model or a smaller budget.'
        : 'This model is not smaller than the compute-optimal one (' + fmtN(p.N) + '), so there is nothing to save at serving time.';
    } else {
      sD.textContent = fmtN(s.Ds); sR.textContent = Math.round(s.Ds / Ns).toLocaleString('en-US');
      sM.textContent = fmtX(s.mult); sS.textContent = Math.round(s.saving * 100) + '%'; sT.textContent = fmtN(s.Tstar);
      take.textContent = 'At equal loss the ' + fmtN(Ns) + ' model needs ' + fmtX(s.mult) + ' the training compute but is ' + Math.round(s.saving * 100) + '% cheaper per served token. Serve more than ' + fmtN(s.Tstar) + ' tokens and it is the cheaper way to get this loss.';
    }
    drawChart(p, C, Ns, s);
  }
  render();
})();
