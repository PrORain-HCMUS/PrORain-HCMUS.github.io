/* Chinchilla in one picture: slide a compute budget C and watch the isoFLOP "U" (loss against model size,
   with D = C / 6N) slide with it. The valley moves right, a marker rides its bottom, and the bars on the
   right show N and D growing together. Guidable: a log-compute slider (touch it and the auto sweep stops),
   a switch between three loss laws, and an Auto sweep button.
     Post toy      alpha = beta = 0.33, A = 400, B = 1100, E = 1.7          (the post's own figure)
     Published     Approach 3 constants as printed in Besiroglu et al. (2024), Eq. 4
     Refit         the Besiroglu et al. refit of the same form
   N_opt = G (C/6)^a, D_opt = C / (6 N_opt), with a = beta/(alpha+beta), G = (alpha A / beta B)^(1/(alpha+beta)). */
(function () {
  'use strict';
  var LAWS = {
    toy: { name: 'POST TOY', E: 1.7, A: 400, B: 1100, al: 0.33, be: 0.33 },
    pub: { name: 'PUBLISHED FIT', E: 1.6934, A: 406.4, B: 410.7, al: 0.3392, be: 0.2849 },
    ref: { name: 'REFIT', E: 1.8172, A: 482.01, B: 2085.43, al: 0.3478, be: 0.3658 }
  };
  Object.keys(LAWS).forEach(function (key) {
    var w = LAWS[key];
    w.a = w.be / (w.al + w.be);
    w.G = Math.pow(w.al * w.A / (w.be * w.B), 1 / (w.al + w.be));
  });
  var LC0 = 19, LC1 = 24;                       // log10 of the compute sweep, FLOPs
  var LN0 = 7.4, LN1 = 12.6;                    // log10 N across the plot
  var LMIN = 1.7, LMAX = 3.9;                   // loss range shown
  var PX0 = -6.7, PX1 = 3.4, PY0 = -1.95, PY1 = 2.55;
  var PERIOD = 17, NPTS = 72, GPTS = 56;

  function loss(w, logN, logC) {                 // L(N, C/6N)
    var N = Math.pow(10, logN), D = Math.pow(10, logC) / (6 * N);
    return w.E + w.A * Math.pow(N, -w.al) + w.B * Math.pow(D, -w.be);
  }
  function opt(w, logC) {
    var N = w.G * Math.pow(Math.pow(10, logC) / 6, w.a), D = Math.pow(10, logC) / (6 * N);
    return { N: N, D: D, logN: Math.log10(N), L: loss(w, Math.log10(N), logC) };
  }
  function mx(logN) { return PX0 + (logN - LN0) / (LN1 - LN0) * (PX1 - PX0); }
  function my(L) { return PY0 + (L - LMIN) / (LMAX - LMIN) * (PY1 - PY0); }
  function fmt(v) {
    if (v >= 1e12) return (v / 1e12).toFixed(1) + 'T';
    if (v >= 1e9) return (v / 1e9 < 10 ? (v / 1e9).toFixed(1) : Math.round(v / 1e9)) + 'B';
    return Math.round(v / 1e6) + 'M';
  }
  // the visible span of a U: the part of the curve whose loss stays under LMAX
  function span(w, logC) {
    var lo = null, hi = null, x;
    for (x = LN0; x <= LN1 + 1e-9; x += 0.01) if (loss(w, x, logC) <= LMAX) { if (lo === null) lo = x; hi = x; }
    return [lo === null ? LN0 : lo, hi === null ? LN1 : hi];
  }
  function sweep(clock) {                        // sweeps up and back, slow at both ends
    var s = 0.5 - 0.5 * Math.cos(2 * Math.PI * (clock + 0.9) / PERIOD);
    return LC0 + (LC1 - LC0) * s;
  }

  var manual = false, lawKey = 'toy', clockNow = 0, lawDirty = true, rangeInput = null, rangeOut = null, lastOut = '';

  SceneKit.mount({
    canvas: 'scene3d',
    fit: { w: 16.6, h: 7.9 },
    lift: 0.62,
    controls: [
      { id: 'logC', type: 'range', label: 'log₁₀ C', min: LC0, max: LC1, step: 0.05, value: sweep(0).toFixed(2) * 1, fmt: function (v) { return v.toFixed(1); }, onChange: function () { manual = true; } },
      { id: 'law', type: 'seg', label: 'Law', value: 'toy', options: [{ v: 'toy', t: 'Post toy' }, { v: 'pub', t: 'Published' }, { v: 'ref', t: 'Refit' }], onChange: function (v) { lawKey = v; lawDirty = true; } },
      { type: 'button', label: 'Auto sweep', onClick: function () { manual = false; } }
    ],
    build: function (k) {
      var T = k.THREE, g = k.g, i;
      function panel(x0, x1, y0, y1, z) {
        var geo = new T.BoxGeometry(x1 - x0, y1 - y0, 0.1);
        var m = new T.Mesh(geo, k.fixed(k.basic(), 'paper2')); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z); g.add(m);
        var e = k.edges(geo, 'ink'); e.position.copy(m.position); g.add(e);
      }
      panel(-8.2, 3.9, -3.3, 3.25, -1.2);
      panel(4.3, 8.2, -3.3, 3.25, -1.2);

      /* axes */
      function line(pts, role, op) {
        var l = new T.Line(new T.BufferGeometry().setFromPoints(pts), k.lineMat(role, op === undefined ? 1 : op)); g.add(l); return l;
      }
      line([k.v3(PX0, PY1 + 0.2, 0), k.v3(PX0, PY0, 0), k.v3(PX1 + 0.2, PY0, 0)], 'ink');
      k.label('LOSS  ↑', -5.0, 2.95, 3.0);
      k.label('MODEL SIZE N  →', -1.7, -2.4, 4.2);
      var lawLabel = k.label('LAW: POST TOY', 6.25, 2.95, 3.3, { role: 'ink2', size: 40 });

      /* ghost curves for each whole power of ten, stacked in depth so the parallax shows the budget axis;
         their buffers are rewritten when the law changes */
      var ghosts = [];
      for (var e = LC0; e <= LC1; e++) {
        var gg = new T.BufferGeometry();
        gg.setAttribute('position', new T.BufferAttribute(new Float32Array((GPTS + 1) * 3), 3));
        var gl = new T.Line(gg, k.lineMat('ink2', 0.38)); gl.frustumCulled = false; g.add(gl);
        ghosts.push({ geo: gg, e: e });
      }
      /* frontier: where the bottoms of all the U's sit */
      var FPTS = Math.round((LC1 - LC0) / 0.1) + 1;
      var frontGeo = new T.BufferGeometry();
      frontGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(FPTS * 3), 3));
      var front = new T.Line(frontGeo, k.fixed(new T.LineDashedMaterial({ color: 0xffffff, dashSize: 0.14, gapSize: 0.11, transparent: true, opacity: 0.8 }), 'ink'));
      front.frustumCulled = false; g.add(front);
      function buildLaw(w) {
        var gi, j, sp, p, ln, o, fp = frontGeo.attributes.position.array;
        for (gi = 0; gi < ghosts.length; gi++) {
          sp = span(w, ghosts[gi].e); p = ghosts[gi].geo.attributes.position.array;
          for (j = 0; j <= GPTS; j++) { ln = sp[0] + (sp[1] - sp[0]) * j / GPTS; p[j * 3] = mx(ln); p[j * 3 + 1] = my(loss(w, ln, ghosts[gi].e)); p[j * 3 + 2] = -0.12 * (ghosts[gi].e - LC0) - 0.2; }
          ghosts[gi].geo.attributes.position.needsUpdate = true;
        }
        for (j = 0; j < FPTS; j++) { o = opt(w, LC0 + j * 0.1); fp[j * 3] = mx(o.logN); fp[j * 3 + 1] = my(o.L); fp[j * 3 + 2] = 0.05; }
        frontGeo.attributes.position.needsUpdate = true; front.computeLineDistances();
        k.setLabel(lawLabel, 'LAW: ' + w.name);
      }

      /* live curve as a ribbon (a 1px line is too thin to read) */
      var ribbonGeo = new T.BufferGeometry();
      ribbonGeo.setAttribute('position', new T.BufferAttribute(new Float32Array((NPTS + 1) * 2 * 3), 3));
      var idx = [];
      for (i = 0; i < NPTS; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      ribbonGeo.setIndex(idx);
      var ribbon = new T.Mesh(ribbonGeo, k.fixed(k.basic(), 'signal')); ribbon.frustumCulled = false; g.add(ribbon);

      /* marker + drop line to the N axis */
      var ring = new T.Mesh(new T.CircleGeometry(0.3, 32), k.fixed(k.basic(), 'ink')); ring.position.z = 0.3; g.add(ring);
      var dot = new T.Mesh(new T.CircleGeometry(0.2, 32), k.fixed(k.basic(), 'amber')); dot.position.z = 0.32; g.add(dot);
      var dropGeo = new T.BufferGeometry().setFromPoints([k.v3(0, 0, 0.1), k.v3(0, PY0, 0.1)]);
      var drop = new T.Line(dropGeo, k.lineMat('ink2', 0.6)); g.add(drop);

      /* compute slider */
      var SX0 = -4.5, SX1 = 3.4, SY = -2.95;
      k.label('BUDGET C  →', -6.3, SY, 2.9);
      line([k.v3(SX0, SY, 0), k.v3(SX1, SY, 0)], 'ink');
      for (i = 0; i <= LC1 - LC0; i++) { var tx = SX0 + (SX1 - SX0) * i / (LC1 - LC0); line([k.v3(tx, SY - 0.12, 0), k.v3(tx, SY + 0.12, 0)], 'ink'); }
      var knobGeo = new T.BoxGeometry(0.34, 0.5, 0.2);
      var knob = new T.Mesh(knobGeo, k.fixed(k.basic(), 'signal')); knob.position.set(SX0, SY, 0.3); g.add(knob);
      var knobE = k.edges(knobGeo, 'ink'); knob.add(knobE);

      /* bars: N and D on one log scale (1e8 .. 1e13) */
      var BX = 5.25, BL = 2.7;
      function bar(y, role) {
        var grp = new T.Group(); grp.position.set(BX, y, 0); g.add(grp);
        var geo = new T.BoxGeometry(1, 0.52, 0.24);
        var m = new T.Mesh(geo, k.fixed(k.basic(), role)); m.position.x = 0.5; grp.add(m);
        var ed = k.edges(geo, 'ink'); ed.position.x = 0.5; grp.add(ed);
        return grp;
      }
      var barN = bar(2.0, 'signal'), barD = bar(1.1, 'amber');

      /* live readout, drawn on its own canvas so the numbers can change */
      var rc = document.createElement('canvas'); rc.width = 512; rc.height = 360;
      var rtex = new T.CanvasTexture(rc); rtex.anisotropy = 4;
      var rs = new T.Sprite(new T.SpriteMaterial({ map: rtex, transparent: true, depthTest: false }));
      rs.scale.set(3.6, 3.6 * 360 / 512, 1); rs.position.set(6.25, -0.8, 0.5); g.add(rs);
      var rows = null;
      function drawReadout() {
        var ctx = rc.getContext('2d'), ink = '#' + k.P.ink.getHexString(), ink2 = '#' + k.P.ink2.getHexString();
        ctx.clearRect(0, 0, 512, 360); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        var fam = '"Space Grotesk","Segoe UI",sans-serif';
        ctx.font = '700 60px ' + fam; ctx.fillStyle = '#' + k.P.signal.getHexString(); ctx.fillText('N', 14, 48); ctx.fillStyle = '#' + k.P.amber.getHexString(); ctx.fillText('D', 14, 136);
        ctx.fillStyle = ink; ctx.font = '700 84px ' + fam; ctx.fillText(rows[0], 82, 48); ctx.fillText(rows[1], 82, 136);
        ctx.fillStyle = ink2; ctx.font = '700 44px ' + fam; ctx.fillText('TOKENS / PARAM', 14, 232);
        ctx.fillStyle = ink; ctx.font = '700 108px ' + fam; ctx.fillText(rows[2], 14, 306);
        rtex.needsUpdate = true;
      }
      var shown = '';
      function readout(o) {
        var r = [fmt(o.N), fmt(o.D), (o.D / o.N).toFixed(1)];
        var key = r.join('|');
        if (key !== shown) { shown = key; rows = r; drawReadout(); }
      }
      rows = ['—', '—', '—'];

      var pos = ribbonGeo.attributes.position.array;
      var PX = new Array(NPTS + 1), PY = new Array(NPTS + 1);
      function place(w, logC) {
        var o = opt(w, logC), sp = span(w, logC), j, ln, nx, ny, l, dx, dy, wd = 0.065, v;
        for (j = 0; j <= NPTS; j++) { ln = sp[0] + (sp[1] - sp[0]) * j / NPTS; PX[j] = mx(ln); PY[j] = my(loss(w, ln, logC)); }
        for (j = 0; j <= NPTS; j++) {
          dx = PX[Math.min(NPTS, j + 1)] - PX[Math.max(0, j - 1)]; dy = PY[Math.min(NPTS, j + 1)] - PY[Math.max(0, j - 1)];
          l = Math.sqrt(dx * dx + dy * dy) || 1; nx = -dy / l * wd; ny = dx / l * wd; v = j * 6;
          pos[v] = PX[j] + nx; pos[v + 1] = PY[j] + ny; pos[v + 2] = 0.2;
          pos[v + 3] = PX[j] - nx; pos[v + 4] = PY[j] - ny; pos[v + 5] = 0.2;
        }
        ribbonGeo.attributes.position.needsUpdate = true;
        var mxp = mx(o.logN), myp = my(o.L);
        ring.position.x = dot.position.x = mxp; ring.position.y = dot.position.y = myp;
        var dp = dropGeo.attributes.position.array; dp[0] = dp[3] = mxp; dp[1] = myp; dp[4] = PY0; dropGeo.attributes.position.needsUpdate = true;
        knob.position.x = SX0 + (SX1 - SX0) * (logC - LC0) / (LC1 - LC0);
        barN.scale.x = Math.max(0.05, (Math.log10(o.N) - 8) / 5 * BL);
        barD.scale.x = Math.max(0.05, (Math.log10(o.D) - 8) / 5 * BL);
        readout(o);
      }

      /* keep the DOM slider in step with the auto sweep */
      function syncSlider(logC) {
        if (!rangeInput) {
          var strip = document.querySelector('#scene3d').parentNode.querySelector('.scene-ctl');
          rangeInput = strip && strip.querySelector('.ctl-range input'); rangeOut = rangeInput && rangeInput.parentNode.querySelector('output');
          if (!rangeInput) return;
        }
        var txt = logC.toFixed(1);
        if (!manual) rangeInput.value = logC.toFixed(2);
        if (rangeOut && txt !== lastOut) { lastOut = txt; rangeOut.textContent = txt; }
      }

      var placedKey = '';
      function current() { return manual ? k.state.logC : sweep(clockNow); }
      function refresh() {
        var logC = current(), key = lawKey + '|' + logC.toFixed(3);
        if (lawDirty) { buildLaw(LAWS[lawKey]); lawDirty = false; placedKey = ''; }
        if (key !== placedKey) { placedKey = key; place(LAWS[lawKey], logC); syncSlider(logC); }
      }
      buildLaw(LAWS.toy); lawDirty = false;

      return {
        step: function (dt, clock) { clockNow = clock; refresh(); },
        palette: function () { drawReadout(); },
        paint: refresh
      };
    }
  });
})();
