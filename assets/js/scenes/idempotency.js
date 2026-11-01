/* Idempotency keys: the same flaky link, the same retry, two outcomes.
   Top lane has no key, so the retry is a second debit. Bottom lane sends an Idempotency-Key,
   the server finds it in its key store and replays the saved result. */
SceneKit.mount({
  canvas: 'scene3d',
  fit: { w: 16.6, h: 6.3 },
  warmup: 600,                       // reduced-motion frame = the end state (t = 10 s)
  build: function (k) {
    var THREE = k.THREE, g = k.g, V = k.v3;
    var T = 11.4, cur = 0;
    var XC = -6.3, XB = -3.1, XS = 0.5, XK = 3.2, COIN_X = [5.6, 6.2, 6.8];

    function seg(t, a, b) { return k.ease((t - a) / (b - a)); }
    function win(t, a, b) { return t > a && t < b ? 1 : 0; }
    function lerp(a, b, t) { return a + (b - a) * t; }

    function fill(w, h, role, x, y, z, a) {
      var m = k.fixed(k.basic(), role);
      if (a !== undefined) { m.transparent = true; m.opacity = a; }
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.position.set(x, y, z || 0); g.add(mesh); return mesh;
    }
    function frame(w, h, x, y, role, op) {
      var e = k.edges(new THREE.BoxGeometry(w, h, 0.02), role || 'ink', op);
      e.position.set(x, y, 0.05); g.add(e); return e;
    }
    function link(x0, x1, y) {
      k.dashed(new THREE.LineCurve3(V(x0, y), V(x1, y)), 'ink2', 0.8);
    }
    function packet(role, keyed) {
      var grp = new THREE.Group();
      var f = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), k.fixed(k.basic(), role));
      grp.add(f); grp.add(k.edges(new THREE.BoxGeometry(0.4, 0.4, 0.02), 'ink'));
      if (keyed) {
        var c = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), k.fixed(k.basic(), 'amber'));
        c.position.set(0, 0.34, 0); grp.add(c);
        var ce = k.edges(new THREE.BoxGeometry(0.16, 0.16, 0.02), 'ink'); ce.position.set(0, 0.34, 0.01); grp.add(ce);
      }
      grp.position.z = 0.4; grp.visible = false; g.add(grp); return grp;
    }

    function lane(y0, keyed, tag, result) {
      var L = { y: y0 };
      // nodes
      fill(1.3, 1.1, 'paper2', XC, y0); frame(1.3, 1.1, XC, y0);
      fill(1.5, 1.1, 'paper2', XS, y0); frame(1.5, 1.1, XS, y0);
      L.cFlash = fill(1.3, 1.1, 'amber', XC, y0, 0.03, 0);
      L.cOk = fill(1.3, 1.1, 'teal', XC, y0, 0.03, 0);
      L.sFlash = fill(1.5, 1.1, 'signal', XS, y0, 0.03, 0);
      // link with a break
      link(XC + 0.8, XB - 0.35, y0); link(XB + 0.35, XS - 0.9, y0);
      var zig = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(XB - 0.3, y0), V(XB - 0.1, y0 + 0.28), V(XB + 0.1, y0 - 0.28), V(XB + 0.3, y0)]), k.lineMat('ink2', 1));
      g.add(zig);
      var xm = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(XB - 0.3, y0 - 0.5), V(XB + 0.3, y0 + 0.1), V(XB - 0.3, y0 + 0.1), V(XB + 0.3, y0 - 0.5)]), k.lineMat('signal', 0.99));
      xm.material.transparent = true; xm.material.opacity = 0; xm.position.z = 0.3; g.add(xm); L.cross = xm;
      // key store
      if (keyed) {
        fill(1.4, 1.1, 'paper2', XK, y0); frame(1.4, 1.1, XK, y0);
        link(XS + 0.8, XK - 0.72, y0);
        L.kFlash = fill(1.4, 1.1, 'teal', XK, y0, 0.03, 0);
        L.chip = new THREE.Group();
        L.chip.add(new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), k.fixed(k.basic(), 'amber')));
        L.chip.add(k.edges(new THREE.BoxGeometry(0.36, 0.36, 0.02), 'ink'));
        L.chip.position.set(XK, y0, 0.2); g.add(L.chip);
      }
      // coins (balance)
      L.coins = []; L.ghosts = [];
      for (var i = 0; i < 3; i++) {
        var c = new THREE.Group();
        c.add(new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), k.fixed(k.basic(), 'amber')));
        c.add(k.edges(new THREE.BoxGeometry(0.46, 0.46, 0.02), 'ink'));
        c.position.set(COIN_X[i], y0, 0.1); g.add(c); L.coins.push(c);
        var gh = k.edges(new THREE.BoxGeometry(0.46, 0.46, 0.02), i === 1 && !keyed ? 'signal' : 'ink2', 0.6);
        gh.position.set(COIN_X[i], y0, 0.05); g.add(gh); L.ghosts.push(gh);
      }
      L.tag = k.label(tag, XB, y0 + 0.8, 3.3);
      L.res = k.label(result, 6.0, y0 + 0.8, keyed ? 4.0 : 4.3);
      L.req1 = packet('amber', keyed); L.req2 = packet('signal', keyed);
      L.rsp1 = packet('teal', false); L.rsp2 = packet('teal', false);
      L.keyed = keyed;
      return L;
    }

    var A = lane(1.5, false, 'NO KEY', 'CHARGED TWICE');
    var B = lane(-1.5, true, 'WITH KEY', 'CHARGED ONCE');
    k.label('CLIENT', XC, -2.95, 2.7); k.label('SERVER', XS, -2.95, 2.7);
    k.label('KEY STORE', XK + 0.2, -2.95, 3.3); k.label('BALANCE', 6.4, -2.95, 3.0);

    function place(p, x, y, on) { p.visible = !!on; p.position.x = x; p.position.y = y; }
    function setA(m, v) { m.material.opacity = v; }

    function update(L, t) {
      var y = L.y, back = seg(t, 10.6, 11.0);
      // request 1 out, response 1 lost at the break
      var r1 = seg(t, 0.6, 2.0);
      place(L.req1, lerp(XC + 0.9, XS - 0.95, r1), y + 0.22, t > 0.6 && t < 2.0);
      var q = seg(t, 2.6, 3.7);
      place(L.rsp1, lerp(XS - 0.95, XB + 0.2, q), y - 0.22, t > 2.6 && t < 3.7);
      var lost = win(t, 3.7, 4.6) * (1 - seg(t, 4.0, 4.6));
      setA(L.cross, lost);
      // server flashes on work
      var work1 = win(t, 2.0, 2.5) * (1 - seg(t, 2.0, 2.5));
      var work2 = L.keyed ? 0 : win(t, 7.4, 8.1) * (1 - seg(t, 7.4, 8.1));
      setA(L.sFlash, Math.max(work1, work2) * 0.8);
      // client waits (timeout), then gets the answer
      setA(L.cFlash, win(t, 4.4, 6.0) * (0.35 + 0.3 * Math.sin((t - 4.4) * 7)));
      // retry out
      var r2 = seg(t, 6.0, 7.4);
      place(L.req2, lerp(XC + 0.9, XS - 0.95, r2), y + 0.22, t > 6.0 && t < 7.4);
      // reply 2 reaches the client
      var s2 = seg(t, 8.1, 9.7);
      place(L.rsp2, lerp(XS - 0.95, XC + 0.9, s2), y - 0.22, t > 8.1 && t < 9.7);
      setA(L.cOk, seg(t, 9.7, 10.0) * (1 - back) * 0.85);
      // balance
      var s1 = 1 - seg(t, 2.0, 2.5) + back;
      var sB = L.keyed ? 1 : 1 - seg(t, 7.4, 7.9) + back;
      // index 0 = leftmost coin; the first debit takes the rightmost (index 2), a second one the middle
      var scale = [1, Math.min(1, sB), Math.min(1, s1)];
      for (var i = 0; i < 3; i++) {
        var s = Math.max(0.001, scale[i]);
        L.coins[i].scale.set(s, s, 1);
        var gs = 1 - scale[i];
        L.ghosts[i].scale.set(Math.max(0.001, gs), Math.max(0.001, gs), 1);
      }
      // result text
      var shown = seg(t, 8.4, 8.9) * (1 - back);
      L.res.sprite.material.opacity = shown;
      // key store behaviour
      if (L.keyed) {
        var rec = seg(t, 2.0, 2.6) * (1 - back);
        L.chip.scale.setScalar(Math.max(0.001, rec * (1 + 0.25 * win(t, 7.4, 8.1) * Math.sin((t - 7.4) * 9))));
        setA(L.kFlash, win(t, 7.4, 8.1) * 0.7);
      }
    }

    return {
      step: function (dt, clock) { cur = clock; },
      paint: function () { var t = cur % T; update(A, t); update(B, t); }
    };
  }
});
