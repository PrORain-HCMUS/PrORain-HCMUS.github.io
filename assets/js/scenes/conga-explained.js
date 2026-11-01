/* CONGA, explained: HISTORY scrolls by, older items fold into a MEMORY bank, a sequence MODEL reads the
   recent window plus the memory, and a ranked TOP-K list comes out. Uses the shared SceneKit (scene-kit.js). */
SceneKit.mount({
  canvas: 'scene3d',
  fit: { w: 16.6, h: 6.3 },
  build: function (k) {
    var THREE = k.THREE, g = k.g, P = k.P, v3 = k.v3, ease = k.ease, i;

    /* layout (world units; drawing spans x -8..8, y -2.8..2.8) */
    var SP = 0.78, X_NEW = 1.24, WINDOW = 5, VISIBLE = 9;
    var MEM = { x: -7.0, y: 0.1 }, ENC_X = [2.45, 2.85, 3.25];
    var BAR_X = 5.25, THUMB_X = 4.78, BAR_BASE = [1.0, 0.8, 0.62, 0.47, 0.35], BAR_MAX = 2.55;
    var ROLES = k.colorRoles;

    /* memory bank: 4x4 cells in an outlined box */
    var bankGeo = new THREE.BoxGeometry(1.95, 1.95, 0.5);
    var bank = k.edges(bankGeo, 'ink'); bank.position.set(MEM.x, MEM.y, -0.1); g.add(bank);
    var cellGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32), cells = [];
    for (i = 0; i < 16; i++) {
      var cm = k.basic(), cell = new THREE.Mesh(cellGeo, cm); cell.add(k.edges(cellGeo, 'ink', 0.8));
      cell.position.set(MEM.x + (i % 4 - 1.5) * 0.42, MEM.y + (1.5 - Math.floor(i / 4)) * 0.42, 0);
      g.add(cell); cells.push({ mesh: cell, mat: cm, fill: 0, flash: 0 });
    }
    var cellIdx = 0;

    /* item cards: the user's history */
    var cardGeo = new THREE.BoxGeometry(0.62, 0.84, 0.1), picGeo = new THREE.BoxGeometry(0.46, 0.4, 0.06);
    var cards = [];
    for (i = 0; i < 10; i++) {
      var grp = new THREE.Group();
      var body = new THREE.Mesh(cardGeo, k.fixed(k.basic(), 'paper')); body.add(k.edges(cardGeo, 'ink')); grp.add(body);
      var picMat = k.basic(), pic = new THREE.Mesh(picGeo, picMat); pic.position.set(0, 0.12, 0.08); pic.add(k.edges(picGeo, 'ink', 0.9)); grp.add(pic);
      var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.02), k.fixed(k.basic(), 'ink2')); l1.position.set(0, -0.2, 0.07); grp.add(l1);
      var l2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.02), k.fixed(k.basic(), 'ink2')); l2.position.set(-0.07, -0.3, 0.07); grp.add(l2);
      g.add(grp);
      cards.push({ g: grp, picMat: picMat, role: ROLES[i % 4], from: i, to: i, a: i });
    }

    /* attention arcs from the newest item back over the history */
    var arcs = [];
    for (i = 1; i <= VISIBLE - 1; i++) {
      var ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 3), 3));
      var am = k.lineMat('signal', 0.5); am.transparent = true;
      var al = new THREE.Line(ag, am); al.frustumCulled = false; g.add(al); arcs.push({ line: al, mat: am, geo: ag });
    }

    /* recent-window bracket */
    var bx0 = X_NEW - (WINDOW - 1) * SP - 0.45, bx1 = X_NEW + 0.45, by = -0.7;
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(bx0, by + 0.12), v3(bx0, by), v3(bx1, by), v3(bx1, by + 0.12)]), k.lineMat('ink', 1)));

    /* sequence model: three slabs */
    var slabGeo = new THREE.BoxGeometry(0.16, 1.9, 1.0), slabs = [], slabRoles = ['paper2', 'amber', 'signal'];
    for (i = 0; i < 3; i++) {
      var sm = k.basic(), sl = new THREE.Mesh(slabGeo, sm); sl.add(k.edges(slabGeo, 'ink'));
      sl.position.set(ENC_X[i], 0, -0.1 + i * 0.1); g.add(sl); slabs.push({ mesh: sl, mat: sm, role: slabRoles[i], flash: 0 });
    }

    /* ranked top-K list */
    var barGeo = new THREE.BoxGeometry(1, 0.4, 0.12); barGeo.translate(0.5, 0, 0);
    var thumbGeo = new THREE.BoxGeometry(0.36, 0.36, 0.1), bars = [];
    for (i = 0; i < 5; i++) {
      var y = 1.4 - i * 0.7, bm = k.basic(), bmesh = new THREE.Mesh(barGeo, bm); bmesh.add(k.edges(barGeo, 'ink'));
      bmesh.position.set(BAR_X, y, 0); bmesh.scale.x = 0.15; g.add(bmesh);
      var tm = k.basic(), tmesh = new THREE.Mesh(thumbGeo, tm); tmesh.add(k.edges(thumbGeo, 'ink'));
      tmesh.position.set(THUMB_X, y, 0); g.add(tmesh);
      bars.push({ mesh: bmesh, mat: bm, thumb: tmesh, tmat: tm, len: 0.15, target: 0.15, role: ROLES[i % 4], flash: 0 });
    }

    /* wires */
    var memArc = new THREE.QuadraticBezierCurve3(v3(MEM.x, MEM.y + 1.05, 0), v3(-2.2, 3.5, 0), v3(ENC_X[0], 0.95, 0));
    k.dashed(memArc, 'ink2', 0.6);
    var inCurve = new THREE.QuadraticBezierCurve3(v3(X_NEW + 0.4, 0, 0.1), v3(2.0, 0.55, 0.2), v3(ENC_X[0] - 0.2, 0, 0));
    var outCurves = bars.map(function (b) {
      var c = new THREE.QuadraticBezierCurve3(v3(ENC_X[2] + 0.15, 0, 0), v3(4.0, b.mesh.position.y * 0.4, 0.2), v3(THUMB_X - 0.3, b.mesh.position.y, 0));
      k.dashed(c, 'ink2', 0.55); return c;
    });

    k.label('MEMORY', MEM.x, -1.5, 2.2);
    k.label('HISTORY', -4.1, -1.25, 2.2);
    k.label('RECENT WINDOW', X_NEW - 1.5 * SP - 0.2, -1.25, 3.2);
    k.label('MODEL', 2.85, -1.55, 2.0);
    k.label('TOP-K', 6.35, -2.3, 2.2);

    /* a little dust in the background */
    var dustGeo = new THREE.BufferGeometry(), pts = [];
    for (i = 0; i < 70; i++) pts.push((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 7.5, -1.2 - Math.random() * 2);
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.Points(dustGeo, k.fixed(new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.4 }), 'ink2')));

    /* simulation */
    var PERIOD = 2.4, HOP = 0.5, ABSORB = 1.0;
    var clock = 0, tt = PERIOD - 0.3, absorbed = true;

    function lightCell() {
      var c = cells[cellIdx % 16]; c.flash = 1; c.fill = Math.min(1, c.fill + 0.5); cellIdx++;
      if (cellIdx % 16 === 0) for (var j = 0; j < 16; j++) cells[j].fill = 0;
    }
    function cellPos(idx) { var c = cells[idx % 16].mesh.position; return v3(c.x, c.y, c.z); }

    function tick() {
      tt = 0; absorbed = false;
      var j, c;
      for (j = 0; j < cards.length; j++) {
        c = cards[j];
        if (c.to === 9) { c.from = -1; c.to = 0; c.role = ROLES[Math.floor(Math.random() * 4)]; }
        else { c.from = c.to; c.to = c.to + 1; }
      }
      k.send(inCurve, 0.7, function () {
        for (var s = 0; s < 3; s++) slabs[s].flash = 1;
        for (var r = 0; r < 5; r++) (function (r) {
          k.send(outCurves[r], 0.7 + r * 0.1, function () {
            var b = bars[r];
            b.target = BAR_BASE[r] * (0.88 + 0.12 * Math.random()) * BAR_MAX; b.flash = 1;
            b.role = ROLES[(r + Math.floor(clock * 7)) % 4];
          }, r === 0);
        })(r);
      }, true);
      for (j = 0; j < bars.length; j++) bars[j].target = 0.18;
      if (Math.floor(clock / PERIOD) % 2 === 0) k.send(memArc, 1.6, function () { slabs[0].flash = 1; }, false);
    }

    function paint() {
      var j, c, b, s, col = new THREE.Color();
      for (j = 0; j < cards.length; j++) {
        c = cards[j];
        var aEff = c.from + (c.to - c.from) * ease(tt / HOP);
        var dim = Math.max(0, Math.min(1, (aEff - (WINDOW - 1.5)) / 1.5));
        col.copy(P[c.role]).lerp(P.paper2, dim * 0.75);
        c.picMat.color.copy(col);
      }
      for (j = 0; j < cells.length; j++) {
        var ce = cells[j];
        ce.mat.color.copy(P.paper2).lerp(P.amber, ce.fill * 0.85).lerp(P.signal, ce.flash * 0.8);
        ce.mesh.scale.setScalar(1 + ce.flash * 0.25);
      }
      for (j = 0; j < slabs.length; j++) {
        s = slabs[j]; s.mat.color.copy(P[s.role]).lerp(P.signal, Math.min(1, s.flash) * 0.6);
        s.mesh.scale.y = 1 + Math.min(1, s.flash) * 0.06;
      }
      for (j = 0; j < bars.length; j++) {
        b = bars[j];
        b.mesh.scale.x = Math.max(0.05, b.len);
        b.mat.color.copy(j === 0 ? P.amber : P.paper2).lerp(P.signal, b.flash * 0.55);
        b.tmat.color.copy(P[b.role]).lerp(P.signal, b.flash * 0.3);
        b.thumb.scale.setScalar(1 + b.flash * 0.2);
      }
    }

    function placeCards() {
      var j, c, h = ease(tt / HOP), e = ease(tt / ABSORB), x, sc;
      for (j = 0; j < cards.length; j++) {
        c = cards[j];
        if (c.to === 9) {                            // folding into the memory bank
          var t0 = v3(X_NEW - 8 * SP, 0, 0), tp = cellPos(cellIdx), mid = v3((t0.x + tp.x) / 2, 1.5, 0.3);
          c.g.position.copy(new THREE.QuadraticBezierCurve3(t0, mid, tp).getPoint(e));
          c.g.scale.setScalar(Math.max(0.001, 1 - 0.85 * e)); c.g.rotation.z = e * 0.9;
          if (tt >= ABSORB && !absorbed) { absorbed = true; lightCell(); }
          if (absorbed && tt >= ABSORB) c.g.scale.setScalar(0.001);
          continue;
        }
        c.g.rotation.z = 0;
        var a = c.from + (c.to - c.from) * h;
        x = X_NEW - a * SP; sc = c.from < 0 ? h : 1;
        c.g.position.set(x, 0, 0); c.g.scale.setScalar(Math.max(0.001, sc)); c.a = a;
      }
      var newest = null; for (j = 0; j < cards.length; j++) if (cards[j].to === 0) newest = cards[j];
      var nx = newest ? newest.g.position.x : X_NEW, n = 0;
      for (j = 0; j < cards.length; j++) {
        c = cards[j]; if (c === newest || c.to === 9) continue;
        var arc = arcs[n++]; if (!arc) break;
        var tx = c.g.position.x, dx = nx - tx, hgt = 0.7 + 0.3 * Math.abs(dx);
        var arr = arc.geo.attributes.position.array;
        for (var s = 0; s < 22; s++) {
          var u = s / 21;
          arr[s * 3] = nx + (tx - nx) * u; arr[s * 3 + 1] = 0.5 + 4 * u * (1 - u) * hgt * 0.5; arr[s * 3 + 2] = 0.2;
        }
        arc.geo.attributes.position.needsUpdate = true;
        arc.mat.opacity = (c.to < WINDOW ? 0.95 : 0.5) * (0.7 + 0.3 * Math.sin(clock * 2 + n)) * Math.min(1, c.g.scale.x + 0.2);
      }
      for (; n < arcs.length; n++) arcs[n].mat.opacity = 0;
    }

    tick();   // start mid-cycle so the first frame already shows a full history

    return {
      step: function (dt) {
        clock += dt; tt += dt;
        if (tt >= PERIOD) tick();
        var j;
        for (j = 0; j < cells.length; j++) cells[j].flash = Math.max(0, cells[j].flash - dt * 1.8);
        for (j = 0; j < slabs.length; j++) slabs[j].flash = Math.max(0, slabs[j].flash - dt * 1.6);
        for (j = 0; j < bars.length; j++) {
          var b = bars[j]; b.len += (b.target - b.len) * Math.min(1, dt * 6); b.flash = Math.max(0, b.flash - dt * 1.4);
        }
        placeCards();
      },
      paint: paint
    };
  }
});
