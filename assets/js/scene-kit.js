/* Shared helper for the flat "zine" three.js scenes (r128, global THREE).
   A post's scene file calls:

     SceneKit.mount({
       canvas: 'scene3d',            // id of the <canvas> inside <figure class="scene">
       fit: { w: 16.6, h: 6.3 },     // world-unit box your drawing occupies (x -w/2..w/2, y -h/2..h/2)
       build: function (k) {         // k = helpers (below); return { step(dt, clock), paint() }
         ...
       }
     });

   Helpers on k: THREE, g (root group), P (live palette: ink ink2 signal amber paper paper2 teal),
   basic(), fixed(mat, role), lineMat(role, opacity), edges(geo, role, opacity), dashed(curve, role, opacity),
   label(text, x, y, width), send(curve, seconds, onDone, big), v3(x, y, z), ease(t), rand(), colorRoles.
   Anything made with fixed()/edges()/dashed()/label() recolours itself on light/dark change.
   paint() runs every frame after step() and on every palette change: set per-object colours there
   from k.P so dark mode keeps working. The kit owns the renderer, resize, visibility pause,
   reduced-motion (static frame after a warm-up), mouse parallax, theme changes and the .has3d class. */
(function () {
  'use strict';
  var instances = {};
  window.SceneKit = { instances: instances, mount: mount };

  function mount(opts) {
    var canvas = document.getElementById(opts.canvas);
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

    /* palette */
    var NAMES = { ink: '--ink', ink2: '--ink-2', signal: '--signal', amber: '--amber', paper: '--paper', paper2: '--paper-2', teal: '--teal' };
    var FB = { ink: '#1c1f3a', ink2: '#4a4c63', signal: '#e2502f', amber: '#f0a93a', paper: '#f4efe4', paper2: '#ebe3d2', teal: '#2a7f86' };
    var P = {}, registry = [], labels = [], movers = [];
    function readPalette() {
      var cs = getComputedStyle(document.documentElement);
      for (var k in NAMES) {
        var v = cs.getPropertyValue(NAMES[k]).trim(), c;
        try { c = new THREE.Color(v || FB[k]); } catch (e) { c = new THREE.Color(FB[k]); }
        if (P[k]) P[k].copy(c); else P[k] = c;
      }
    }
    readPalette();

    var k = {
      THREE: THREE, g: g, P: P, camera: camera, colorRoles: ['signal', 'amber', 'teal', 'paper2'],
      basic: function () { return new THREE.MeshBasicMaterial({ color: 0xffffff }); },
      fixed: function (mat, role) { registry.push({ mat: mat, role: role }); mat.color.copy(P[role]); return mat; },
      lineMat: function (role, opacity) {
        return k.fixed(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: opacity < 1, opacity: opacity }), role);
      },
      edges: function (geo, role, opacity) {
        return new THREE.LineSegments(new THREE.EdgesGeometry(geo), k.lineMat(role || 'ink', opacity === undefined ? 1 : opacity));
      },
      dashed: function (curve, role, opacity) {
        var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
          k.fixed(new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.14, gapSize: 0.11, transparent: true, opacity: opacity === undefined ? 0.7 : opacity }), role || 'ink2'));
        line.computeLineDistances(); g.add(line); return line;
      },
      label: function (text, x, y, w) {
        var c = document.createElement('canvas'); c.width = 512; c.height = 96;
        var tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        w = w || 3; s.scale.set(w, w * 96 / 512, 1); s.position.set(x, y, 0.5); g.add(s);
        var l = { text: text, canvas: c, tex: tex, sprite: s }; labels.push(l); drawLabel(l); return l;
      },
      send: function (curve, dur, done, big) {
        var d = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), k.fixed(k.basic(), 'signal'));
        d.scale.setScalar(big ? 1.2 : 0.85); g.add(d);
        movers.push({ m: d, c: curve, t: 0, dur: dur, done: done || function () {} });
      },
      v3: function (x, y, z) { return new THREE.Vector3(x, y, z || 0); },
      ease: function (t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); },
      rand: Math.random
    };

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

    var sim = opts.build(k) || {};
    var fit = opts.fit || { w: 16.6, h: 6.3 };
    var running = false, clock = 0, mx = 0, my = 0;

    function resize() {
      var W = Math.max(1, canvas.clientWidth || fig.clientWidth || 1), H = Math.max(1, canvas.clientHeight || fig.clientHeight || 1);
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      var visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), visW = visH * camera.aspect;
      var s = Math.min(visW / fit.w, visH / fit.h);
      g.scale.setScalar(s);
      g.position.set(0, (opts.lift === undefined ? 0.28 : opts.lift) * s, 0);
      if (!running || reduce) { paint(); renderOnce(); }
    }
    function paint() { if (sim.paint) sim.paint(); }
    function renderOnce() { renderer.render(scene, camera); }
    function step(dt) {
      clock += dt;
      var i, o;
      if (sim.step) sim.step(dt, clock);
      for (i = movers.length - 1; i >= 0; i--) {
        o = movers[i]; o.t += dt / o.dur;
        o.m.position.copy(o.c.getPoint(Math.min(1, o.t)));
        if (o.t >= 1) {
          g.remove(o.m); o.m.material.dispose(); o.m.geometry.dispose();
          for (var r = registry.length - 1; r >= 0; r--) if (registry[r].mat === o.m.material) { registry.splice(r, 1); break; }
          movers.splice(i, 1); o.done();
        }
      }
      g.rotation.y += ((Math.sin(clock * 0.3) * 0.05 + mx * 0.14) - g.rotation.y) * 0.05;
      g.rotation.x += ((my * 0.1) - g.rotation.x) * 0.05;
      paint();
    }

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
      if (sim.palette) sim.palette();
      if (!running || reduce) { paint(); renderOnce(); }
    }

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

    for (var n = 0; n < (opts.warmup === undefined ? 200 : opts.warmup); n++) step(1 / 60);
    resize();
    if (reduce) renderOnce(); else update();
    fig.classList.add('has3d');
    // handle for tests: instances[canvasId].step(dt) advances the simulation; renderOnce() draws a frame
    instances[opts.canvas] = { step: step, renderOnce: renderOnce, resize: resize };
  }
})();
