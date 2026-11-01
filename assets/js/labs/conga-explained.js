/* Lab for "CONGA, explained": two exact demos of the maths in the post.
   1) RoPE: rotate a query and a key by their positions; the score only sees the offset s - t, and lengths never change.
   2) KromHC: two scalars (a, b) give an exact 4x4 doubly-stochastic mixing matrix M(a) (x) M(b), no Sinkhorn needed.
   All numbers are computed here from the formulas in the post; the content vectors are fixed seeded random values. */
(function () {
  'use strict';
  var root = document.querySelector('.lab[data-lab="conga-explained"]');
  if (!root) return;
  var body = root.querySelector('.lab-b');
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function sv(tag, attrs, txt) { var e = document.createElementNS(NS, tag); for (var a in attrs) e.setAttribute(a, attrs[a]); if (txt !== undefined) e.textContent = txt; return e; }
  function range(label, min, max, step, value, fmt, onInput) {
    var wrap = el('label', 'ctl ctl-range'), inp = el('input'), out = el('output', 'ctl-o');
    wrap.appendChild(el('span', 'ctl-l', label));
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value; inp.setAttribute('aria-label', label);
    out.textContent = fmt(value);
    inp.addEventListener('input', function () { var v = parseFloat(inp.value); out.textContent = fmt(v); onInput(v); });
    wrap.appendChild(inp); wrap.appendChild(out);
    return wrap;
  }
  function seg(label, options, value, onPick) {
    var wrap = el('div', 'ctl ctl-seg'), btns = [];
    wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label);
    wrap.appendChild(el('span', 'ctl-l', label));
    options.forEach(function (o) {
      var b = el('button', '', o.t); b.type = 'button'; b.setAttribute('aria-pressed', String(o.v === value));
      b.addEventListener('click', function () { btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); onPick(o.v); });
      btns.push(b); wrap.appendChild(b);
    });
    return wrap;
  }
  function ro(label) { var d = el('div', 'ro'), b = el('b', '', '–'); d.appendChild(b); d.appendChild(el('span', '', label)); return { box: d, set: function (t) { b.textContent = t; } }; }
  function sci(x) { var a = Math.abs(x); return a !== 0 && a < 0.001 ? x.toExponential(1) : x.toFixed(3); }

  /* ---------- RoPE ---------- */
  var D = 16, PAIRS = D / 2;
  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rnd = mulberry(7);
  function gauss() { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }
  var q0 = [], k0 = [], j;
  for (j = 0; j < PAIRS; j++) { q0.push([gauss(), gauss()]); k0.push([gauss(), gauss()]); }
  function rot(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; }
  function thetas(base) { var t = []; for (var i = 0; i < PAIRS; i++) t.push(Math.pow(base, -2 * i / D)); return t; }
  function score(t, s, th) { var sum = 0; for (var i = 0; i < PAIRS; i++) { var a = rot(q0[i], t * th[i]), b = rot(k0[i], s * th[i]); sum += a[0] * b[0] + a[1] * b[1]; } return sum; }
  function norm(t, th) { var sum = 0; for (var i = 0; i < PAIRS; i++) { var a = rot(q0[i], t * th[i]); sum += a[0] * a[0] + a[1] * a[1]; } return Math.sqrt(sum); }

  var rs = { t: 37, s: 34, d: 5000, base: 10000 };
  var ropePanel = el('div'), dials = [];
  var cRope = el('div', 'controls');
  cRope.appendChild(range('Query pos t', 0, 2000, 1, rs.t, function (v) { return String(v); }, function (v) { rs.t = v; drawRope(); }));
  cRope.appendChild(range('Key pos s', 0, 2000, 1, rs.s, function (v) { return String(v); }, function (v) { rs.s = v; drawRope(); }));
  cRope.appendChild(range('Shift both by', 0, 100000, 100, rs.d, function (v) { return v.toLocaleString('en-US'); }, function (v) { rs.d = v; drawRope(); }));
  cRope.appendChild(seg('Base', [{ v: 10000, t: '10,000' }, { v: 1000, t: '1,000' }, { v: 100000, t: '100,000' }], rs.base, function (v) { rs.base = v; drawRope(); }));
  ropePanel.appendChild(cRope);

  var svg = sv('svg', { 'class': 'stage', viewBox: '0 0 360 290', role: 'img', 'aria-label': 'Eight rotating pairs of a 16-dimensional query (red) and key (teal), each rotated by position times its own frequency.' });
  svg.style.marginTop = '12px';
  var R = 34, SC = 15;
  for (j = 0; j < PAIRS; j++) {
    var col = j % 4, row = Math.floor(j / 4), cx = 45 + col * 90, cy = 52 + row * 140;
    var g = sv('g', {});
    g.appendChild(sv('circle', { cx: cx, cy: cy, r: R, fill: 'var(--paper-2)', stroke: 'var(--ink)', 'stroke-width': 1.4 }));
    g.appendChild(sv('path', { d: 'M' + (cx - R) + ' ' + cy + 'H' + (cx + R) + 'M' + cx + ' ' + (cy - R) + 'V' + (cy + R), stroke: 'var(--rule)', 'stroke-width': 1 }));
    var qa = sv('line', { x1: cx, y1: cy, stroke: 'var(--signal)', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    var ka = sv('line', { x1: cx, y1: cy, stroke: 'var(--teal)', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    var qd = sv('circle', { r: 3, fill: 'var(--signal)' }), kd = sv('circle', { r: 3, fill: 'var(--teal)' });
    var t1 = sv('text', { x: cx, y: cy + R + 17, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700 }, 'pair ' + j);
    var t2 = sv('text', { x: cx, y: cy + R + 31, 'text-anchor': 'middle', 'font-size': 10 }, '');
    var t3 = sv('text', { x: cx, y: cy + R + 45, 'text-anchor': 'middle', 'font-size': 10 }, '');
    [qa, ka, qd, kd, t1, t2, t3].forEach(function (n) { g.appendChild(n); });
    svg.appendChild(g);
    dials.push({ qa: qa, ka: ka, qd: qd, kd: kd, t2: t2, t3: t3, cx: cx, cy: cy });
  }
  ropePanel.appendChild(svg);
  var outs = el('div', 'lab-out'); outs.style.marginTop = '12px';
  var oScore = ro('score(t, s)'), oShift = ro('score(t+shift, s+shift)'), oDiff = ro('difference'), oNorm = ro('|q| at t  vs  at 0'), oOff = ro('offset s − t');
  [oScore, oShift, oDiff, oNorm, oOff].forEach(function (o) { outs.appendChild(o.box); });
  ropePanel.appendChild(outs);
  var ropeNote = el('p', 'lab-note'); ropeNote.setAttribute('aria-live', 'polite'); ropePanel.appendChild(ropeNote);

  function drawRope() {
    var th = thetas(rs.base), i;
    for (i = 0; i < PAIRS; i++) {
      var d = dials[i], a = rot(q0[i], rs.t * th[i]), b = rot(k0[i], rs.s * th[i]);
      d.qa.setAttribute('x2', d.cx + a[0] * SC); d.qa.setAttribute('y2', d.cy - a[1] * SC);
      d.ka.setAttribute('x2', d.cx + b[0] * SC); d.ka.setAttribute('y2', d.cy - b[1] * SC);
      d.qd.setAttribute('cx', d.cx + a[0] * SC); d.qd.setAttribute('cy', d.cy - a[1] * SC);
      d.kd.setAttribute('cx', d.cx + b[0] * SC); d.kd.setAttribute('cy', d.cy - b[1] * SC);
      d.t2.textContent = 'θ = ' + (th[i] >= 0.01 ? th[i].toFixed(3) : th[i].toExponential(1));
      var per = 2 * Math.PI / th[i];
      d.t3.textContent = 'turns every ' + (per < 1000 ? per.toFixed(per < 10 ? 1 : 0) : per >= 1e6 ? (per / 1e6).toFixed(1) + 'M' : (per / 1000).toFixed(per < 1e4 ? 1 : 0) + 'k');
    }
    var s0 = score(rs.t, rs.s, th), s1 = score(rs.t + rs.d, rs.s + rs.d, th), n0 = norm(0, th), n1 = norm(rs.t, th);
    oScore.set(s0.toFixed(6)); oShift.set(s1.toFixed(6)); oDiff.set(sci(Math.abs(s1 - s0)));
    oNorm.set(n1.toFixed(6) + ' vs ' + n0.toFixed(6)); oOff.set(String(rs.s - rs.t));
    ropeNote.textContent = (rs.d === 0 ? 'Set a shift above to move both tokens by the same distance. ' : 'Both positions moved by ' + rs.d.toLocaleString('en-US') + ' and the score is unchanged up to rounding. ') +
      'The fast pairs (small j) spin many times over this range; the slow ones barely move. A smaller base makes every pair faster, a larger one slows them.';
  }

  /* ---------- KromHC ---------- */
  var hs = { a: 0.8, b: 0.35, inp: 0 };
  var PRESETS = [[1, 1, 1, 1], [4, 0, 0, 0], [3, 1, 0, 2]];
  var hPanel = el('div');
  var cH = el('div', 'controls');
  cH.appendChild(range('a', 0, 1, 0.01, hs.a, function (v) { return v.toFixed(2); }, function (v) { hs.a = v; drawH(); }));
  cH.appendChild(range('b', 0, 1, 0.01, hs.b, function (v) { return v.toFixed(2); }, function (v) { hs.b = v; drawH(); }));
  cH.appendChild(seg('Streams in', [{ v: 0, t: 'Equal' }, { v: 1, t: 'One hot' }, { v: 2, t: 'Mixed' }], 0, function (v) { hs.inp = v; drawH(); }));
  hPanel.appendChild(cH);
  var hsvg = sv('svg', { 'class': 'stage', viewBox: '0 0 320 270', role: 'img', 'aria-label': 'The 4 by 4 mixing matrix built as a Kronecker product of two 2 by 2 matrices, with row and column sums.' });
  hsvg.style.marginTop = '12px';
  var cells = [], rowT = [], colT = [], r, c;
  for (r = 0; r < 4; r++) for (c = 0; c < 4; c++) {
    var rect = sv('rect', { x: 20 + c * 62, y: 24 + r * 52, width: 58, height: 48, rx: 4, fill: 'var(--signal)', stroke: 'var(--ink)', 'stroke-width': 1.4 });
    var tx = sv('text', { x: 20 + c * 62 + 29, y: 24 + r * 52 + 29, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700 }, '');
    hsvg.appendChild(rect); hsvg.appendChild(tx); cells.push({ rect: rect, tx: tx });
  }
  for (r = 0; r < 4; r++) { var rt = sv('text', { x: 20 + 4 * 62 + 4, y: 24 + r * 52 + 29, 'font-size': 10 }, ''); hsvg.appendChild(rt); rowT.push(rt); }
  for (c = 0; c < 4; c++) { var ct = sv('text', { x: 20 + c * 62 + 29, y: 24 + 4 * 52 + 14, 'text-anchor': 'middle', 'font-size': 10 }, ''); hsvg.appendChild(ct); colT.push(ct); }
  hsvg.appendChild(sv('text', { x: 20, y: 14, 'font-size': 10, 'font-weight': 700 }, 'H = M(a) ⊗ M(b)   rows = outputs'));
  hPanel.appendChild(hsvg);
  var hOuts = el('div', 'lab-out'); hOuts.style.marginTop = '12px';
  var oIn = ro('streams in'), oOut = ro('streams out'), oSumIn = ro('Σ in'), oSumOut = ro('Σ out'), oSums = ro('row / col sums');
  [oIn, oOut, oSumIn, oSumOut, oSums].forEach(function (o) { hOuts.appendChild(o.box); });
  hPanel.appendChild(hOuts);
  var hNote = el('p', 'lab-note'); hNote.textContent = 'M(x) = [[x, 1−x], [1−x, x]]. Every row and column of the Kronecker product sums to 1, so mixing moves mass between streams but never creates or removes it. Try a = 0.8, b = 0.35 to get the matrix printed in the post.';
  hPanel.appendChild(hNote);

  function fmtVec(v) { return '[' + v.map(function (x) { return +x.toFixed(2); }).join(', ') + ']'; }
  function drawH() {
    var M1 = [[hs.a, 1 - hs.a], [1 - hs.a, hs.a]], M2 = [[hs.b, 1 - hs.b], [1 - hs.b, hs.b]], H = [], i, k;
    for (i = 0; i < 4; i++) { H.push([]); for (k = 0; k < 4; k++) H[i].push(M1[i >> 1][k >> 1] * M2[i & 1][k & 1]); }
    var rs4 = [0, 0, 0, 0], cs4 = [0, 0, 0, 0];
    for (i = 0; i < 4; i++) for (k = 0; k < 4; k++) {
      var v = H[i][k], cell = cells[i * 4 + k];
      cell.tx.textContent = v.toFixed(2); cell.rect.setAttribute('fill-opacity', (0.06 + 0.62 * v).toFixed(3));
      rs4[i] += v; cs4[k] += v;
    }
    for (i = 0; i < 4; i++) { rowT[i].textContent = 'Σ ' + rs4[i].toFixed(2); colT[i].textContent = 'Σ ' + cs4[i].toFixed(2); }
    var x = PRESETS[hs.inp], y = [0, 0, 0, 0], sin = 0, sout = 0;
    for (i = 0; i < 4; i++) { for (k = 0; k < 4; k++) y[i] += H[i][k] * x[k]; sin += x[i]; sout += y[i]; }
    oIn.set(fmtVec(x)); oOut.set(fmtVec(y)); oSumIn.set(sin.toFixed(2)); oSumOut.set(sout.toFixed(2));
    var ok = rs4.concat(cs4).every(function (z) { return Math.abs(z - 1) < 1e-9; });
    oSums.set(ok ? 'all = 1' : 'not 1');
  }

  /* ---------- assemble ---------- */
  body.textContent = '';
  var intro = el('p', '', 'Two pieces of the model you can poke. Everything here is the formulas above evaluated live, nothing is trained.');
  var tabs = el('div', 'tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Choose a demo');
  var bR = el('button', '', 'RoPE rotation'), bH = el('button', '', 'KromHC mixing');
  [bR, bH].forEach(function (b) { b.type = 'button'; tabs.appendChild(b); });
  function show(which) {
    bR.setAttribute('aria-pressed', String(which === 0)); bH.setAttribute('aria-pressed', String(which === 1));
    ropePanel.hidden = which !== 0; hPanel.hidden = which !== 1;
  }
  bR.addEventListener('click', function () { show(0); }); bH.addEventListener('click', function () { show(1); });
  body.appendChild(intro); body.appendChild(tabs); body.appendChild(ropePanel); body.appendChild(hPanel);
  show(0); drawRope(); drawH();
})();
