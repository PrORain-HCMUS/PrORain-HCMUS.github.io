/* Lab for "Speculative decoding": pick a target p and a draft q over four tokens, choose the draft length γ,
   and run rounds of the real algorithm (draft γ tokens, verify with min(1, p/q), resample the first rejection
   from the residual, add a bonus token after a clean sweep). Everything shown is computed here, no tuned numbers:
   α = Σ min(p, q) = 1 − TV, E[τ] = (1 − α^(γ+1)) / (1 − α), ceiling 1/TV, KL(p‖q), and the measured values. */
(function () {
  'use strict';
  var root = document.querySelector('.lab[data-lab="speculative-decoding"]');
  if (!root) return;
  var body = root.querySelector('.lab-b');
  if (!body) return;

  var TOK = ['A', 'B', 'C', 'D'];
  var PRESETS = [
    { id: 'post', name: 'Post example', p: [10, 6, 3, 1], q: [8, 8, 2, 2], note: 'The numbers used in the text: α = 0.85, TV = 0.15.' },
    { id: 'over', name: 'Overconfident draft', p: [8, 6, 4, 2], q: [17, 1, 1, 1], note: 'The draft puts 85% on A while the target gives it 40%.' },
    { id: 'miss', name: 'Draft misses tokens', p: [10, 6, 3, 1], q: [12, 8, 0, 0], note: 'q gives C and D zero mass: KL(p‖q) is infinite, yet TV is only 0.20, so α is still 0.80.' },
    { id: 'uni', name: 'Uniform draft', p: [10, 6, 3, 1], q: [5, 5, 5, 5], note: 'A know-nothing drafter: α = 0.70.' },
    { id: 'perf', name: 'Perfect draft', p: [10, 6, 3, 1], q: [10, 6, 3, 1], note: 'q = p, so every draft is accepted and each round yields γ + 1 tokens.' }
  ];

  var st = { p: PRESETS[0].p.slice(), q: PRESETS[0].q.slice(), gamma: 4, preset: 'post' };
  var stats, lastRound = null;
  function resetStats() { stats = { rounds: 0, tokens: 0, examined: 0, accepted: 0, emit: [0, 0, 0, 0], emitN: 0 }; lastRound = null; }
  resetStats();

  function norm(w) {
    var s = w[0] + w[1] + w[2] + w[3];
    if (s <= 0) return [0.25, 0.25, 0.25, 0.25];
    return w.map(function (x) { return x / s; });
  }
  function sample(d) {
    var u = Math.random(), c = 0, i;
    for (i = 0; i < d.length; i++) { c += d[i]; if (u < c) return i; }
    return d.length - 1;
  }
  function math() {
    var p = norm(st.p), q = norm(st.q), a = 0, kl = 0, i;
    for (i = 0; i < 4; i++) {
      a += Math.min(p[i], q[i]);
      if (p[i] > 0) kl += q[i] > 0 ? p[i] * Math.log(p[i] / q[i]) : Infinity;
    }
    var tv = 1 - a, g = st.gamma;
    var et = tv < 1e-9 ? g + 1 : (1 - Math.pow(a, g + 1)) / (1 - a);
    return { p: p, q: q, alpha: a, tv: tv, kl: kl, et: et, ceil: tv < 1e-9 ? Infinity : 1 / tv };
  }

  /* one real round: the draft proposes γ tokens, the target verifies them left to right */
  function round() {
    var m = math(), g = st.gamma, drafts = [], i, res = { drafts: [], acc: 0, rejected: -1, repl: -1, bonus: -1, out: [] };
    for (i = 0; i < g; i++) drafts.push(sample(m.q));
    res.drafts = drafts;
    for (i = 0; i < g; i++) {
      var x = drafts[i], a = m.q[x] > 0 ? Math.min(1, m.p[x] / m.q[x]) : 1;
      stats.examined++;
      if (Math.random() < a) { res.acc++; stats.accepted++; res.out.push(x); }
      else {
        var r = m.p.map(function (pv, j) { return Math.max(pv - m.q[j], 0); }), z = r[0] + r[1] + r[2] + r[3];
        var y = z > 1e-12 ? sample(r.map(function (v) { return v / z; })) : sample(m.p);
        res.rejected = i; res.repl = y; res.out.push(y); break;
      }
    }
    if (res.rejected < 0) { res.bonus = sample(m.p); res.out.push(res.bonus); }
    stats.rounds++; stats.tokens += res.out.length;
    res.out.forEach(function (t) { stats.emit[t]++; stats.emitN++; });
    lastRound = res;
  }

  /* ---------- tiny DOM helpers (text only, nothing is parsed as HTML) ---------- */
  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, txt) {
    var e = document.createElementNS(NS, tag), k;
    for (k in attrs) e.setAttribute(k, attrs[k]);
    if (txt !== undefined) e.textContent = txt; return e;
  }

  /* ---------- build the UI ---------- */
  body.textContent = '';
  var intro = h('p', '', 'Pick a draft q and a target p over four tokens, set the draft length γ, then run the real algorithm. The tiles are computed live; the dots on the bars are the measured frequencies of what the target actually emitted.');
  body.appendChild(intro);

  var tabs = h('div', 'tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Example distributions');
  PRESETS.forEach(function (pr) {
    var b = h('button', '', pr.name); b.type = 'button'; b.dataset.id = pr.id; b.setAttribute('aria-pressed', String(pr.id === st.preset));
    b.addEventListener('click', function () { st.p = pr.p.slice(); st.q = pr.q.slice(); st.preset = pr.id; resetStats(); syncSliders(); render(); });
    tabs.appendChild(b);
  });
  body.appendChild(tabs);

  var grid = h('div', 'sd-grid');
  var sliders = { p: [], q: [] };
  function column(key, title) {
    var col = h('div', 'sd-col'); col.appendChild(h('div', 'sd-h', title));
    TOK.forEach(function (t, i) {
      var row = h('label', 'ctl ctl-range'); row.appendChild(h('span', 'ctl-l', t));
      var inp = h('input'); inp.type = 'range'; inp.min = 0; inp.max = 20; inp.step = 1; inp.value = st[key][i];
      inp.setAttribute('aria-label', (key === 'p' ? 'Target' : 'Draft') + ' weight of token ' + t);
      var out = h('output', 'ctl-o', '');
      inp.addEventListener('input', function () { st[key][i] = parseInt(inp.value, 10); st.preset = ''; resetStats(); markPreset(); render(); });
      row.appendChild(inp); row.appendChild(out); col.appendChild(row); sliders[key].push({ inp: inp, out: out });
    });
    return col;
  }
  grid.appendChild(column('p', 'TARGET p (the big model)'));
  grid.appendChild(column('q', 'DRAFT q (the small model)'));
  body.appendChild(grid);

  var gRow = h('div', 'controls');
  var gw = h('label', 'ctl ctl-range'); gw.appendChild(h('span', 'ctl-l', 'γ draft length'));
  var gi = h('input'); gi.type = 'range'; gi.min = 1; gi.max = 10; gi.step = 1; gi.value = st.gamma; gi.setAttribute('aria-label', 'Draft length gamma');
  var go = h('output', 'ctl-o', String(st.gamma));
  gi.addEventListener('input', function () { st.gamma = parseInt(gi.value, 10); go.textContent = st.gamma; resetStats(); render(); });
  gw.appendChild(gi); gw.appendChild(go); gRow.appendChild(gw);
  [['Run 1 round', 1], ['Run 100', 100], ['Run 5,000', 5000]].forEach(function (b) {
    var btn = h('button', 'btn-s', b[0]); btn.type = 'button';
    btn.addEventListener('click', function () { var n = b[1]; while (n--) round(); render(); });
    gRow.appendChild(btn);
  });
  var rst = h('button', 'btn-s', 'Reset'); rst.type = 'button'; rst.addEventListener('click', function () { resetStats(); render(); }); gRow.appendChild(rst);
  body.appendChild(gRow);

  var svg = s('svg', { 'class': 'stage', viewBox: '0 0 640 230', role: 'img', 'aria-label': 'Bars of the target distribution p and the draft distribution q for tokens A to D, with the shared part highlighted and dots for measured emitted frequencies.' });
  body.appendChild(svg);

  var out = h('div', 'lab-out'); body.appendChild(out);
  var traceBox = h('div', 'sd-trace'); traceBox.setAttribute('aria-live', 'polite'); body.appendChild(traceBox);
  var note = h('p', 'lab-note'); body.appendChild(note);

  var style = h('style', '', '.lab .sd-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px}.lab .sd-h{font:700 .66rem var(--label);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);margin-bottom:4px}.lab .sd-col .ctl{justify-content:space-between}.lab .sd-col .ctl input{flex:1;width:auto}.lab .sd-trace{min-height:3.2rem;font:500 .85rem/1.9 var(--label)}.lab .sd-trace .lbl{font:700 .66rem var(--label);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2);margin-right:8px}.lab .tok.gone{opacity:.4;text-decoration:line-through}.lab .tab-note{margin:0}@media(max-width:640px){.lab .sd-grid{grid-template-columns:1fr}}');
  root.insertBefore(style, root.firstChild);

  function syncSliders() {
    ['p', 'q'].forEach(function (key) { sliders[key].forEach(function (o, i) { o.inp.value = st[key][i]; }); });
  }
  function markPreset() {
    Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === st.preset)); });
  }
  function fmt(x, d) { return x === Infinity ? '∞' : x.toFixed(d === undefined ? 2 : d); }

  function tile(val, lab) { var d = h('div', 'ro'); d.appendChild(h('b', '', val)); d.appendChild(h('span', '', lab)); return d; }

  function render() {
    var m = math(), i;
    ['p', 'q'].forEach(function (key) {
      var d = key === 'p' ? m.p : m.q;
      sliders[key].forEach(function (o, j) { o.out.textContent = Math.round(d[j] * 100) + '%'; });
    });
    go.textContent = st.gamma;
    markPreset();

    /* bars: shared part teal, p-excess amber, q-excess paper-2, dots = measured emitted frequency */
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var base = 190, H = 150, gx = 40, gw2 = 148, bw = 50;
    svg.appendChild(s('line', { x1: 20, x2: 620, y1: base, y2: base, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
    for (i = 0; i < 4; i++) {
      var x0 = gx + i * (gw2 + 2), px = x0 + 14, qx = px + bw + 8;
      var ov = Math.min(m.p[i], m.q[i]), hp = m.p[i] * H, hq = m.q[i] * H, ho = ov * H;
      [[px, hp, 'var(--amber)'], [qx, hq, 'var(--paper-2)']].forEach(function (b) {
        if (b[1] > 0.4) svg.appendChild(s('rect', { x: b[0], y: base - b[1], width: bw, height: b[1], fill: b[2], stroke: 'var(--ink)', 'stroke-width': 1.5 }));
      });
      if (ho > 0.4) { /* the shared part is always teal on both bars */
        svg.appendChild(s('rect', { x: px, y: base - ho, width: bw, height: ho, fill: 'var(--teal)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
        svg.appendChild(s('rect', { x: qx, y: base - ho, width: bw, height: ho, fill: 'var(--teal)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
      }
      svg.appendChild(s('text', { x: px + bw / 2, y: base - hp - 6, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700 }, fmt(m.p[i])));
      svg.appendChild(s('text', { x: qx + bw / 2, y: base - hq - 6, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700 }, fmt(m.q[i])));
      svg.appendChild(s('text', { x: px + bw / 2, y: base + 16, 'text-anchor': 'middle', 'font-size': 11 }, 'p'));
      svg.appendChild(s('text', { x: qx + bw / 2, y: base + 16, 'text-anchor': 'middle', 'font-size': 11 }, 'q'));
      svg.appendChild(s('text', { x: x0 + 14 + bw + 4, y: base + 36, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700 }, 'token ' + TOK[i]));
      if (stats.emitN > 0) {
        var f = stats.emit[i] / stats.emitN, y = base - f * H;
        svg.appendChild(s('line', { x1: px - 4, x2: px + bw + 4, y1: y, y2: y, stroke: 'var(--signal)', 'stroke-width': 2.5, 'stroke-dasharray': '5 3' }));
        svg.appendChild(s('circle', { cx: px + bw / 2, cy: y, r: 4.5, fill: 'var(--signal)', stroke: 'var(--ink)', 'stroke-width': 1.2 }));
      }
    }
    svg.appendChild(s('text', { x: 620, y: 26, 'text-anchor': 'end', 'font-size': 11 }, 'teal = shared mass = α'));
    svg.appendChild(s('text', { x: 620, y: 42, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--signal)' }, '● measured emitted frequency'));

    /* tiles */
    while (out.firstChild) out.removeChild(out.firstChild);
    var measTau = stats.rounds ? stats.tokens / stats.rounds : null, measA = stats.examined ? stats.accepted / stats.examined : null;
    out.appendChild(tile(fmt(m.alpha, 3), 'α = Σ min(p,q) = 1 − TV'));
    out.appendChild(tile(fmt(m.tv, 3), 'TV(p, q)'));
    out.appendChild(tile(fmt(m.kl, 3), 'KL(p ‖ q), nats'));
    out.appendChild(tile(fmt(m.et, 2), 'E[τ] tokens/round, theory'));
    out.appendChild(tile(measTau === null ? '–' : fmt(measTau, 2), 'measured over ' + stats.rounds.toLocaleString('en-US') + ' rounds'));
    out.appendChild(tile(measA === null ? '–' : fmt(measA, 3), 'measured acceptance rate'));
    out.appendChild(tile(fmt(m.ceil, 2), 'ceiling 1/TV (any γ)'));

    /* last round */
    while (traceBox.firstChild) traceBox.removeChild(traceBox.firstChild);
    if (!lastRound) traceBox.appendChild(h('span', 'lbl', 'press “Run 1 round” to see a round'));
    else {
      var r = lastRound, line1 = h('div'), line2 = h('div');
      line1.appendChild(h('span', 'lbl', 'drafted'));
      r.drafts.forEach(function (x, j) {
        var cls = 'tok'; if (r.rejected >= 0) { if (j < r.rejected) cls += ' ok'; else if (j === r.rejected) cls += ' bad'; else cls += ' gone'; } else cls += ' ok';
        var chip = h('span', cls, TOK[x]); chip.title = j < r.acc ? 'accepted' : (j === r.rejected ? 'rejected' : 'discarded'); line1.appendChild(chip);
      });
      line2.appendChild(h('span', 'lbl', 'emitted'));
      r.out.forEach(function (x, j) {
        var chip = h('span', 'tok ' + (j < r.acc ? 'ok' : 'hot'), TOK[x]); line2.appendChild(chip);
      });
      line2.appendChild(h('span', '', r.rejected >= 0 ? ' · ' + r.acc + ' accepted, then ' + TOK[r.repl] + ' drawn from the residual' : ' · all ' + st.gamma + ' accepted, bonus token ' + TOK[r.bonus] + ' from p'));
      traceBox.appendChild(line1); traceBox.appendChild(line2);
    }

    /* one clear takeaway */
    var pr = null;
    PRESETS.forEach(function (x) { if (x.id === st.preset) pr = x; });
    var msg = (pr ? pr.note + ' ' : '') + 'With γ = ' + st.gamma + ' the closed form gives ' + fmt(m.et, 2) + ' tokens per round';
    if (stats.rounds >= 100) msg += '; measured ' + fmt(measTau, 2) + ' over ' + stats.rounds.toLocaleString('en-US') + ' rounds';
    msg += '. The dots on the p bars track p, because the output distribution is exactly p however bad q is.';
    note.textContent = msg;
  }

  syncSliders(); render();
})();
