/* Lab for "Why doubly-stochastic mixing keeps residual streams balanced".
   Three panels: (1) a 4x4 Sinkhorn playground, (2) the 2x2 Birkhoff polytope, (3) stacked mixing layers.
   Maths is the post's own: Z = N(0,1) + 3I, E = exp(Z); free = I + N(0,1)/sqrt(s); row = row-softmax;
   doubly stochastic = 60 Sinkhorn steps; gradient G is a random 4 x 64 matrix of unit Frobenius norm. */
(function () {
  'use strict';
  var S = 4, D = 64, L = 64, SK = 60;

  /* ---------- maths ---------- */
  function rowNorm(M, n) {
    var o = M.slice(), r, c, t, k = n || S;
    for (r = 0; r < k; r++) { t = 0; for (c = 0; c < k; c++) t += M[r * k + c]; for (c = 0; c < k; c++) o[r * k + c] = M[r * k + c] / t; }
    return o;
  }
  function colNorm(M, n) {
    var o = M.slice(), r, c, t, k = n || S;
    for (c = 0; c < k; c++) { t = 0; for (r = 0; r < k; r++) t += M[r * k + c]; for (r = 0; r < k; r++) o[r * k + c] = M[r * k + c] / t; }
    return o;
  }
  function sums(M) {
    var rs = [0, 0, 0, 0], cs = [0, 0, 0, 0], r, c;
    for (r = 0; r < S; r++) for (c = 0; c < S; c++) { rs[r] += M[r * S + c]; cs[c] += M[r * S + c]; }
    return { r: rs, c: cs };
  }
  function worst(v) { var m = 0; for (var i = 0; i < v.length; i++) m = Math.max(m, Math.abs(v[i] - 1)); return m; }
  function sinkhorn(M, it) { for (var i = 0; i < it; i++) M = colNorm(rowNorm(M)); return M; }
  /* spectral norm of an n x n matrix: power iteration on M^T M */
  function specNorm(M, n) {
    var k = n || S, v = [], i, j, it, w, u, t;
    for (i = 0; i < k; i++) v.push(1 / Math.sqrt(k) + 0.01 * i);
    for (it = 0; it < 60; it++) {
      u = []; for (i = 0; i < k; i++) { t = 0; for (j = 0; j < k; j++) t += M[i * k + j] * v[j]; u.push(t); }
      w = []; for (j = 0; j < k; j++) { t = 0; for (i = 0; i < k; i++) t += M[i * k + j] * u[i]; w.push(t); }
      t = 0; for (j = 0; j < k; j++) t += w[j] * w[j]; t = Math.sqrt(t) || 1;
      for (j = 0; j < k; j++) v[j] = w[j] / t;
    }
    u = []; t = 0;
    for (i = 0; i < k; i++) { var a = 0; for (j = 0; j < k; j++) a += M[i * k + j] * v[j]; t += a * a; }
    return Math.sqrt(t);
  }
  /* long-run gradient share of each stream: stationary distribution of the row-normalised matrix */
  function stationary(M) {
    var T = rowNorm(M), p = [0.25, 0.25, 0.25, 0.25], n, i, j, q, tot;
    for (n = 0; n < 400; n++) {
      q = [0, 0, 0, 0];
      for (i = 0; i < S; i++) for (j = 0; j < S; j++) q[j] += p[i] * T[i * S + j];
      tot = q[0] + q[1] + q[2] + q[3]; for (j = 0; j < S; j++) p[j] = q[j] / tot;
    }
    return p;
  }
  /* seeded random numbers so the stacked-layer panel is reproducible */
  function rng(seed) {
    var a = seed >>> 0;
    function u() { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    function normal() { var x = 0, y = 0; while (x === 0) x = u(); y = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * y); }
    return { u: u, n: normal };
  }
  function expZ(R) {            // exp(N(0,1) + 3 I), 4x4
    var E = [], i, j;
    for (i = 0; i < S; i++) for (j = 0; j < S; j++) E.push(Math.exp(R.n() + (i === j ? 3 : 0)));
    return E;
  }
  function mixing(kind, R) {
    var M, i, j;
    if (kind === 'free') {
      M = [];
      for (i = 0; i < S; i++) for (j = 0; j < S; j++) M.push((i === j ? 1 : 0) + R.n() / Math.sqrt(S));
      return M;
    }
    M = expZ(R);
    return kind === 'row' ? rowNorm(M) : sinkhorn(M, SK);
  }
  function matmul(A, B) {
    var C = [], i, j, k, t;
    for (i = 0; i < S; i++) for (j = 0; j < S; j++) { t = 0; for (k = 0; k < S; k++) t += A[i * S + k] * B[k * S + j]; C.push(t); }
    return C;
  }
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  /* one draw: gradient norm and imbalance after l layers, l = 0..L, for one recipe */
  function chain(kind, R, C) {
    var P = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], norms = [], ratios = [], l, i, a, b, r, mx, mn, tot;
    function measure() {
      // row i of P^T G has squared norm  p_i^T C p_i,  p_i = column i of P, C = G G^T
      r = []; tot = 0;
      for (i = 0; i < S; i++) {
        var s2 = 0;
        for (a = 0; a < S; a++) for (b = 0; b < S; b++) s2 += P[a * S + i] * C[a * S + b] * P[b * S + i];
        r.push(Math.sqrt(Math.max(0, s2))); tot += s2;
      }
      mx = Math.max.apply(null, r); mn = Math.min.apply(null, r);
      norms.push(Math.sqrt(tot)); ratios.push(mx / mn);
    }
    measure();
    for (l = 1; l <= L; l++) { P = matmul(mixing(kind, R), P); measure(); }
    return { norms: norms, ratios: ratios };
  }
  function gram(R) {
    var G = [], i, k, t, tot = 0, C = [], a, b;
    for (i = 0; i < S * D; i++) { t = R.n(); G.push(t); tot += t * t; }
    tot = Math.sqrt(tot);
    for (a = 0; a < S; a++) for (b = 0; b < S; b++) {
      t = 0; for (k = 0; k < D; k++) t += G[a * D + k] * G[b * D + k]; C.push(t / (tot * tot));
    }
    return C;
  }
  var KINDS = ['free', 'row', 'ds'];
  function stackMedians(seed, draws, done) {
    var out = { free: null, row: null, ds: null }, acc = {}, d = 0, R, C, kidx;
    KINDS.forEach(function (k) { acc[k] = { n: [], r: [] }; for (var l = 0; l <= L; l++) { acc[k].n.push([]); acc[k].r.push([]); } });
    function slice() {
      var stop = Math.min(draws, d + 15), l;
      for (; d < stop; d++) {
        R = rng(seed * 1000003 + d); C = gram(R);
        for (kidx = 0; kidx < KINDS.length; kidx++) {
          var ch = chain(KINDS[kidx], rng(seed * 7919 + d * 31 + kidx), C);
          for (l = 0; l <= L; l++) { acc[KINDS[kidx]].n[l].push(ch.norms[l]); acc[KINDS[kidx]].r[l].push(ch.ratios[l]); }
        }
      }
      if (d < draws) { setTimeout(slice, 0); return; }
      KINDS.forEach(function (k) { out[k] = { n: acc[k].n.map(median), r: acc[k].r.map(median) }; });
      done(out);
    }
    slice();
  }
  var api = { rowNorm: rowNorm, colNorm: colNorm, sinkhorn: sinkhorn, specNorm: specNorm, stationary: stationary, rng: rng, stackMedians: stackMedians };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  var root = document.querySelector('.lab[data-lab="doubly-stochastic"]');
  if (!root) return;
  var body = root.querySelector('.lab-b');
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- small DOM helpers ---------- */
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function tile(label) { var d = el('div', 'ro'), b = el('b', '', '–'), s = el('span', '', label); d.appendChild(b); d.appendChild(s); return { box: d, b: b }; }
  function fmtNum(x) {
    if (!isFinite(x)) return '∞';
    var a = Math.abs(x);
    if (a === 0) return '0';
    if (a >= 1e4 || a < 1e-3) { var e = Math.floor(Math.log10(a)), m = x / Math.pow(10, e); return m.toFixed(1) + '·10' + sup(e); }
    return a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : x.toFixed(a >= 1 ? 2 : 3);
  }
  function sup(n) { var map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }; return String(n).split('').map(function (c) { return map[c] || c; }).join(''); }
  function rangeCtl(label, min, max, step, value, fmt, onInput) {
    var wrap = el('label', 'ctl ctl-range'); wrap.appendChild(el('span', 'ctl-l', label));
    var inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value; inp.setAttribute('aria-label', label);
    var out = el('output', 'ctl-o'); out.textContent = fmt(value);
    inp.addEventListener('input', function () { var v = parseFloat(inp.value); out.textContent = fmt(v); onInput(v); });
    wrap.appendChild(inp); wrap.appendChild(out);
    return { wrap: wrap, input: inp, out: out, set: function (v) { inp.value = v; out.textContent = fmt(v); } };
  }
  function tabs(label, items, onPick, start) {
    var wrap = el('div', 'tabs'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label);
    var btns = items.map(function (it, i) {
      var b = el('button', '', it.t); b.type = 'button'; b.setAttribute('aria-pressed', String(i === start));
      b.addEventListener('click', function () { btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); onPick(it.v, i); });
      wrap.appendChild(b); return b;
    });
    return wrap;
  }
  function actBtn(txt, fn) { var b = el('button', 'btn-s', txt); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* ---------- the post's seed matrices (identical to the scene) ---------- */
  var Z = [
    [3.126, -0.132, 0.640, 0.105, -0.536, 3.362, 1.304, 0.947, -0.704, -1.265, 2.377, 0.041, -2.325, -0.219, -1.246, 2.268],
    [3.346, 0.822, 0.330, -1.303, 0.905, 3.446, -0.537, 0.581, 0.365, 0.294, 3.028, 0.547, -0.736, -0.163, -0.482, 3.599],
    [3.189, -0.523, -0.413, -2.441, 1.800, 4.144, -0.325, 0.774, 0.281, -0.554, 3.978, -0.311, -0.329, -0.792, 0.455, 2.901]
  ];
  function scaled(E) { var t = 0, i; for (i = 0; i < 16; i++) t += E[i]; return E.map(function (v) { return v * S / t; }); }
  function preset(name) {
    if (name === 'rand') return scaled(expZ(rng((Math.random() * 4294967296) >>> 0)));
    if (name === 'perm') { var P = [], i, j, pm = [2, 0, 3, 1]; for (i = 0; i < S; i++) for (j = 0; j < S; j++) P.push(pm[i] === j ? 1 : 0.03); return scaled(P); }
    return scaled(Z[+name].map(Math.exp));
  }

  /* ---------- panel scaffolding ---------- */
  body.textContent = '';
  var panelTabs = tabs('Lab panel', [{ v: 0, t: '1 · Sinkhorn' }, { v: 1, t: '2 · The 2×2 polytope' }, { v: 2, t: '3 · Stacked layers' }], function (v) { show(v); }, 0);
  body.appendChild(panelTabs);
  var panels = [el('div', 'ds-panel'), el('div', 'ds-panel'), el('div', 'ds-panel')];
  panels.forEach(function (p) { p.style.gap = '14px'; body.appendChild(p); });
  function show(i) { panels.forEach(function (p, k) { p.hidden = k !== i; p.style.display = k === i ? 'grid' : 'none'; }); if (i === 2) ensureStack(); }

  /* ================= panel 1: Sinkhorn playground ================= */
  (function () {
    var P = panels[0], M = preset('0'), iters = 0, last = '';
    P.appendChild(el('p', '', 'Edit any entry (keep them positive), or load a matrix, then normalise rows and columns yourself. “Step” is one row pass followed by one column pass; the columns are always exact after it.'));
    var src = tabs('Matrix', [{ v: '0', t: 'Seed 0' }, { v: '1', t: 'Seed 1' }, { v: '2', t: 'Seed 2' }, { v: 'perm', t: 'Near-permutation' }, { v: 'rand', t: 'Random' }], function (v) { M = preset(v); iters = 0; last = 'loaded'; draw(); }, 0);
    P.appendChild(src);
    var wrap = el('div', 'ds-mxwrap'), tbl = el('table', 'ds-mx'), cells = [], rsum = [], csum = [];
    tbl.setAttribute('aria-label', 'Editable 4 by 4 matrix with row and column sums');
    var r, c;
    for (r = 0; r <= S; r++) {
      var tr = el('tr');
      for (c = 0; c <= S; c++) {
        var td = el('td');
        if (r < S && c < S) {
          var inp = el('input'); inp.type = 'number'; inp.min = '0.001'; inp.step = '0.05'; inp.setAttribute('aria-label', 'Entry row ' + (r + 1) + ', column ' + (c + 1));
          (function (rr, cc, input) {
            input.addEventListener('input', function () { var v = parseFloat(input.value); if (isFinite(v) && v > 0) { M[rr * S + cc] = v; iters = 0; last = 'edited'; draw(true); } });
          })(r, c, inp);
          td.appendChild(inp); cells.push({ td: td, inp: inp });
        } else if (r < S) { td.className = 'sum'; rsum.push(td); }
        else if (c < S) { td.className = 'sum'; csum.push(td); }
        else td.className = 'corner';
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    wrap.appendChild(tbl); P.appendChild(wrap);
    var ctl = el('div', 'controls');
    ctl.appendChild(actBtn('Rows ÷ sum', function () { M = rowNorm(M); last = 'rows'; draw(); }));
    ctl.appendChild(actBtn('Cols ÷ sum', function () { M = colNorm(M); last = 'cols'; draw(); }));
    ctl.appendChild(actBtn('Step (rows, then cols)', function () { M = colNorm(rowNorm(M)); iters++; last = 'step'; draw(); }));
    ctl.appendChild(actBtn('Run 60', function () { M = sinkhorn(M, 60); iters += 60; last = 'run'; draw(); }));
    P.appendChild(ctl);
    var out = el('div', 'lab-out'), tIt = tile('Sinkhorn steps'), tR = tile('worst row error'), tC = tile('worst column error'), tN = tile('spectral norm ‖M‖₂'), tS = tile('gradient share, max ÷ min');
    [tIt, tR, tC, tN, tS].forEach(function (t) { out.appendChild(t.box); });
    P.appendChild(out);
    var note = el('p', 'lab-note'); note.setAttribute('aria-live', 'polite'); P.appendChild(note);

    function draw(fromEdit) {
      var s = sums(M), i, v, mn, mx;
      for (i = 0; i < 16; i++) {
        v = M[i];
        cells[i].td.style.background = 'color-mix(in srgb, var(--signal) ' + Math.round(Math.min(1, v / 1.1) * 40) + '%, var(--paper))';
        if (!fromEdit && document.activeElement !== cells[i].inp) cells[i].inp.value = v.toFixed(3);
      }
      for (i = 0; i < S; i++) {
        rsum[i].textContent = s.r[i].toFixed(3); rsum[i].className = 'sum' + (Math.abs(s.r[i] - 1) < 0.005 ? ' ok' : '');
        csum[i].textContent = s.c[i].toFixed(3); csum[i].className = 'sum' + (Math.abs(s.c[i] - 1) < 0.005 ? ' ok' : '');
      }
      var er = worst(s.r), ec = worst(s.c), sh = stationary(M);
      mn = Math.min.apply(null, sh); mx = Math.max.apply(null, sh);
      tIt.b.textContent = String(iters); tR.b.textContent = fmtNum(er); tC.b.textContent = fmtNum(ec);
      tN.b.textContent = fmtNum(specNorm(M)); tS.b.textContent = (mx / mn).toFixed(2);
      var txt;
      if (er < 0.005 && ec < 0.005) txt = 'Doubly stochastic: every row and column sums to 1, the gradient share is ' + (mx / mn).toFixed(2) + '× between the best- and worst-served stream, and ‖M‖₂ ≤ 1.';
      else if (last === 'cols' || last === 'step' || last === 'run') txt = 'Columns are exact now, rows carry the leftover error. Keep stepping: the error shrinks every pass.';
      else if (last === 'rows') txt = 'Rows are exact now, columns carry the leftover error. Normalise the columns next, which disturbs the rows a little.';
      else txt = 'Raw positive matrix: rows and columns sum to different numbers, and the long-run gradient share is uneven (' + (mx / mn).toFixed(2) + '× max÷min).';
      note.textContent = txt;
    }
    draw();
  })();

  /* ================= panel 2: the 2x2 polytope ================= */
  (function () {
    var P = panels[1], a = 0.9, b = 0.8, N = 40, W = 260, cell = W / N;
    P.appendChild(el('p', '', 'A 2×2 row-stochastic matrix has rows (a, 1−a) and (b, 1−b), so it is a point (a, b) in the unit square. Column sums are a+b and 2−a−b: the matrix is doubly stochastic exactly on the diagonal a+b = 1.'));
    var svg = svgEl('svg', { viewBox: '0 0 ' + (W + 56) + ' ' + (W + 46), 'class': 'stage', role: 'img', 'aria-label': 'Unit square of 2 by 2 row-stochastic matrices coloured by spectral norm, with the doubly stochastic diagonal and the current point.' });
    svg.style.maxWidth = '420px'; svg.style.margin = '0 auto';
    var ox = 40, oy = 8;
    var i, j;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
      var aa = (i + 0.5) / N, bb = 1 - (j + 0.5) / N;
      var nrm = specNorm([aa, 1 - aa, bb, 1 - bb], 2), f = Math.max(0, Math.min(1, (nrm - 1) / (Math.SQRT2 - 1)));
      var rect = svgEl('rect', { x: ox + i * cell, y: oy + j * cell, width: cell + 0.4, height: cell + 0.4 });
      rect.style.fill = 'var(--signal)';
      rect.style.fillOpacity = String(0.9 * f);
      svg.appendChild(rect);
    }
    svg.appendChild(svgEl('rect', { x: ox, y: oy, width: W, height: W, fill: 'none', 'stroke-width': 1.6, style: 'stroke:var(--ink)' }));
    var diag = svgEl('line', { x1: ox, y1: oy, x2: ox + W, y2: oy + W, 'stroke-width': 4, 'stroke-linecap': 'round', style: 'stroke:var(--teal)' });
    svg.appendChild(diag);
    var t1 = svgEl('text', { x: ox + W * 0.70, y: oy + W * 0.48, 'font-size': 12, 'font-weight': 700, 'text-anchor': 'middle', style: 'fill:var(--teal);paint-order:stroke;stroke:var(--paper);stroke-width:4px;stroke-linejoin:round' }); t1.textContent = 'a + b = 1'; svg.appendChild(t1);
    var ta = svgEl('text', { x: ox + W / 2, y: oy + W + 24, 'font-size': 12, 'text-anchor': 'middle' }); ta.textContent = 'a  (first entry of row 1)'; svg.appendChild(ta);
    var tb = svgEl('text', { x: 12, y: oy + W / 2, 'font-size': 12, 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (oy + W / 2) + ')' }); tb.textContent = 'b  (first entry of row 2)'; svg.appendChild(tb);
    [0, 1].forEach(function (v) {
      var x = svgEl('text', { x: ox + v * W, y: oy + W + 12, 'font-size': 10, 'text-anchor': 'middle' }); x.textContent = String(v); svg.appendChild(x);
      var y = svgEl('text', { x: ox - 6, y: oy + (1 - v) * W + 4, 'font-size': 10, 'text-anchor': 'end' }); y.textContent = String(v); svg.appendChild(y);
    });
    var dot = svgEl('circle', { r: 7, 'stroke-width': 2.5, style: 'fill:var(--paper);stroke:var(--ink)' }); svg.appendChild(dot);
    P.appendChild(svg);
    function pointer(e) {
      var rc = svg.getBoundingClientRect(), sx = (W + 56) / rc.width, x = (e.clientX - rc.left) * sx, y = (e.clientY - rc.top) * sx;
      a = Math.max(0, Math.min(1, (x - ox) / W)); b = Math.max(0, Math.min(1, 1 - (y - oy) / W)); sync();
    }
    var down = false;
    svg.addEventListener('pointerdown', function (e) { down = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} pointer(e); });
    svg.addEventListener('pointermove', function (e) { if (down) pointer(e); });
    svg.addEventListener('pointerup', function () { down = false; });
    svg.style.touchAction = 'none'; svg.style.cursor = 'crosshair';

    var ctl = el('div', 'controls');
    var ca = rangeCtl('a', 0, 1, 0.01, a, function (v) { return v.toFixed(2); }, function (v) { a = v; sync(true); });
    var cb = rangeCtl('b', 0, 1, 0.01, b, function (v) { return v.toFixed(2); }, function (v) { b = v; sync(true); });
    ctl.appendChild(ca.wrap); ctl.appendChild(cb.wrap);
    ctl.appendChild(actBtn('Snap to the diagonal', function () { var s = (a + (1 - b)) / 2; a = s; b = 1 - s; sync(); }));
    ctl.appendChild(actBtn('Corner a=b=1', function () { a = 1; b = 1; sync(); }));
    P.appendChild(ctl);
    var out = el('div', 'lab-out'), tM = tile('matrix M'), tCs = tile('column sums'), tG = tile('long-run gradient share'), tN = tile('spectral norm ‖M‖₂');
    [tM, tCs, tG, tN].forEach(function (t) { out.appendChild(t.box); });
    P.appendChild(out);
    var note = el('p', 'lab-note'); note.setAttribute('aria-live', 'polite'); P.appendChild(note);
    function sync(fromSlider) {
      dot.setAttribute('cx', ox + a * W); dot.setAttribute('cy', oy + (1 - b) * W);
      if (!fromSlider) { ca.set(a); cb.set(b); }
      var cs0 = a + b, cs1 = 2 - a - b, n = specNorm([a, 1 - a, b, 1 - b], 2), ds = Math.abs(cs0 - 1) < 0.006;
      tM.b.textContent = '(' + a.toFixed(2) + ' ' + (1 - a).toFixed(2) + ' | ' + b.toFixed(2) + ' ' + (1 - b).toFixed(2) + ')';
      tM.b.style.fontSize = '.95rem';
      tCs.b.textContent = cs0.toFixed(2) + ' , ' + cs1.toFixed(2);
      var den = (1 - a) + b;
      tG.b.textContent = den < 1e-9 ? 'any (identity)' : (b / den).toFixed(2) + ' , ' + ((1 - a) / den).toFixed(2);
      tN.b.textContent = n.toFixed(3);
      note.textContent = ds ? 'On the diagonal: both columns sum to 1, so both streams receive the same share of gradient and ‖M‖₂ = 1.'
        : (Math.abs(a - 1) < 0.01 && Math.abs(b - 1) < 0.01) ? 'The corner from the post: both rows are (1, 0). Stream 1 receives the sum of the gradients, stream 2 receives nothing, and ‖M‖₂ = √2 ≈ 1.414.'
        : 'Off the diagonal the columns are unequal (' + cs0.toFixed(2) + ' vs ' + cs1.toFixed(2) + '): one stream gets more of the backward gradient than the other, and the norm is above 1.';
    }
    sync();
  })();

  /* ================= panel 3: stacked layers ================= */
  var stackReady = false, stackBusy = false, stackSeed = 1, stackData = null, metric = 'n', layers = 64;
  var sp = panels[2], spOut, spSvg, spNote, spStatus, spLayers, tiles3 = {};
  (function () {
    var P = sp;
    P.appendChild(el('p', '', 'Backpropagate a random gradient through ℓ mixing layers (no sub-layers), with the post’s three recipes for the mixing matrix. Each number is the median over 300 random chains; the slider moves the marker along the curves.'));
    var ctl = el('div', 'controls');
    spLayers = rangeCtl('layers ℓ', 1, 64, 1, 64, function (v) { return String(v); }, function (v) { layers = v; paintStack(); });
    ctl.appendChild(spLayers.wrap);
    ctl.appendChild(tabs('Curve', [{ v: 'n', t: 'Gradient norm' }, { v: 'r', t: 'Imbalance' }], function (v) { metric = v; paintStack(); }, 0));
    ctl.appendChild(actBtn('Resample', function () { stackSeed++; stackData = null; ensureStack(true); }));
    P.appendChild(ctl);
    spOut = el('div', 'lab-out ds-stack-out');
    var rowR = [];
    [['free', 'unconstrained'], ['row', 'row-stochastic'], ['ds', 'doubly stochastic']].forEach(function (k) {
      var t1 = tile('‖gradient‖ · ' + k[1]), t2 = tile('max ÷ min · ' + k[1]);
      tiles3[k[0]] = { n: t1, r: t2 }; spOut.appendChild(t1.box); rowR.push(t2.box);
    });
    rowR.forEach(function (b) { spOut.appendChild(b); });
    P.appendChild(spOut);
    spSvg = svgEl('svg', { viewBox: '0 0 640 250', 'class': 'stage', role: 'img', 'aria-label': 'Median gradient norm or imbalance against number of mixing layers for the three recipes.' });
    P.appendChild(spSvg);
    spStatus = el('p', 'lab-note', 'Open this panel to run the simulation (about half a second).'); spStatus.setAttribute('aria-live', 'polite');
    P.appendChild(spStatus);
    spNote = el('p', 'lab-note'); P.appendChild(spNote);
  })();
  function ensureStack(force) {
    if (stackBusy || (stackData && !force)) { if (stackData) paintStack(); return; }
    stackBusy = true; spStatus.textContent = 'Computing 300 chains × 64 layers × 3 recipes…';
    var started = performance.now();
    stackMedians(stackSeed, 300, function (d) {
      stackData = d; stackBusy = false; stackReady = true;
      spStatus.textContent = 'Median of 300 random chains, 4 streams, width 64 (computed in ' + Math.round(performance.now() - started) + ' ms in your browser; seed ' + stackSeed + '). The post’s figure uses a different random stream (NumPy), so digits differ; the unconstrained imbalance is the noisiest number, its median moves between about 5.6 and 7.5 from one resample to the next.';
      paintStack();
    });
  }
  var COL = { free: 'var(--warn, #b45309)', row: 'var(--accent-2, #2a7f86)', ds: 'var(--accent, #e2502f)' };
  function paintStack() {
    if (!stackData) return;
    var l = layers, k, v, W = 640, H = 250, x0 = 56, x1 = 612, y0 = 18, y1 = 208;
    KINDS.forEach(function (kk) { tiles3[kk].n.b.textContent = fmtNum(stackData[kk].n[l]); tiles3[kk].r.b.textContent = stackData[kk].r[l].toFixed(2); });
    while (spSvg.firstChild) spSvg.removeChild(spSvg.firstChild);
    var vals = []; KINDS.forEach(function (kk) { stackData[kk][metric].forEach(function (x) { vals.push(x); }); });
    var lo, hi, yOf, ticks = [];
    if (metric === 'n') {
      lo = Math.floor(Math.log10(Math.min.apply(null, vals)) - 0.2); hi = Math.ceil(Math.log10(Math.max.apply(null, vals)));
      yOf = function (x) { return y1 - (Math.log10(x) - lo) / (hi - lo) * (y1 - y0); };
      for (v = Math.ceil(lo); v <= hi; v += Math.max(1, Math.round((hi - lo) / 5))) ticks.push([v, v === 0 ? '1' : '10' + sup(v)]);
    } else {
      lo = 1; hi = Math.ceil(Math.max.apply(null, vals) * 1.05);
      yOf = function (x) { return y1 - (x - lo) / (hi - lo) * (y1 - y0); };
      for (v = 1; v <= hi; v++) ticks.push([v, String(v)]);
    }
    ticks.forEach(function (t) {
      var y = metric === 'n' ? yOf(Math.pow(10, t[0])) : yOf(t[0]);
      spSvg.appendChild(svgEl('line', { x1: x0, x2: x1, y1: y, y2: y, style: 'stroke:var(--rule)' }));
      var tx = svgEl('text', { x: x0 - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11 }); tx.textContent = t[1]; spSvg.appendChild(tx);
    });
    [0, 16, 32, 48, 64].forEach(function (n) {
      var x = x0 + n / 64 * (x1 - x0), tx = svgEl('text', { x: x, y: y1 + 18, 'text-anchor': 'middle', 'font-size': 11 }); tx.textContent = String(n); spSvg.appendChild(tx);
    });
    var lab = svgEl('text', { x: (x0 + x1) / 2, y: y1 + 38, 'text-anchor': 'middle', 'font-size': 11 }); lab.textContent = 'layers of mixing'; spSvg.appendChild(lab);
    KINDS.forEach(function (kk) {
      var d = '', n;
      for (n = 0; n <= 64; n++) d += (n ? ' L' : 'M') + (x0 + n / 64 * (x1 - x0)).toFixed(1) + ',' + Math.max(y0 - 8, Math.min(y1 + 8, yOf(stackData[kk][metric][n]))).toFixed(1);
      spSvg.appendChild(svgEl('path', { d: d, fill: 'none', 'stroke-width': 2.4, style: 'stroke:' + COL[kk] }));
      var cy = Math.max(y0 - 8, Math.min(y1 + 8, yOf(stackData[kk][metric][l])));
      spSvg.appendChild(svgEl('circle', { cx: x0 + l / 64 * (x1 - x0), cy: cy, r: 5, style: 'fill:' + COL[kk] + ';stroke:var(--ink)', 'stroke-width': 1.2 }));
    });
    spSvg.appendChild(svgEl('line', { x1: x0 + l / 64 * (x1 - x0), x2: x0 + l / 64 * (x1 - x0), y1: y0, y2: y1, 'stroke-dasharray': '4 4', style: 'stroke:var(--ink-2)' }));
    var lg = [['free', 'unconstrained'], ['row', 'row-stochastic'], ['ds', 'doubly stochastic']];
    lg.forEach(function (it, i) {
      var g = svgEl('g', {}); g.appendChild(svgEl('rect', { x: x0 + 8 + i * 150, y: 4, width: 11, height: 11, rx: 2, style: 'fill:' + COL[it[0]] }));
      var t = svgEl('text', { x: x0 + 24 + i * 150, y: 14, 'font-size': 11 }); t.textContent = it[1]; g.appendChild(t); spSvg.appendChild(g);
    });
    var n0 = stackData.free.n[l], nr = stackData.row.n[l], nd = stackData.ds.n[l];
    spNote.textContent = 'At ℓ = ' + l + ': unconstrained is ' + fmtNum(n0) + '× the starting gradient; row-stochastic is bounded (' + fmtNum(nr) + ') but leaves a ' + stackData.row.r[l].toFixed(2) + '× gap between streams; doubly stochastic is bounded (' + fmtNum(nd) + ', tending to 1/√4 = 0.5) with a gap of ' + stackData.ds.r[l].toFixed(2) + '.';
  }
  show(0);
})();
