/* CONGA in one picture: history cubes stream into a memory, which scores the next item.
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
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(35, 16 / 7, 0.1, 100);
  camera.position.set(0, 0, 14);
  var world = new THREE.Group(); scene.add(world);
  var g = new THREE.Group(); world.add(g);

  /* ---------- palette (re-read on theme change, recoloured in place) ---------- */
  var NAMES = { ink: '--ink', ink2: '--ink-2', signal: '--signal', amber: '--amber', paper: '--paper', paper2: '--paper-2', teal: '--teal' };
  var P = {};
  var registry = [];      // { mat, role } for materials with a fixed role colour
  var labels = [];        // sprites that redraw on palette change

  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    try { return new THREE.Color(v || fallback); } catch (e) { return new THREE.Color(fallback); }
  }
  function readPalette() {
    var fb = { ink: '#1c1f3a', ink2: '#4a4c63', signal: '#e2502f', amber: '#f0a93a', paper: '#f4efe4', paper2: '#ebe3d2', teal: '#2a7f86' };
    for (var k in NAMES) {
      var c = cssColor(NAMES[k], fb[k]);
      if (P[k]) P[k].copy(c); else P[k] = c;
    }
  }
  function fixed(mat, role) { registry.push({ mat: mat, role: role }); mat.color.copy(P[role]); return mat; }
  function fill(role) { return fixed(new THREE.MeshBasicMaterial({ color: 0xffffff }), role); }
  function lineMat(role, opacity) {
    var m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: opacity < 1, opacity: opacity });
    return fixed(m, role);
  }
  function edges(geo, role, opacity) {
    return new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(role, opacity === undefined ? 1 : opacity));
  }
  function applyPalette() {
    readPalette();
    for (var i = 0; i < registry.length; i++) registry[i].mat.color.copy(P[registry[i].role]);
    for (var j = 0; j < labels.length; j++) drawLabel(labels[j]);
    for (var k = 0; k < streamCubes.length; k++) streamCubes[k].mesh.material.color.copy(P[streamCubes[k].role]);
    if (!running || reduce) { paint(); renderOnce(); }
  }
  readPalette();

  /* ---------- labels ---------- */
  function drawLabel(l) {
    var c = l.canvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#' + P.ink.getHexString();
    ctx.font = '700 46px "Space Grotesk", "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.fillText(l.text, c.width / 2 + 3, c.height / 2 + 2);
    l.tex.needsUpdate = true;
  }
  function label(text, x, y, w) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    var tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(w || 3.4, (w || 3.4) / 4, 1); s.position.set(x, y, 0.4);
    g.add(s);
    var l = { text: text, canvas: c, tex: tex, sprite: s };
    labels.push(l); drawLabel(l);
    return l;
  }

  /* ---------- dust ---------- */
  var dustGeo = new THREE.BufferGeometry(), pts = [], i;
  for (i = 0; i < 140; i++) pts.push((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6 - 2);
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  var dustMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.45 });
  fixed(dustMat, 'ink2');
  var dust = new THREE.Points(dustGeo, dustMat); world.add(dust);

  /* ---------- memory: torus + ring + pulsing core ---------- */
  var mem = new THREE.Group(); g.add(mem);
  var torusMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  var torus = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.2, 14, 64), torusMat);
  var ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.016, 6, 90), fixed(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), 'ink'));
  var hub = new THREE.Group(); hub.add(torus); hub.add(ring2); mem.add(hub);
  var coreGeo = new THREE.IcosahedronGeometry(0.6, 0);
  var coreMat = fill('signal');
  var core = new THREE.Mesh(coreGeo, coreMat); core.add(edges(coreGeo, 'ink')); mem.add(core);
  var memFlash = 0;

  /* ---------- history stream ---------- */
  var histCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-8.3, 0.9, 0), new THREE.Vector3(-4.8, -1.3, 0.5), new THREE.Vector3(-0.5, 0, 0));
  function dashed(curve, role, opacity) {
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
      fixed(new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.14, gapSize: 0.11, transparent: true, opacity: opacity }), role));
    line.computeLineDistances(); g.add(line); return line;
  }
  dashed(histCurve, 'ink2', 0.8);

  var cubeGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  var ROLES = ['signal', 'amber', 'paper2'];
  var N = 10, TRAVEL = 5.2, streamCubes = [];
  for (i = 0; i < N; i++) {
    var role = ROLES[i % 3];
    var m = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.add(edges(cubeGeo, 'ink'));
    g.add(m);
    streamCubes.push({ mesh: m, role: role, u: i / N, prev: i / N, spin: 0.6 + (i % 4) * 0.25 });
  }

  /* ---------- next items ---------- */
  var oGeo = new THREE.OctahedronGeometry(0.55, 0);
  var itemPos = [[7.0, 1.75, -0.4], [7.5, 0, 0.5], [7.0, -1.75, -0.3]];
  var items = itemPos.map(function (p) {
    var o = new THREE.Mesh(oGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    o.add(edges(oGeo, 'ink'));
    o.position.set(p[0], p[1], p[2]); o.userData.flash = 0; g.add(o); return o;
  });
  var outCurves = items.map(function (it) {
    var a = new THREE.Vector3(0.75, 0, 0), b = it.position.clone();
    var mid = a.clone().add(b).multiplyScalar(0.5); mid.y += (b.y - a.y) * 0.15 + 0.5; mid.z += 0.3;
    var c = new THREE.QuadraticBezierCurve3(a, mid, b); dashed(c, 'ink2', 0.8); return c;
  });

  label('History', -5.4, -2.35, 3.2);
  label('Memory', 0, -2.75, 3.2);
  label('Next item', 7.0, -3.0, 3.6);

  /* ---------- moving dots + waves ---------- */
  var dotGeo = new THREE.SphereGeometry(0.13, 16, 12), movers = [], waves = [];
  function send(curve, dur, done, big) {
    var d = new THREE.Mesh(dotGeo, fill('signal')); d.scale.setScalar(big ? 1.25 : 0.85);
    g.add(d); movers.push({ m: d, c: curve, t: 0, dur: dur, done: done });
  }
  function wave() {
    var w = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.05, 72),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    registry.push({ mat: w.material, role: 'signal' }); w.material.color.copy(P.signal);
    g.add(w); waves.push({ m: w, t: 0 });
  }
  var winner = 0;
  function emit() {
    wave();
    var win = winner; winner = (winner + 1) % 3;
    for (var k = 0; k < 3; k++) (function (k) {
      send(outCurves[k], 0.95, function () { items[k].userData.flash = k === win ? 1 : 0.35; }, k === win);
    })(k);
  }

  /* ---------- fit to canvas ---------- */
  var W = 1, H = 1;
  function resize() {
    W = Math.max(1, fig.clientWidth || canvas.clientWidth || 1);
    H = Math.max(1, fig.clientHeight || canvas.clientHeight || 1);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    var visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), visW = visH * camera.aspect;
    var s = Math.min(visW / 17.4, visH / 6.4);
    g.scale.setScalar(s);
    g.position.set(-0.35 * s, 0.5 * s, 0);       // centre the 16.6 x 5.7 drawing
    if (!running || reduce) renderOnce();
  }

  /* ---------- simulation ---------- */
  var mx = 0, my = 0, clock = 0, nextEmit = 0.6;
  function paint() {
    var i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      it.material.color.copy(P.paper2).lerp(P.amber, it.userData.flash);
      it.scale.setScalar(1 + it.userData.flash * 0.35);
    }
    torusMat.color.copy(P.amber).lerp(P.signal, memFlash * 0.7);
    coreMat.color.copy(P.signal).lerp(P.amber, 0.25 + 0.25 * Math.sin(clock * 1.6));
    core.scale.setScalar(1 + 0.12 * Math.sin(clock * 1.6) + memFlash * 0.18);
    torus.scale.setScalar(1 + memFlash * 0.08);
  }
  function step(dt) {
    var i, k, o;
    clock += dt;
    if (clock > nextEmit) { emit(); nextEmit = clock + 2.4; }

    g.rotation.y += ((Math.sin(clock * 0.3) * 0.16 + mx * 0.4) - g.rotation.y) * 0.05;
    g.rotation.x += ((my * 0.22) - g.rotation.x) * 0.05;
    hub.rotation.x = 0.9 + Math.sin(clock * 0.6) * 0.15; hub.rotation.y = clock * 0.5;
    ring2.rotation.z = clock * 0.2;
    core.rotation.x = clock * 0.4; core.rotation.y = clock * 0.55;
    dust.rotation.y = clock * 0.01;

    memFlash = Math.max(0, memFlash - dt * 3.2);
    for (i = 0; i < streamCubes.length; i++) {
      var c = streamCubes[i];
      c.prev = c.u; c.u = ((clock / TRAVEL) + i / N) % 1;
      if (c.u < c.prev) memFlash = 1;                       // a cube just dissolved into memory
      c.mesh.position.copy(histCurve.getPoint(c.u));
      var s = Math.min(1, c.u / 0.07);
      if (c.u > 0.84) s = Math.max(0.02, (1 - c.u) / 0.16);
      c.mesh.scale.setScalar(s);
      c.mesh.rotation.x += dt * c.spin; c.mesh.rotation.y += dt * c.spin * 0.7;
    }
    for (i = movers.length - 1; i >= 0; i--) {
      o = movers[i]; o.t += dt / o.dur;
      o.m.position.copy(o.c.getPoint(Math.min(1, o.t)));
      if (o.t >= 1) { g.remove(o.m); o.m.material.dispose(); removeFixed(o.m.material); movers.splice(i, 1); o.done(); }
    }
    for (k = waves.length - 1; k >= 0; k--) {
      var w = waves[k]; w.t += dt / 2.0;
      w.m.scale.setScalar(1 + w.t * 1.5); w.m.material.opacity = 0.5 * (1 - w.t);
      w.m.quaternion.copy(camera.quaternion);
      if (w.t >= 1) { g.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); removeFixed(w.m.material); waves.splice(k, 1); }
    }
    for (i = 0; i < items.length; i++) {
      items[i].userData.flash = Math.max(0, items[i].userData.flash - dt * 1.6);
      items[i].rotation.y += dt * 0.6;
    }
    paint();
  }
  function removeFixed(mat) {
    for (var i = registry.length - 1; i >= 0; i--) if (registry[i].mat === mat) { registry.splice(i, 1); return; }
  }
  function renderOnce() { renderer.render(scene, camera); }

  /* ---------- run loop ---------- */
  var onScreen = true, running = false, last = performance.now(), raf = 0;
  function loop() {
    raf = 0;
    if (!running) return;
    var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt); renderOnce();
    raf = requestAnimationFrame(loop);
  }
  function update() {
    var should = onScreen && !document.hidden && !reduce;
    if (should && !running) { running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  }

  /* ---------- wiring ---------- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; update(); }).observe(fig);
  }
  document.addEventListener('visibilitychange', update);
  fig.addEventListener('mousemove', function (e) {
    var r = fig.getBoundingClientRect();
    mx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5; my = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
  });
  fig.addEventListener('mouseleave', function () { mx = 0; my = 0; });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(fig);
  else window.addEventListener('resize', resize);

  new MutationObserver(applyPalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  var scheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (scheme) { if (scheme.addEventListener) scheme.addEventListener('change', applyPalette); else if (scheme.addListener) scheme.addListener(applyPalette); }
  if (reduceQuery) {
    var onReduce = function () { reduce = reduceQuery.matches; update(); if (reduce) renderOnce(); };
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onReduce); else if (reduceQuery.addListener) reduceQuery.addListener(onReduce);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { for (var j = 0; j < labels.length; j++) drawLabel(labels[j]); if (!running) renderOnce(); });

  resize();
  if (reduce) { for (var n = 0; n < 120; n++) step(1 / 60); renderOnce(); }
  else update();
  fig.classList.add('has3d');
})();
