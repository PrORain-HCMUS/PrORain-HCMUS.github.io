/* Lab for "Idempotency keys: making retries safe".
   Part 1 simulates the post's retry model (a reply is lost with probability p, the client retries up to N attempts)
   and compares it with the closed form (1 - p^N) / (1 - p). Part 2 is a port of the FastAPI claim() logic. */
(function () {
  'use strict';
  var root = document.querySelector('.lab[data-lab="idempotency"]');
  if (!root) return;
  var body = root.querySelector('.lab-b');
  if (!body) return;
  var statics = Array.prototype.slice.call(body.children);   // progressive enhancement: shown until the lab has built

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  /* ---------- controls factory (same markup as the scene-kit strip) ---------- */
  function range(label, min, max, step, value, format, onInput) {
    var w = el('label', 'ctl ctl-range'); w.appendChild(el('span', 'ctl-l', label));
    var i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value; i.setAttribute('aria-label', label);
    var o = el('output', 'ctl-o', format(value));
    i.addEventListener('input', function () { o.textContent = format(parseFloat(i.value)); onInput(parseFloat(i.value)); });
    w.appendChild(i); w.appendChild(o); return w;
  }
  function seg(label, options, value, onPick) {
    var w = el('div', 'ctl ctl-seg'); w.setAttribute('role', 'group'); w.setAttribute('aria-label', label);
    w.appendChild(el('span', 'ctl-l', label));
    var btns = options.map(function (o) {
      var b = el('button', '', o.t); b.type = 'button'; b.setAttribute('aria-pressed', String(o.v === value));
      b.addEventListener('click', function () { btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); onPick(o.v); });
      w.appendChild(b); return b;
    });
    return w;
  }
  function tile(label) {
    var t = el('div', 'ro'), b = el('b', '', '–'), l = el('span', '', label); t.appendChild(b); t.appendChild(l); t.val = b; t.lab = l; return t;
  }

  /* ================= Part 1: retry storm ================= */
  body.appendChild(el('h4', 'lab-sub', '1 · Retry storm'));
  body.appendChild(el('p', 'lab-note', 'The post’s model: every attempt reaches the server and is processed, but its reply is lost with probability p. The client retries until it sees an answer or has made N attempts. Each square below is one payment.'));

  var P = { p: 5, n: 3, key: false, run: 0 };
  var controls = el('div', 'controls');
  controls.appendChild(range('Loss p', 0, 30, 0.5, P.p, function (v) { return v + '%'; }, function (v) { P.p = v; simulate(); }));
  controls.appendChild(range('Attempts N', 1, 5, 1, P.n, function (v) { return v; }, function (v) { P.n = v; simulate(); }));
  controls.appendChild(seg('Header', [{ v: false, t: 'No key' }, { v: true, t: 'Idempotency-Key' }], P.key, function (v) { P.key = v; simulate(); }));
  var go = el('button', 'btn-s', 'Send 1,000 payments'); go.type = 'button';
  go.addEventListener('click', function () { P.run++; simulate(); });
  var goW = el('div', 'ctl ctl-act'); goW.appendChild(go); controls.appendChild(goW);
  body.appendChild(controls);

  var cv = el('canvas'); cv.width = 1000; cv.height = 400;
  cv.setAttribute('role', 'img');
  body.appendChild(cv);
  var legend = el('div', 'lab-note');
  body.appendChild(legend);

  var out = el('div', 'lab-out');
  var tCharges = tile('charges executed (run)'), tDup = tile('duplicate charges (run)'), tExp = tile('duplicates (formula)'),
      tHits = tile('store replays (run)'), tRate = tile('store hit rate'), tUnsure = tile('client gave up unsure');
  [tCharges, tDup, tExp, tHits, tRate, tUnsure].forEach(function (t) { out.appendChild(t); });
  body.appendChild(out);
  var take1 = el('p', 'lab-note'); body.appendChild(take1);

  function rng(seed) { // mulberry32
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var cells = [];
  function simulate() {
    var p = P.p / 100, N = P.n, rand = rng(20261101 + P.run * 7919);
    var charges = 0, dups = 0, hits = 0, reached = 0, unsure = 0;
    cells = [];
    for (var i = 0; i < 1000; i++) {
      var attempts = 0, gotAnswer = false;
      while (attempts < N && !gotAnswer) { attempts++; if (rand() >= p) gotAnswer = true; }
      reached += attempts;
      var c;
      if (P.key) { charges += 1; hits += attempts - 1; c = { dup: false, replay: attempts > 1 }; }
      else { charges += attempts; dups += attempts - 1; c = { dup: attempts > 1, replay: false }; }
      c.unsure = !gotAnswer; if (c.unsure) unsure++;
      cells.push(c);
    }
    var eA = p === 1 ? N : (1 - Math.pow(p, N)) / (1 - p);        // expected attempts per payment
    var expDup = 1000 * (eA - 1), expRate = (eA - 1) / eA;
    tCharges.val.textContent = fmt(charges);
    tDup.val.textContent = fmt(dups);
    tExp.val.textContent = P.key ? '0' : expDup.toFixed(1);
    tHits.val.textContent = P.key ? fmt(hits) : '–';
    tRate.val.textContent = P.key ? (reached ? (100 * hits / reached).toFixed(1) : '0.0') + '%' : '–';
    tRate.lab.textContent = P.key ? 'store hit rate (formula ' + (100 * expRate).toFixed(1) + '%)' : 'store hit rate';
    tUnsure.val.textContent = fmt(unsure);
    tUnsure.lab.textContent = 'client gave up unsure (formula ' + (1000 * Math.pow(p, N)).toFixed(1) + ')';
    legend.textContent = P.key
      ? 'Teal: answered on the first try. Amber: retried and replayed from the store, charged once. Dot: every reply was lost, the client gave up unsure. Duplicate charges are zero by construction.'
      : 'Teal: charged once. Red: charged more than once. Dot: every reply was lost, the client gave up unsure (and was still charged N times).';
    take1.textContent = P.key
      ? 'With the key, the 1,000 payments cost exactly 1,000 charges. The retries did not vanish: they became ' + fmt(hits) + ' cheap replays from the key store.'
      : 'Without a key, ' + fmt(dups) + ' of these 1,000 payments were charged again (the formula says ' + expDup.toFixed(1) + ' on average). At p = 1% and N = 3 that is the post’s 10,100 per million.';
    cv.setAttribute('aria-label', 'Grid of 1000 payments. ' + (P.key ? fmt(hits) + ' were replayed from the key store' : fmt(dups) + ' were charged more than once') + '.');
    draw();
  }
  function draw() {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    var teal = css('--teal'), amber = css('--amber'), signal = css('--signal'), ink = css('--ink'), paper = css('--paper');
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
    var cols = 50, cw = 20, g = 3;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], x = (i % cols) * cw + g / 2, y = Math.floor(i / cols) * cw + g / 2;
      ctx.fillStyle = c.dup ? signal : (c.replay ? amber : teal);
      ctx.fillRect(x, y, cw - g, cw - g);
      if (c.unsure) { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x + (cw - g) / 2, y + (cw - g) / 2, 3.2, 0, 6.2832); ctx.fill(); }
    }
  }

  /* ================= Part 2: four cases ================= */
  body.appendChild(el('h4', 'lab-sub', '2 · One request, four cases'));
  body.appendChild(el('p', 'lab-note', 'Pick a situation, then step through it. The claim logic is a straight port of the FastAPI store in this post, so you can edit the key or the amount and watch the outcome change.'));

  function fnv(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
  function fingerprint(amount) { return fnv('{"amount":' + amount + ',"currency":"EUR","customer_id":"c_42"}'); }

  var CASES = [
    { id: 'new', t: 'New key', amount: 1000, store: [] },
    { id: 'replay', t: 'Seen, finished', amount: 1000, store: [{ key: 'k-7f3a', fp: fingerprint(1000), done: true, resp: '201 pay_8c1d' }] },
    { id: 'run', t: 'Seen, running', amount: 1000, store: [{ key: 'k-7f3a', fp: fingerprint(1000), done: false, resp: '' }] },
    { id: 'diff', t: 'Seen, different body', amount: 999, store: [{ key: 'k-7f3a', fp: fingerprint(1000), done: true, resp: '201 pay_8c1d' }] }
  ];
  var S = { cur: 0, step: 2, key: 'k-7f3a', amount: 1000 };

  var tabs = el('div', 'tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Situation');
  var tabBtns = CASES.map(function (c, i) {
    var b = el('button', '', c.t); b.type = 'button'; b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', function () { pick(i); }); tabs.appendChild(b); return b;
  });
  body.appendChild(tabs);

  var form = el('div', 'controls');
  var keyW = el('label', 'ctl'); keyW.appendChild(el('span', 'ctl-l', 'Idempotency-Key'));
  var keyIn = el('input'); keyIn.type = 'text'; keyIn.value = S.key; keyIn.maxLength = 20; keyIn.size = 9; keyIn.setAttribute('aria-label', 'Idempotency-Key header');
  keyW.appendChild(keyIn); form.appendChild(keyW);
  var amW = el('label', 'ctl'); amW.appendChild(el('span', 'ctl-l', 'amount'));
  var amIn = el('input'); amIn.type = 'number'; amIn.value = S.amount; amIn.min = 1; amIn.max = 99999; amIn.setAttribute('aria-label', 'Payment amount');
  amW.appendChild(amIn); form.appendChild(amW);
  var stepW = el('div', 'ctl ctl-seg'); stepW.appendChild(el('span', 'ctl-l', 'Step'));
  var back = el('button', '', '◀ Back'), next = el('button', '', 'Next ▶'), stepL = el('output', 'ctl-o', '');
  back.type = 'button'; next.type = 'button';
  stepW.appendChild(back); stepW.appendChild(stepL); stepW.appendChild(next); form.appendChild(stepW);
  body.appendChild(form);

  var board = el('div', 'idem-board'); body.appendChild(board);
  var colReq = el('div', 'idem-col'), colClaim = el('div', 'idem-col'), colRes = el('div', 'idem-col');
  board.appendChild(colReq); board.appendChild(colClaim); board.appendChild(colRes);
  var take2 = el('p', 'lab-note'); take2.setAttribute('aria-live', 'polite'); body.appendChild(take2);

  function add(parent, tag, cls, txt) { var e = el(tag, cls, txt); parent.appendChild(e); return e; }
  function claim(store, key, fp) {
    for (var i = 0; i < store.length; i++) if (store[i].key === key) { if (store[i].fp !== fp) return 'mismatch'; return store[i].done ? 'replay' : 'in_flight'; }
    return 'new';
  }
  function table(parent, rows, hotKey) {
    var t = add(parent, 'table', 'idem-kv'), th = add(add(t, 'thead'), 'tr');
    ['key', 'fingerprint', 'state', 'response'].forEach(function (h) { add(th, 'th', '', h); });
    var tb = add(t, 'tbody');
    if (!rows.length) { var e = add(tb, 'tr'); var td = add(e, 'td', 'empty', '(empty)'); td.colSpan = 4; }
    rows.forEach(function (r) {
      var tr = add(tb, 'tr', r.key === hotKey ? 'hot' : '');
      add(tr, 'td', 'mono', r.key); add(tr, 'td', 'mono', r.fp);
      var st = add(tr, 'td'); add(st, 'span', 'st ' + (r.done ? 'done' : 'run'), r.done ? 'done' : 'in_flight');
      add(tr, 'td', 'mono', r.resp || '–');
    });
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function render() {
    var c = CASES[S.cur], fp = fingerprint(S.amount), key = S.key || '(none)';
    var before = c.store.map(function (r) { return { key: r.key, fp: r.fp, done: r.done, resp: r.resp }; });
    var outcome = claim(before, S.key, fp);
    var after = before.map(function (r) { return { key: r.key, fp: r.fp, done: r.done, resp: r.resp }; });
    if (outcome === 'new') after.push({ key: S.key, fp: fp, done: S.step >= 2, resp: S.step >= 2 ? '201 pay_5e2a' : '' });
    stepL.textContent = (S.step + 1) + '/3';
    back.disabled = S.step === 0; next.disabled = S.step === 2;

    clear(colReq); clear(colClaim); clear(colRes);
    colReq.className = 'idem-col' + (S.step === 0 ? ' on' : '');
    colClaim.className = 'idem-col' + (S.step === 1 ? ' on' : '') + (S.step < 1 ? ' dim' : '');
    colRes.className = 'idem-col' + (S.step === 2 ? ' on' : '') + (S.step < 2 ? ' dim' : '');

    add(colReq, 'h5', '', '① Request arrives');
    add(colReq, 'pre', '', 'POST /payments\nIdempotency-Key: ' + key + '\n\n{"customer_id": "c_42",\n "amount": ' + S.amount + ',\n "currency": "EUR"}');
    add(colReq, 'p', 'k', 'fingerprint = hash(body) = ' + fp);

    add(colClaim, 'h5', '', '② claim(key, fingerprint)');
    var tag = add(colClaim, 'p', 'outcome o-' + outcome, 'outcome: ' + outcome);
    add(colClaim, 'p', 'k', outcome === 'new' ? 'key not in store: we own it now' :
      outcome === 'replay' ? 'key found, fingerprint matches, work done' :
      outcome === 'in_flight' ? 'key found, fingerprint matches, work still running' : 'key found but the fingerprint differs');
    table(colClaim, S.step >= 1 ? after : before, S.step >= 1 ? S.key : '');

    add(colRes, 'h5', '', '③ Response');
    var http = { new: ['201 Created', 'ok'], replay: ['201 Created + Idempotent-Replayed: true', 'ok'], in_flight: ['409 Conflict + Retry-After: 1', 'warn'], mismatch: ['422 Unprocessable', 'bad'] }[outcome];
    add(colRes, 'p', 'http h-' + http[1], http[0]);
    add(colRes, 'p', 'k', outcome === 'new' ? 'handler runs: charge_card() once, then finish(key, result)' : 'handler runs: no. The side effect stays at one charge.');
    add(colRes, 'p', 'k', outcome === 'new' ? 'charges for this key: 1' : outcome === 'replay' ? 'charges for this key: still 1' : outcome === 'in_flight' ? 'charges for this key: 1 (once the first call finishes)' : 'charges for this key: 1 (the new body was refused, not run)');
    take2.textContent = {
      new: 'New key: the only case where the side effect runs.',
      replay: 'Replay: the saved result is returned, nothing is charged again.',
      in_flight: 'Two copies at nearly the same time: the second gets 409 instead of a second charge, because claim() is one atomic step.',
      mismatch: 'Same key, different body: refusing loudly (422) beats silently ignoring what the client just asked for.'
    }[outcome];
  }
  function pick(i) {
    S.cur = i; S.step = 2; S.key = 'k-7f3a'; S.amount = CASES[i].amount; keyIn.value = S.key; amIn.value = S.amount;
    tabBtns.forEach(function (b, j) { b.setAttribute('aria-pressed', String(j === i)); });
    render();
  }
  keyIn.addEventListener('input', function () { S.key = keyIn.value.trim(); S.step = 2; render(); });
  amIn.addEventListener('input', function () { var v = parseInt(amIn.value, 10); if (isFinite(v) && v > 0) { S.amount = v; S.step = 2; render(); } });
  back.addEventListener('click', function () { if (S.step > 0) { S.step--; render(); } });
  next.addEventListener('click', function () { if (S.step < 2) { S.step++; render(); } });

  /* scoped styles for the pieces site.css does not know */
  var st = el('style');
  st.textContent =
    '.lab[data-lab="idempotency"] .lab-sub{font:700 .78rem var(--label);letter-spacing:.14em;text-transform:uppercase;color:var(--signal);margin:6px 0 0}' +
    '.lab[data-lab="idempotency"] .lab-sub:not(:first-child){border-top:1.5px dashed var(--rule);padding-top:16px;margin-top:8px}' +
    '.idem-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}' +
    '.idem-col{background:var(--paper);border:1.5px solid var(--ink);border-radius:10px;padding:10px 12px;min-width:0;transition:box-shadow .2s,opacity .2s}' +
    '.idem-col.on{box-shadow:4px 4px 0 var(--signal)}' +
    '.idem-col.dim{opacity:.45}' +
    '.idem-col h5{font:700 .72rem var(--label);letter-spacing:.1em;text-transform:uppercase;margin:0 0 8px;color:var(--ink)}' +
    '.idem-col pre{margin:0 0 8px;padding:8px 10px;font:500 .72rem/1.5 var(--mono);background:var(--paper-2);border:1px solid var(--rule);border-radius:6px;box-shadow:none;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.idem-col pre::before,.idem-col pre::after{display:none}' +
    '.idem-col .k{font:500 .78rem/1.45 var(--body);color:var(--ink-2);margin:6px 0 0;overflow-wrap:anywhere}' +
    '.idem-col .outcome{display:inline-block;font:700 .74rem var(--mono);padding:4px 9px;border:1.5px solid var(--ink);border-radius:6px;margin:0}' +
    '.o-new{background:var(--amber);color:#1c1f3a}.o-replay{background:var(--teal);color:#1c1f3a}.o-in_flight{background:var(--paper-2);color:var(--ink)}.o-mismatch{background:var(--signal);color:#1c1f3a}' +
    '.idem-col .http{font:700 .82rem/1.35 var(--mono);margin:0;padding:6px 9px;border-radius:6px;border:1.5px solid var(--ink)}' +
    '.h-ok{background:var(--teal);color:#1c1f3a}.h-warn{background:var(--amber);color:#1c1f3a}.h-bad{background:var(--signal);color:#1c1f3a}' +
    '.idem-kv{width:100%;border-collapse:collapse;margin-top:8px;font-size:.7rem;display:table}' +
    '.idem-kv th{font:700 .6rem var(--label);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);text-align:left;padding:4px 4px;border-bottom:1.5px solid var(--ink);background:none;white-space:nowrap}' +
    '.idem-kv td{padding:5px 4px;border-bottom:1px dashed var(--rule);white-space:normal;overflow-wrap:anywhere;vertical-align:middle}' +
    '.idem-kv td.mono{font-family:var(--mono)}.idem-kv td.empty{color:var(--ink-2);font-style:italic}' +
    '.idem-kv tr.hot td{background:color-mix(in srgb,var(--amber) 32%,transparent)}' +
    '.idem-kv .st{display:inline-block;font:700 .6rem var(--mono);padding:2px 6px;border-radius:4px;border:1px solid var(--ink)}' +
    '.idem-kv .st.done{background:var(--teal);color:#1c1f3a}.idem-kv .st.run{background:var(--amber);color:#1c1f3a}' +
    '.lab[data-lab="idempotency"] .ctl button:disabled{opacity:.4;cursor:default;transform:none}' +
    '@media (max-width:720px){.idem-board{grid-template-columns:1fr}.lab[data-lab="idempotency"] .ctl-range input{width:min(46vw,200px)}}';
  root.insertBefore(st, root.firstChild);

  // redraw the canvas when the theme changes
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', draw); }

  simulate();
  render();
  statics.forEach(function (n) { if (n.parentNode === body) body.removeChild(n); });
})();
