/* Chinchilla in one picture: slide a compute budget C and watch the isoFLOP "U" (loss against model size,
   with D = C / 6N) slide with it. The valley moves right, a marker rides its bottom, and the bars on the
   right show N and D growing together. Same constants as the post's figure:
   alpha = beta = 0.33, A = 400, B = 1100, E = 1.7  ->  N_opt = G (C/6)^a, D_opt = C / (6 N_opt). */
(function () {
  'use strict';
  var AL = 0.33, BE = 0.33, A = 400, B = 1100, E = 1.7;
  var EXP_N = BE / (AL + BE), G = Math.pow(AL * A / (BE * B), 1 / (AL + BE));
  var LC0 = 19, LC1 = 24;                       // log10 of the compute sweep, FLOPs
  var LN0 = 7.4, LN1 = 12.6;                    // log10 N across the plot
  var LMIN = 1.7, LMAX = 3.9;                   // loss range shown
  var PX0 = -6.7, PX1 = 3.4, PY0 = -1.95, PY1 = 2.55;
  var PERIOD = 17, NPTS = 72;

  function loss(logN, logC) {                    // L(N, C/6N)
    var N = Math.pow(10, logN), D = Math.pow(10, logC) / (6 * N);
    return E + A * Math.pow(N, -AL) + B * Math.pow(D, -BE);
  }
  function opt(logC) {
    var N = G * Math.pow(Math.pow(10, logC) / 6, EXP_N), D = Math.pow(10, logC) / (6 * N);
    return { N: N, D: D, logN: Math.log10(N), L: loss(Math.log10(N), logC) };
  }
  function mx(logN) { return PX0 + (logN - LN0) / (LN1 - LN0) * (PX1 - PX0); }
  function my(L) { return PY0 + (L - LMIN) / (LMAX - LMIN) * (PY1 - PY0); }
  function fmt(v) {
    if (v >= 1e12) return (v / 1e12).toFixed(1) + 'T';
    if (v >= 1e9) return (v / 1e9 < 10 ? (v / 1e9).toFixed(1) : Math.round(v / 1e9)) + 'B';
    return Math.round(v / 1e6) + 'M';
  }
  // the visible span of a U: the part of the curve whose loss stays under LMAX
  function span(logC) {
    var lo = null, hi = null, x;
    for (x = LN0; x <= LN1 + 1e-9; x += 0.01) if (loss(x, logC) <= LMAX) { if (lo === null) lo = x; hi = x; }
    return [lo === null ? LN0 : lo, hi === null ? LN1 : hi];
  }

  SceneKit.mount({
    canvas: 'scene3d',
    fit: { w: 16.6, h: 7.9 },
    lift: 0.62,
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

      /* ghost curves for each whole power of ten, stacked in depth so the parallax shows the budget axis */
      var ribbon, ribbonGeo, fr = [];
      for (var e = LC0; e <= LC1; e++) {
        var sp = span(e), pts = [];
        for (i = 0; i <= 56; i++) { var ln = sp[0] + (sp[1] - sp[0]) * i / 56; pts.push(k.v3(mx(ln), my(loss(ln, e)), -0.12 * (e - LC0) - 0.2)); }
        line(pts, 'ink2', 0.38);
      }
      /* frontier: where the bottoms of all the U's sit */
      for (var c = LC0; c <= LC1 + 1e-9; c += 0.1) { var o = opt(c); fr.push(k.v3(mx(o.logN), my(o.L), 0.05)); }
      k.dashed(new T.CatmullRomCurve3(fr), 'ink', 0.8);

      /* live curve as a ribbon (a 1px line is too thin to read) */
      ribbonGeo = new T.BufferGeometry();
      ribbonGeo.setAttribute('position', new T.BufferAttribute(new Float32Array((NPTS + 1) * 2 * 3), 3));
      var idx = [];
      for (i = 0; i < NPTS; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      ribbonGeo.setIndex(idx);
      ribbon = new T.Mesh(ribbonGeo, k.fixed(k.basic(), 'signal')); ribbon.frustumCulled = false; g.add(ribbon);

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
      var barN = bar(2.25, 'signal'), barD = bar(1.25, 'amber');

      /* live readout, drawn on its own canvas so the numbers can change */
      var rc = document.createElement('canvas'); rc.width = 512; rc.height = 360;
      var rtex = new T.CanvasTexture(rc); rtex.anisotropy = 4;
      var rs = new T.Sprite(new T.SpriteMaterial({ map: rtex, transparent: true, depthTest: false }));
      rs.scale.set(3.6, 3.6 * 360 / 512, 1); rs.position.set(6.25, -0.7, 0.5); g.add(rs);
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
      function place(logC) {
        var o = opt(logC), sp = span(logC), j, ln, nx, ny, l, dx, dy, w = 0.065, v;
        for (j = 0; j <= NPTS; j++) { ln = sp[0] + (sp[1] - sp[0]) * j / NPTS; PX[j] = mx(ln); PY[j] = my(loss(ln, logC)); }
        for (j = 0; j <= NPTS; j++) {
          dx = PX[Math.min(NPTS, j + 1)] - PX[Math.max(0, j - 1)]; dy = PY[Math.min(NPTS, j + 1)] - PY[Math.max(0, j - 1)];
          l = Math.sqrt(dx * dx + dy * dy) || 1; nx = -dy / l * w; ny = dx / l * w; v = j * 6;
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

      return {
        step: function (dt, clock) {
          var s = 0.5 - 0.5 * Math.cos(2 * Math.PI * (clock + 0.9) / PERIOD);   // sweeps up and back, slow at both ends
          place(LC0 + (LC1 - LC0) * s);
        },
        palette: function () { drawReadout(); },
        paint: function () {}
      };
    }
  });
})();
