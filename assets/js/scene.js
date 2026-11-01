/* CONGA in one picture, RecSys-style: a user's item history scrolls by, older items fold into a
   memory bank, a sequence model reads window + memory, and a ranked top-K list comes out.
   Flat "zine" three.js scene (r128, global THREE). Falls back to the SVG already in the page. */
(function () {
  'use strict';
  var canvas = document.getElementById('conga3d');
  if (!canvas || !window.THREE) return;
  var fig = canvas.parentNode;
  while (fig && fig.tagName !== 'FIGURE') fig = fig.parentNode;
  if (!fig) fig = canvas.parentNode;

  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduce = !!(reduceQuery && reduceQuery.matches);

  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true }); } catch (e) { return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(26, 16 / 7, 0.1, 100);
  camera.position.set(0, 0, 18);
  var g = new THREE.Group(); scene.add(g);

  /* ---------- palette (re-read on theme change, recoloured in place) ---------- */
  var NAMES = { ink: '--ink', ink2: '--ink-2', signal: '--signal', amber: '--amber', paper: '--paper', paper2: '--paper-2', teal: '--teal' };
  var FB = { ink: '#1c1f3a', ink2: '#4a4c63', signal: '#e2502f', amber: '#f0a93a', paper: '#f4efe4', paper2: '#ebe3d2', teal: '#2a7f86' };
  var P = {}, registry = [], labels = [];
  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    for (var k in NAMES) {
      var v = cs.getPropertyValue(NAMES[k]).trim(), c;
      try { c = new THREE.Color(v || FB[k]); } catch (e) { c = new THREE.Color(FB[k]); }
      if (P[k]) P[k].copy(c); else P[k] = c;
    }
  }
  readPalette();
  function fixed(mat, role) { registry.push({ mat: mat, role: role }); mat.color.copy(P[role]); return mat; }
  function removeFixed(mat) { for (var i = registry.length - 1; i >= 0; i--) if (registry[i].mat === mat) { registry.splice(i, 1); return; } }
  function lineMat(role, opacity) { return fixed(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: opacity < 1, opacity: opacity }), role); }
  function edges(geo, role, opacity) { return new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(role, opacity === undefined ? 1 : opacity)); }
  function basic() { return new THREE.MeshBasicMaterial({ color: 0xffffff }); }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  /* ---------- labels ---------- */
  function drawLabel(l) {
    var c = l.canvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#' + P.ink.getHexString();
    ctx.font = '700 46px "Space Grotesk", "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillText(l.text, c.width / 2 + 2, c.height / 2 + 2);
    l.tex.needsUpdate = true;
  }
  function label(text, x, y, w) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 96;
    var tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(w, w * 96 / 512, 1); s.position.set(x, y, 0.5); g.add(s);
    var l = { text: text, canvas: c, tex: tex }; labels.push(l); drawLabel(l);
  }

  function dashed(curve, role, opacity) {
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
      fixed(new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.14, gapSize: 0.11, transparent: true, opacity: opacity }), role));
    line.computeLineDistances(); g.add(line); return line;
  }
  function v3(x, y, z) { return new THREE.Vector3(x, y, z || 0); }

  /* ---------- layout constants (world units; drawing spans x -8..8, y -2.8..2.8) ---------- */
  var SP = 0.78, X_NEW = 1.24, WINDOW = 5, VISIBLE = 9;
  var MEM = { x: -7.0, y: 0.1 }, ENC_X = [2.45, 2.85, 3.25];
  var BAR_X = 5.25, THUMB_X = 4.78, BAR_BASE = [1.0, 0.8, 0.62, 0.47, 0.35], BAR_MAX = 2.55;

  /* ---------- memory bank: 4x4 cells in an outlined box ---------- */
  var bankGeo = new THREE.BoxGeometry(1.95, 1.95, 0.5);
  var bank = edges(bankGeo, 'ink'); bank.position.set(MEM.x, MEM.y, -0.1); g.add(bank);
  var cellGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32), cells = [], i, j;
  for (i = 0; i < 16; i++) {
    var cm = basic(), cell = new THREE.Mesh(cellGeo, cm); cell.add(edges(cellGeo, 'ink', 0.8));
    cell.position.set(MEM.x + (i % 4 - 1.5) * 0.42, MEM.y + (1.5 - Math.floor(i / 4)) * 0.42, 0);
    g.add(cell); cells.push({ mesh: cell, mat: cm, fill: 0, flash: 0 });
  }
  var cellIdx = 0;

  /* ---------- item cards (the user's history) ---------- */
  var cardGeo = new THREE.BoxGeometry(0.62, 0.84, 0.1), picGeo = new THREE.BoxGeometry(0.46, 0.4, 0.06);
  var ROLES = ['signal', 'amber', 'teal', 'paper2'];
  var cards = [];
  for (i = 0; i < 10; i++) {
    var grp = new THREE.Group();
    var body = new THREE.Mesh(cardGeo, fixed(basic(), 'paper')); body.add(edges(cardGeo, 'ink')); grp.add(body);
    var picMat = basic(), pic = new THREE.Mesh(picGeo, picMat); pic.position.set(0, 0.12, 0.08); pic.add(edges(picGeo, 'ink', 0.9)); grp.add(pic);
    var line1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.02), fixed(basic(), 'ink2')); line1.position.set(0, -0.2, 0.07); grp.add(line1);
    var line2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.02), fixed(basic(), 'ink2')); line2.position.set(-0.07, -0.3, 0.07); grp.add(line2);
    g.add(grp);
    cards.push({ g: grp, picMat: picMat, role: ROLES[i % 4], from: i, to: i, a: i });
  }
  // card with index 9 starts already absorbed (hidden inside the memory bank)

  /* ---------- attention arcs from the newest item to the rest of the history ---------- */
  var arcs = [];
  for (i = 1; i <= VISIBLE - 1; i++) {
    var ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 3), 3));
    var am = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }); registry.push({ mat: am, role: 'signal' });
    var al = new THREE.Line(ag, am); al.frustumCulled = false; g.add(al); arcs.push({ line: al, mat: am, geo: ag });
  }

  /* ---------- context-window bracket ---------- */
  var bx0 = X_NEW - (WINDOW - 1) * SP - 0.45, bx1 = X_NEW + 0.45, by = -0.7;
  var bracket = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(bx0, by + 0.12), v3(bx0, by), v3(bx1, by), v3(bx1, by + 0.12)]), lineMat('ink', 1));
  g.add(bracket);

  /* ---------- sequence model: three slabs ---------- */
  var slabGeo = new THREE.BoxGeometry(0.16, 1.9, 1.0), slabs = [], slabRoles = ['paper2', 'amber', 'signal'];
  for (i = 0; i < 3; i++) {
    var sm = basic(), sl = new THREE.Mesh(slabGeo, sm); sl.add(edges(slabGeo, 'ink'));
    sl.position.set(ENC_X[i], 0, -0.1 + i * 0.1); g.add(sl); slabs.push({ mesh: sl, mat: sm, role: slabRoles[i], flash: 0 });
  }

  /* ---------- ranked top-K list ---------- */
  var barGeo = new THREE.BoxGeometry(1, 0.4, 0.12); barGeo.translate(0.5, 0, 0);
  var thumbGeo = new THREE.BoxGeometry(0.36, 0.36, 0.1), bars = [];
  for (i = 0; i < 5; i++) {
    var y = 1.4 - i * 0.7, bm = basic(), bmesh = new THREE.Mesh(barGeo, bm); bmesh.add(edges(barGeo, 'ink'));
    bmesh.position.set(BAR_X, y, 0); bmesh.scale.x = 0.15; g.add(bmesh);
    var tm = basic(), tmesh = new THREE.Mesh(thumbGeo, tm); tmesh.add(edges(thumbGeo, 'ink'));
    tmesh.position.set(THUMB_X, y, 0); g.add(tmesh);
    bars.push({ mesh: bmesh, mat: bm, thumb: tmesh, tmat: tm, len: 0.15, target: 0.15, role: ROLES[i % 4], flash: 0 });
  }

  /* ---------- wires ---------- */
  var memArc = new THREE.QuadraticBezierCurve3(v3(MEM.x, MEM.y + 1.05, 0), v3(-2.2, 3.5, 0), v3(ENC_X[0], 0.95, 0));
  dashed(memArc, 'ink2', 0.6);
  var inCurve = new THREE.QuadraticBezierCurve3(v3(X_NEW + 0.4, 0, 0.1), v3(2.0, 0.55, 0.2), v3(ENC_X[0] - 0.2, 0, 0));
  var outCurves = bars.map(function (b) {
    var c = new THREE.QuadraticBezierCurve3(v3(ENC_X[2] + 0.15, 0, 0), v3(4.0, b.mesh.position.y * 0.4, 0.2), v3(THUMB_X - 0.3, b.mesh.position.y, 0));
    dashed(c, 'ink2', 0.55); return c;
  });

  label('MEMORY', MEM.x, -1.5, 2.2);
  label('OLDER ITEMS', -3.85, -1.25, 2.6);
  label('CONTEXT WINDOW', X_NEW - 1.5 * SP - 0.2, -1.25, 3.2);
  label('SEQUENCE MODEL', 2.85, -1.55, 3.2);
  label('TOP-K', 6.35, -2.3, 2.2);

  /* ---------- dust ---------- */
  var dustGeo = new THREE.BufferGeometry(), pts = [];
  for (i = 0; i < 70; i++) pts.push((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 7.5, -1.2 - Math.random() * 2);
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.Points(dustGeo, fixed(new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.4 }), 'ink2')));

  /* ---------- moving dots ---------- */
  var dotGeo = new THREE.SphereGeometry(0.13, 16, 12), movers = [];
  function send(curve, dur, done, big) {
    var d = new THREE.Mesh(dotGeo, fixed(basic(), 'signal')); d.scale.setScalar(big ? 1.2 : 0.85);
    g.add(d); movers.push({ m: d, c: curve, t: 0, dur: dur, done: done });
  }

  /* ---------- fit to canvas ---------- */
  var W = 1, H = 1, running = false;
  function resize() {
    W = Math.max(1, canvas.clientWidth || fig.clientWidth || 1);
    H = Math.max(1, canvas.clientHeight || fig.clientHeight || 1);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    var visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), visW = visH * camera.aspect;
    var s = Math.min(visW / 16.6, visH / 6.3);
    g.scale.setScalar(s);
    g.position.set(0, 0.28 * s, 0);        // leave room for the caption at the bottom
    if (!running || reduce) { paint(); renderOnce(); }
  }

  /* ---------- simulation ---------- */
  var PERIOD = 2.4, HOP = 0.5, ABSORB = 1.0;
  var mx = 0, my = 0, clock = 0, tt = PERIOD - 0.3, absorbed = true, winnerShift = 0;

  function lightCell() {
    var c = cells[cellIdx % 16]; c.flash = 1; c.fill = Math.min(1, c.fill + 0.5); cellIdx++;
    if (cellIdx % 16 === 0) for (var k = 0; k < 16; k++) cells[k].fill = 0;
  }
  function cellPos(idx) { var c = cells[idx % 16].mesh.position; return v3(c.x, c.y, c.z); }

  function tick() {
    tt = 0; absorbed = false;
    var k, c;
    for (k = 0; k < cards.length; k++) {
      c = cards[k];
      if (c.to === 9) { c.from = -1; c.to = 0; c.role = ROLES[Math.floor(Math.random() * 4)]; }
      else { c.from = c.to; c.to = c.to + 1; }
    }
    // the model reads the newest item, then scores a fresh ranking
    send(inCurve, 0.7, function () {
      for (var s = 0; s < 3; s++) slabs[s].flash = 1 + s * 0.0;
      for (var r = 0; r < 5; r++) (function (r) {
        send(outCurves[r], 0.7 + r * 0.1, function () {
          var b = bars[r];
          b.target = BAR_BASE[r] * (0.88 + 0.12 * Math.random()) * BAR_MAX; b.flash = 1;
          b.role = ROLES[(r + Math.floor(clock * 7)) % 4];
        }, r === 0);
      })(r);
    }, true);
    for (k = 0; k < bars.length; k++) bars[k].target = 0.18;
    if (Math.floor(clock / PERIOD) % 2 === 0) send(memArc, 1.6, function () { slabs[0].flash = 1; }, false);
  }

  function paint() {
    var i, c, b, s, col = new THREE.Color();
    for (i = 0; i < cards.length; i++) {
      c = cards[i];
      var aEff = c.from + (c.to - c.from) * ease(tt / HOP);
      var dim = Math.max(0, Math.min(1, (aEff - (WINDOW - 1.5)) / 1.5));
      col.copy(P[c.role]).lerp(P.paper2, dim * 0.75);
      c.picMat.color.copy(col);
    }
    for (i = 0; i < cells.length; i++) {
      var ce = cells[i];
      ce.mat.color.copy(P.paper2).lerp(P.amber, ce.fill * 0.85).lerp(P.signal, ce.flash * 0.8);
      ce.mesh.scale.setScalar(1 + ce.flash * 0.25);
    }
    for (i = 0; i < slabs.length; i++) {
      s = slabs[i]; s.mat.color.copy(P[s.role]).lerp(P.signal, Math.min(1, s.flash) * 0.6);
      s.mesh.scale.y = 1 + Math.min(1, s.flash) * 0.06;
    }
    for (i = 0; i < bars.length; i++) {
      b = bars[i];
      b.mesh.scale.x = Math.max(0.05, b.len);
      var base = i === 0 ? P.amber : P.paper2;
      b.mat.color.copy(base).lerp(P.signal, b.flash * 0.55);
      b.tmat.color.copy(P[b.role]).lerp(P.signal, b.flash * 0.3);
      b.thumb.scale.setScalar(1 + b.flash * 0.2);
    }
  }

  function placeCards() {
    var i, c, h = ease(tt / HOP), e = ease(tt / ABSORB), x, y, sc;
    for (i = 0; i < cards.length; i++) {
      c = cards[i];
      if (c.to === 9) {                            // folding into memory
        var t0 = v3(X_NEW - 8 * SP, 0, 0), tp = cellPos(cellIdx), mid = v3((t0.x + tp.x) / 2, 1.5, 0.3);
        var p = new THREE.QuadraticBezierCurve3(t0, mid, tp).getPoint(e);
        c.g.position.copy(p); sc = 1 - 0.85 * e; c.g.scale.setScalar(Math.max(0.001, sc));
        c.g.rotation.z = e * 0.9;
        if (tt >= ABSORB && !absorbed) { absorbed = true; lightCell(); c.g.scale.setScalar(0.001); }
        if (absorbed && tt >= ABSORB) c.g.scale.setScalar(0.001);
        continue;
      }
      c.g.rotation.z = 0;
      var a = c.from + (c.to - c.from) * h;
      x = X_NEW - a * SP; y = 0;
      sc = c.from < 0 ? h : 1;
      c.g.position.set(x, y, 0); c.g.scale.setScalar(Math.max(0.001, sc));
      c.a = a;
    }
    // attention arcs from the newest card
    var newest = null; for (i = 0; i < cards.length; i++) if (cards[i].to === 0) newest = cards[i];
    var nx = newest ? newest.g.position.x : X_NEW, k = 0, base = v3(nx, 0.5, 0.2);
    for (i = 0; i < cards.length; i++) {
      c = cards[i]; if (c === newest || c.to === 9) continue;
      var arc = arcs[k++]; if (!arc) break;
      var tx = c.g.position.x, dx = nx - tx, hgt = 0.7 + 0.3 * Math.abs(dx);
      var arr = arc.geo.attributes.position.array;
      for (var s = 0; s < 22; s++) {
        var u = s / 21, xx = base.x + (tx - base.x) * u, yy = 0.5 + 4 * u * (1 - u) * hgt * 0.5;
        arr[s * 3] = xx; arr[s * 3 + 1] = yy; arr[s * 3 + 2] = 0.2;
      }
      arc.geo.attributes.position.needsUpdate = true;
      var inWin = c.to < WINDOW;
      arc.mat.opacity = (inWin ? 0.95 : 0.5) * (0.7 + 0.3 * Math.sin(clock * 2 + k)) * Math.min(1, c.g.scale.x + 0.2);
    }
    for (; k < arcs.length; k++) arcs[k].mat.opacity = 0;
  }

  function step(dt) {
    var i, o;
    clock += dt; tt += dt;
    if (tt >= PERIOD) tick();
    g.rotation.y += ((Math.sin(clock * 0.3) * 0.05 + mx * 0.14) - g.rotation.y) * 0.05;
    g.rotation.x += ((my * 0.1) - g.rotation.x) * 0.05;
    for (i = 0; i < movers.length; i++) { /* handled below */ }
    for (i = movers.length - 1; i >= 0; i--) {
      o = movers[i]; o.t += dt / o.dur;
      o.m.position.copy(o.c.getPoint(Math.min(1, o.t)));
      if (o.t >= 1) { g.remove(o.m); o.m.material.dispose(); removeFixed(o.m.material); movers.splice(i, 1); o.done(); }
    }
    for (i = 0; i < cells.length; i++) cells[i].flash = Math.max(0, cells[i].flash - dt * 1.8);
    for (i = 0; i < slabs.length; i++) slabs[i].flash = Math.max(0, slabs[i].flash - dt * 1.6);
    for (i = 0; i < bars.length; i++) {
      var b = bars[i]; b.len += (b.target - b.len) * Math.min(1, dt * 6); b.flash = Math.max(0, b.flash - dt * 1.4);
    }
    placeCards(); paint();
  }
  function renderOnce() { renderer.render(scene, camera); }

  /* ---------- run loop ---------- */
  var onScreen = true, last = performance.now(), raf = 0;
  function loop() {
    raf = 0; if (!running) return;
    var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt); renderOnce(); raf = requestAnimationFrame(loop);
  }
  function update() {
    var should = onScreen && !document.hidden && !reduce;
    if (should && !running) { running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  }
  function applyPalette() {
    readPalette();
    for (var i = 0; i < registry.length; i++) registry[i].mat.color.copy(P[registry[i].role]);
    for (var j = 0; j < labels.length; j++) drawLabel(labels[j]);
    if (!running || reduce) { paint(); renderOnce(); }
  }

  /* ---------- wiring ---------- */
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; update(); }).observe(fig);
  document.addEventListener('visibilitychange', update);
  fig.addEventListener('mousemove', function (e) {
    var r = fig.getBoundingClientRect();
    mx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5; my = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
  });
  fig.addEventListener('mouseleave', function () { mx = 0; my = 0; });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
  new MutationObserver(applyPalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  var scheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (scheme) { if (scheme.addEventListener) scheme.addEventListener('change', applyPalette); else if (scheme.addListener) scheme.addListener(applyPalette); }
  if (reduceQuery) {
    var onReduce = function () { reduce = reduceQuery.matches; update(); if (reduce) { paint(); renderOnce(); } };
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onReduce); else if (reduceQuery.addListener) reduceQuery.addListener(onReduce);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { for (var j = 0; j < labels.length; j++) drawLabel(labels[j]); if (!running) renderOnce(); });

  // start mid-cycle so the first frame already shows a full history; settle a few ticks
  tick(); for (var n = 0; n < 200; n++) step(1 / 60);
  resize();
  if (reduce) { renderOnce(); } else update();
  fig.classList.add('has3d');
})();
