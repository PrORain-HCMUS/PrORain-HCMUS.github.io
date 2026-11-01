/* "How to read an LLM benchmark": two models scored 82.1 vs 80.4, with 95% whiskers = 1.96·sqrt(p(1-p)/N), p = 0.8.
   N sweeps 100 → 500 → 14,000 and back. Faint ticks are bootstrap resamples of the test set (spread = SE).
   The band between the whiskers shows whether the two intervals overlap. Right: the questions being scored. */
(function () {
  'use strict';
  if (!window.SceneKit) return;
  SceneKit.mount({
    canvas: 'scene3d',
    fit: { w: 16.6, h: 6.3 },
    build: function (k) {
      var T = k.THREE, g = k.g;
      var P0 = 0.8, SA = 82.1, SB = 80.4;
      var S_LO = 72, S_HI = 90, Y0 = -2.55, Y1 = 2.55;
      var XA = -5.1, XB = -2.3, XL = -7.5, XR = 0.1;
      function sy(s) { return Y0 + (s - S_LO) / (S_HI - S_LO) * (Y1 - Y0); }
      function se(N) { return Math.sqrt(P0 * (1 - P0) / N) * 100; }

      /* seeded randomness so the loop is identical every time */
      var seed = 12345;
      function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
      function gauss() { var z = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); return Math.max(-2.6, Math.min(2.6, z)); }

      function solid(role, op) { var m = k.fixed(k.basic(), role); if (op < 1) { m.transparent = true; m.opacity = op; } return m; }
      function box(w, h, d, mat) { return new T.Mesh(new T.BoxGeometry(w, h, d), mat); }
      function line(x1, y1, x2, y2, role, op) {
        var l = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(x1, y1, 0), new T.Vector3(x2, y2, 0)]), k.lineMat(role, op));
        g.add(l); return l;
      }

      /* ---- plot frame ---- */
      line(XL, Y0 - 0.1, XL, Y1 + 0.1, 'ink', 1);
      line(XL, Y0 - 0.1, XR, Y0 - 0.1, 'ink', 1);
      k.dashed(new T.LineCurve3(k.v3(XL, sy(SA), -0.1), k.v3(XR, sy(SA), -0.1)), 'amber', 0.9);
      k.dashed(new T.LineCurve3(k.v3(XL, sy(SB), -0.1), k.v3(XR, sy(SB), -0.1)), 'teal', 0.9);

      /* overlap / gap bands between the two whiskers */
      var overlap = new T.Mesh(new T.PlaneGeometry(1, 1), solid('signal', 0.34)); overlap.position.set((XA + XB) / 2, 0, -0.2); g.add(overlap);
      var clear = new T.Mesh(new T.PlaneGeometry(1, 1), solid('teal', 0.4)); clear.position.set((XA + XB) / 2, 0, -0.2); g.add(clear);

      /* ---- the two models: slab + 95% whisker ---- */
      var inkSolid = solid('ink', 1), whiskers = [];
      function model(x, score, role, name) {
        var slab = box(1.5, 0.1, 0.3, k.fixed(k.basic(), role)); slab.position.set(x, sy(score), 0.05); g.add(slab);
        var e = k.edges(new T.BoxGeometry(1.5, 0.1, 0.3), 'ink', 1); e.position.copy(slab.position); g.add(e);
        var stem = box(0.09, 1, 0.09, inkSolid), cap1 = box(0.62, 0.06, 0.09, inkSolid), cap2 = box(0.62, 0.06, 0.09, inkSolid);
        stem.position.z = cap1.position.z = cap2.position.z = 0.3;
        stem.position.x = cap1.position.x = cap2.position.x = x;
        g.add(stem); g.add(cap1); g.add(cap2);
        k.label(name, x, -2.95, 3.0);
        var ticks = [];
        for (var i = 0; i < 9; i++) {
          var t = box(0.9, 0.05, 0.05, solid('ink2', 0.6)); t.position.set(x + (rnd() - 0.5) * 0.7, sy(score), 0.12); g.add(t);
          ticks.push({ m: t, z: gauss() });
        }
        var w = { x: x, mean: score, stem: stem, cap1: cap1, cap2: cap2, ticks: ticks, next: 0 };
        whiskers.push(w); return w;
      }
      var A = model(XA, SA, 'amber', 'MODEL A');
      var B = model(XB, SB, 'teal', 'MODEL B');

      /* ---- the test set (right): 11 x 6 questions, correct = teal, wrong = signal, flash = amber ---- */
      var COLS = 11, ROWS = 6, PITCH = 0.55, CX = 5.2, CY = -0.05;
      var matOff = solid('paper2', 1), matOk = solid('teal', 1), matBad = solid('signal', 1), matHit = solid('amber', 1);
      var cellGeo = new T.BoxGeometry(0.46, 0.46, 0.2), cellEdge = new T.EdgesGeometry(cellGeo), cellLine = k.lineMat('ink', 0.85);
      var cells = [];
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var m = new T.Mesh(cellGeo, matOff);
        m.position.set(CX + (c - (COLS - 1) / 2) * PITCH, CY + ((ROWS - 1) / 2 - r) * PITCH, 0);
        m.add(new T.LineSegments(cellEdge, cellLine)); g.add(m);
        cells.push({ m: m, ok: rnd() >= 0.2, flash: 0 });
      }
      k.label('TEST QUESTIONS', CX, 2.35, 3.8);
      var nLabels = [k.label('N = 100', CX, -2.4, 3.4), k.label('N = 500', CX, -2.4, 3.4), k.label('N = 14,000', CX, -2.4, 3.4)];
      var vOver = k.label('INTERVALS OVERLAP', (XA + XB) / 2 - 0.2, 2.78, 5.2), vClear = k.label('GAP IS REAL', (XA + XB) / 2 - 0.2, 2.78, 3.6);

      /* ---- N schedule: 100 -> 500 -> 14,000 -> back ---- */
      var KEYS = [Math.log(100), Math.log(500), Math.log(14000)], HOLD = 3.2, TR = 1.5, SEG = HOLD + TR, PERIOD = 3 * SEG;
      var lnN = KEYS[0], active = 0, nextPick = 0.4, pickSide = 0;
      function schedule(t) {
        t = t % PERIOD;
        var seg = Math.floor(t / SEG), u = t - seg * SEG, a = KEYS[seg], b = KEYS[(seg + 1) % 3];
        return u < HOLD ? a : a + (b - a) * k.ease((u - HOLD) / TR);
      }
      var tick = 0, lastT = 0;
      function step(dt, clock) {
        lnN = schedule(clock);
        var f = (lnN - KEYS[0]) / (KEYS[2] - KEYS[0]);
        active = Math.round(14 + f * (COLS * ROWS - 14));

        // refresh one bootstrap tick every ~0.11 s, alternating models
        tick += dt;
        while (tick > 0.11) {
          tick -= 0.11;
          var w = (Math.floor(clock / 0.11) % 2 === 0) ? A : B;
          w.ticks[w.next].z = gauss(); w.next = (w.next + 1) % w.ticks.length;
        }
        // draw a question "with replacement" and ship it to a model
        nextPick -= dt;
        if (nextPick <= 0) {
          nextPick += 0.5;
          var idx = Math.floor(rnd() * active), cell = cells[idx], tgt = pickSide++ % 2 ? B : A;
          cell.flash = 0.5;
          var p0 = cell.m.position;
          k.send(new T.QuadraticBezierCurve3(new T.Vector3(p0.x, p0.y, 0.3), new T.Vector3((p0.x + tgt.x) / 2, 2.6, 0.5), new T.Vector3(tgt.x, sy(tgt.mean), 0.35)), 1.3, null);
        }
        for (var i = 0; i < cells.length; i++) if (cells[i].flash > 0) cells[i].flash = Math.max(0, cells[i].flash - dt);
      }

      function paint() {
        var half = 1.96 * se(Math.exp(lnN));              // 95% half-width in score points
        var hw = half / (S_HI - S_LO) * (Y1 - Y0);        // in world units
        whiskers.forEach(function (w) {
          var y = sy(w.mean);
          w.stem.scale.y = 2 * hw; w.stem.position.y = y;
          w.cap1.position.y = y + hw; w.cap2.position.y = y - hw;
          w.ticks.forEach(function (t) { t.m.position.y = sy(w.mean + se(Math.exp(lnN)) * t.z); });
        });
        var aLo = sy(SA - half), bHi = sy(SB + half), over = aLo < bHi;
        overlap.visible = over; clear.visible = !over;
        if (over) { overlap.scale.set(XB - XA + 1.7, bHi - aLo, 1); overlap.position.y = (aLo + bHi) / 2; }
        else { clear.scale.set(XB - XA + 1.7, aLo - bHi, 1); clear.position.y = (aLo + bHi) / 2; }
        vOver.sprite.visible = over; vClear.sprite.visible = !over;
        var near = 0, best = 1e9;
        for (var i = 0; i < 3; i++) { var d = Math.abs(lnN - KEYS[i]); if (d < best) { best = d; near = i; } }
        for (var j = 0; j < 3; j++) nLabels[j].sprite.visible = j === near;
        for (var n = 0; n < cells.length; n++) {
          var cell = cells[n];
          cell.m.material = n >= active ? matOff : cell.flash > 0 ? matHit : cell.ok ? matOk : matBad;
        }
      }
      return { step: step, paint: paint };
    }
  });
})();
