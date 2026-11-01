/* Sinkhorn pushing a 4x4 mixing matrix toward doubly stochastic, and what that does to the
   long-run gradient share of each stream. Matrices are the post's recipe: exp(Z), Z = N(0,1) + 3I,
   with Z taken from numpy seeds 0, 1, 2 (seed 0 is the one in the reproduce-it snippet). */
(function () {
  'use strict';
  var S = 4;
  var Z = [
    [3.126, -0.132, 0.640, 0.105, -0.536, 3.362, 1.304, 0.947, -0.704, -1.265, 2.377, 0.041, -2.325, -0.219, -1.246, 2.268],
    [3.346, 0.822, 0.330, -1.303, 0.905, 3.446, -0.537, 0.581, 0.365, 0.294, 3.028, 0.547, -0.736, -0.163, -0.482, 3.599],
    [3.189, -0.523, -0.413, -2.441, 1.800, 4.144, -0.325, 0.774, 0.281, -0.554, 3.978, -0.311, -0.329, -0.792, 0.455, 2.901]
  ];

  function rowStep(M) {
    var o = M.slice(), r, c, t;
    for (r = 0; r < S; r++) { t = 0; for (c = 0; c < S; c++) t += M[r * S + c]; for (c = 0; c < S; c++) o[r * S + c] = M[r * S + c] / t; }
    return o;
  }
  function colStep(M) {
    var o = M.slice(), r, c, t;
    for (c = 0; c < S; c++) { t = 0; for (r = 0; r < S; r++) t += M[r * S + c]; for (r = 0; r < S; r++) o[r * S + c] = M[r * S + c] / t; }
    return o;
  }
  function sums(M) {
    var rs = [0, 0, 0, 0], cs = [0, 0, 0, 0], r, c;
    for (r = 0; r < S; r++) for (c = 0; c < S; c++) { rs[r] += M[r * S + c]; cs[c] += M[r * S + c]; }
    return { r: rs, c: cs };
  }
  /* stationary distribution of the row-normalised matrix: what each stream's gradient share tends to */
  function stationary(M) {
    var T = rowStep(M), p = [0.25, 0.25, 0.25, 0.25], n, i, j, q, tot;
    for (n = 0; n < 160; n++) {
      q = [0, 0, 0, 0];
      for (i = 0; i < S; i++) for (j = 0; j < S; j++) q[j] += p[i] * T[i * S + j];
      tot = q[0] + q[1] + q[2] + q[3]; for (j = 0; j < S; j++) p[j] = q[j] / tot;
    }
    return p;
  }
  /* keyframes for one matrix: raw, then 5 x (rows, cols), then the 60-step limit */
  function timeline(zs) {
    var E = zs.map(Math.exp), tot = 0, i, frames = [];
    for (i = 0; i < 16; i++) tot += E[i];
    var M = E.map(function (v) { return v * S / tot; });   // total mass S, so entries sit on the same scale as a normalised matrix
    frames.push({ M: M, tag: 0, dur: 0.9 });
    for (i = 0; i < 5; i++) {
      M = rowStep(M); frames.push({ M: M, tag: 1, dur: 0.62 });
      M = colStep(M); frames.push({ M: M, tag: 2, dur: 0.62 });
    }
    for (i = 0; i < 55; i++) M = colStep(rowStep(M));
    frames.push({ M: M, tag: 3, dur: 1.3 });
    return frames;
  }
  var SETS = Z.map(timeline);
  var HOLD = 0.3, END_HOLD = 3.0, TO_RAW = 1.1;

  SceneKit.mount({
    canvas: 'scene3d',
    fit: { w: 16.6, h: 6.3 },
    lift: 0.12,
    warmup: 0,
    build: function (k) {
      var T = k.THREE, g = k.g, P = k.P, ease = k.ease, i, j;
      var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

      var boxGeo = new T.BoxGeometry(1, 1, 1);

      /* ---------- the matrix as a 4x4 field of columns, drawn in a tilted frame ---------- */
      var tilt = new T.Group(); tilt.position.set(-4.9, 0.0, 0); tilt.rotation.x = -0.98; g.add(tilt);
      var grid = new T.Group(); grid.rotation.z = 0.55; tilt.add(grid);
      var PITCH = 0.8, X0 = -1.5 * PITCH, ZH = 1.55;       // column pitch, first column, height per unit entry
      var base = new T.Mesh(new T.BoxGeometry(4 * PITCH + 0.2, 4 * PITCH + 0.2, 0.06), k.fixed(k.basic(), 'paper2'));
      base.add(k.edges(new T.BoxGeometry(4 * PITCH + 0.2, 4 * PITCH + 0.2, 0.06), 'ink')); base.position.z = -0.03; grid.add(base);
      var cols = [];
      for (i = 0; i < S; i++) for (j = 0; j < S; j++) {
        var cg = new T.Group(), mesh = new T.Mesh(boxGeo, k.fixed(k.basic(), i === j ? 'signal' : 'amber'));
        mesh.add(k.edges(boxGeo, 'ink')); cg.add(mesh);
        cg.position.set(X0 + j * PITCH, -(X0 + i * PITCH), 0);   // row i runs top to bottom, column j left to right
        grid.add(cg); cols.push(cg);
      }

      /* row-sum bars to the right of the matrix, column-sum bars along its front edge, tick at 1 */
      var LEN = 1.15, THICK = 0.26, rbars = [], cbars = [];
      function sumBar(horizontal, idx) {
        var m = k.basic(), mesh = new T.Mesh(boxGeo, m); mesh.add(k.edges(boxGeo, 'ink'));
        var grp = new T.Group(); grp.add(mesh); grid.add(grp);
        if (horizontal) grp.position.set(2 * PITCH + 0.35, -(X0 + idx * PITCH), 0.07);
        else grp.position.set(X0 + idx * PITCH, -2 * PITCH - 0.35, 0.07);
        return { grp: grp, mat: m };
      }
      for (i = 0; i < S; i++) { rbars.push(sumBar(true, i)); cbars.push(sumBar(false, i)); }
      var tickR = new T.Mesh(boxGeo, k.fixed(k.basic(), 'ink')); tickR.scale.set(0.05, 4 * PITCH + 0.1, 0.16);
      tickR.position.set(2 * PITCH + 0.35 + LEN, 0, 0.08); grid.add(tickR);
      var tickC = new T.Mesh(boxGeo, k.fixed(k.basic(), 'ink')); tickC.scale.set(4 * PITCH + 0.1, 0.05, 0.16);
      tickC.position.set(0, -2 * PITCH - 0.35 - LEN, 0.08); grid.add(tickC);

      /* ---------- gradient share per stream (the flat chart on the right) ---------- */
      var CX = 4.9, CB = -1.45, CH = 7.0, bars = [];
      var floor = new T.Mesh(boxGeo, k.fixed(k.basic(), 'ink')); floor.scale.set(4.1, 0.05, 0.1); floor.position.set(CX, CB, 0); g.add(floor);
      for (i = 0; i < S; i++) {
        var bg = new T.Group(), bm = new T.Mesh(boxGeo, k.fixed(k.basic(), 'teal')); bm.add(k.edges(boxGeo, 'ink'));
        bg.add(bm); bg.position.set(CX + (i - 1.5) * 0.95, CB, 0); g.add(bg); bars.push(bg);
      }
      var ref = k.dashed(new T.LineCurve3(k.v3(CX - 2.05, CB + 0.25 * CH, 0.2), k.v3(CX + 2.05, CB + 0.25 * CH, 0.2)), 'signal', 0.95);

      /* arrow: the matrix, applied depth times */
      var shaft = k.edges(new T.BoxGeometry(2.0, 0.001, 0.001), 'ink', 1); shaft.position.set(0.45, 0.05, 0); g.add(shaft);
      var head = new T.Mesh(new T.ConeGeometry(0.2, 0.42, 3), k.fixed(k.basic(), 'ink')); head.rotation.z = -Math.PI / 2; head.position.set(1.45, 0.05, 0); g.add(head);

      /* ---------- labels ---------- */
      k.label('MIXING MATRIX M', -4.9, -2.95, 4.3);
      k.label('GRADIENT SHARE', CX, CB - 0.42, 4.2);
      k.label('AFTER 64 LAYERS', 0.45, 0.62, 3.5);
      k.label('1/s', CX + 2.65, CB + 0.25 * CH, 2.3);
      var tags = [k.label('RAW exp(Z)', -4.9, 2.95, 3.7), k.label('ROWS ÷ SUM', -4.9, 2.95, 3.7), k.label('COLS ÷ SUM', -4.9, 2.95, 3.7), k.label('× 60 STEPS', -4.9, 2.95, 3.7)];
      var ends = [k.label('NOT BALANCED', CX, 2.95, 4.2), k.label('EQUAL SHARES', CX, 2.95, 4.2)];

      /* ---------- simulation state: lerp between keyframes of a matrix, cycling the three seeds ---------- */
      var set = 0, fi = 0, t = 0, phase = 'move';      // phase: move | hold | end | back
      var from = SETS[0][0].M.slice(), cur = from.slice();
      var nextRaw = function () { set = (set + 1) % SETS.length; return SETS[set][0].M; };
      var target = SETS[0][0].M, dur = 0.01, tag = 0, doneBalanced = false;
      var shareNow = stationary(cur);

      function begin(frames, idx) { from = cur.slice(); target = frames[idx].M; dur = frames[idx].dur; tag = frames[idx].tag; t = 0; phase = 'move'; }
      begin(SETS[0], 0);

      function advance() {
        var frames = SETS[set];
        if (phase === 'move') { phase = fi === frames.length - 1 ? 'end' : 'hold'; t = 0; return; }
        if (phase === 'hold') { fi++; begin(frames, fi); return; }
        if (phase === 'end') { var raw = nextRaw(); fi = 0; from = cur.slice(); target = raw; dur = TO_RAW; tag = 0; t = 0; phase = 'back'; return; }
        if (phase === 'back') { fi = 0; phase = 'hold'; t = 0; }
      }

      function step(dt) {
        t += dt;
        var limit = phase === 'move' || phase === 'back' ? dur : phase === 'hold' ? (fi === 0 ? 1.0 : HOLD) : END_HOLD;
        if (phase === 'move' || phase === 'back') {
          var e = ease(t / dur);
          for (var n = 0; n < 16; n++) cur[n] = from[n] + (target[n] - from[n]) * e;
        }
        if (t >= limit) { if (phase === 'move' || phase === 'back') for (var m = 0; m < 16; m++) cur[m] = target[m]; advance(); }
        shareNow = stationary(cur);
      }

      function paint() {
        var s = sums(cur), n, tg = phase === 'back' ? 0 : tag, bal, v;
        for (n = 0; n < 16; n++) { v = Math.max(0.02, cur[n] * ZH); cols[n].scale.set(PITCH * 0.78, PITCH * 0.78, v); cols[n].children[0].position.z = 0.5; }
        for (n = 0; n < S; n++) {
          rbars[n].grp.scale.set(Math.max(0.02, s.r[n] * LEN), THICK, 0.14); rbars[n].grp.children[0].position.x = 0.5;
          cbars[n].grp.scale.set(THICK, Math.max(0.02, s.c[n] * LEN), 0.14); cbars[n].grp.children[0].position.y = -0.5;
          rbars[n].mat.color.copy(Math.abs(s.r[n] - 1) < 0.03 ? P.teal : P.ink2);
          cbars[n].mat.color.copy(Math.abs(s.c[n] - 1) < 0.03 ? P.teal : P.ink2);
          bars[n].scale.set(0.7, Math.max(0.02, shareNow[n] * CH), 0.7); bars[n].children[0].position.y = 0.5;
        }
        bal = (phase === 'end' || (phase === 'move' && tag === 3 && t > dur * 0.6));
        for (n = 0; n < tags.length; n++) tags[n].sprite.visible = n === tg;
        ends[0].sprite.visible = !bal; ends[1].sprite.visible = bal;
      }
      /* bars are rebuilt as boxes whose child sits at +0.5 so they grow from the base */
      for (i = 0; i < 16; i++) cols[i].children[0].position.z = 0.5;
      for (i = 0; i < S; i++) { bars[i].children[0].position.set(0, 0.5, 0); }

      /* reduced motion: show the settled end state, once */
      if (reduce) {
        cur = SETS[0][SETS[0].length - 1].M.slice(); target = cur; phase = 'end'; tag = 3; shareNow = stationary(cur);
      }
      return { step: step, paint: paint };
    }
  });
})();
