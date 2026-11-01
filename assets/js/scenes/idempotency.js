/* Idempotency keys: the same flaky link, the same retry, two outcomes.
   Top lane has no key, so every retry is another debit. Bottom lane sends an Idempotency-Key,
   the server finds it in its key store and replays the saved result.
   Guide it: the loss slider sets how often a reply is lost (0, 1 or 2 retries are drawn per round),
   and the lane switch shows both lanes or just one. */
var api = {};                         // set by build(); the controls below call into it
SceneKit.mount({
  canvas: 'scene3d',
  fit: { w: 16.6, h: 6.3 },
  warmup: 600,                       // reduced-motion frame = the end state of the first round (1 lost reply)
  controls: [
    { id: 'loss', type: 'range', label: 'Reply lost', min: 0, max: 100, step: 5, value: 60, fmt: function (v) { return v + '%'; },
      onChange: function () { if (api.resample) api.resample(); } },
    { id: 'lane', type: 'seg', label: 'Show', value: 'both', options: [{ v: 'both', t: 'Both' }, { v: 'nokey', t: 'No key' }, { v: 'key', t: 'With key' }],
      onChange: function () { if (api.layout) api.layout(); } }
  ],
  build: function (k) {
    var THREE = k.THREE, g = k.g, V = k.v3;
    var XC = -6.3, XB = -3.1, XS = 0.5, XK = 3.2, COIN_X = [5.6, 6.2, 6.8];
    var ATT = 5.4;                                  // seconds per lost attempt
    var cur = 0, start = 0, Lc = 1, T = 11.4, cycle = 0, hold = null;

    function seg(t, a, b) { return k.ease((t - a) / (b - a)); }
    function win(t, a, b) { return t > a && t < b ? 1 : 0; }
    function lerp(a, b, t) { return a + (b - a) * t; }

    // one lane = one group, so the lane switch can hide / re-centre it
    var LG;
    function add(o) { LG.add(o); return o; }
    function fill(w, h, role, x, y, z, a) {
      var m = k.fixed(k.basic(), role);
      if (a !== undefined) { m.transparent = true; m.opacity = a; }
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.position.set(x, y, z || 0); return add(mesh);
    }
    function frame(w, h, x, y, role, op) {
      var e = k.edges(new THREE.BoxGeometry(w, h, 0.02), role || 'ink', op);
      e.position.set(x, y, 0.05); return add(e);
    }
    function link(x0, x1, y) { add(k.dashed(new THREE.LineCurve3(V(x0, y), V(x1, y)), 'ink2', 0.8)); }
    function packet(role, keyed) {
      var grp = new THREE.Group();
      var f = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), k.fixed(k.basic(), role));
      grp.add(f); grp.add(k.edges(new THREE.BoxGeometry(0.4, 0.4, 0.02), 'ink'));
      if (keyed) {
        var c = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), k.fixed(k.basic(), 'amber'));
        c.position.set(0, 0.34, 0); grp.add(c);
        var ce = k.edges(new THREE.BoxGeometry(0.16, 0.16, 0.02), 'ink'); ce.position.set(0, 0.34, 0.01); grp.add(ce);
      }
      grp.position.z = 0.4; grp.visible = false; add(grp); return grp;
    }

    function lane(y0, keyed, tag, result) {
      var L = { y: y0, keyed: keyed };
      LG = L.g = new THREE.Group(); g.add(L.g);
      fill(1.3, 1.1, 'paper2', XC, y0); frame(1.3, 1.1, XC, y0);
      fill(1.5, 1.1, 'paper2', XS, y0); frame(1.5, 1.1, XS, y0);
      L.cFlash = fill(1.3, 1.1, 'amber', XC, y0, 0.03, 0);
      L.cOk = fill(1.3, 1.1, 'teal', XC, y0, 0.03, 0);
      L.sFlash = fill(1.5, 1.1, 'signal', XS, y0, 0.03, 0);
      link(XC + 0.8, XB - 0.35, y0); link(XB + 0.35, XS - 0.9, y0);
      var zig = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(XB - 0.3, y0), V(XB - 0.1, y0 + 0.28), V(XB + 0.1, y0 - 0.28), V(XB + 0.3, y0)]), k.lineMat('ink2', 1));
      add(zig);
      var xm = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(XB - 0.3, y0 - 0.5), V(XB + 0.3, y0 + 0.1), V(XB - 0.3, y0 + 0.1), V(XB + 0.3, y0 - 0.5)]), k.lineMat('signal', 0.99));
      xm.material.transparent = true; xm.material.opacity = 0; xm.position.z = 0.3; add(xm); L.cross = xm;
      if (keyed) {
        fill(1.4, 1.1, 'paper2', XK, y0); frame(1.4, 1.1, XK, y0);
        link(XS + 0.8, XK - 0.72, y0);
        L.kFlash = fill(1.4, 1.1, 'teal', XK, y0, 0.03, 0);
        L.chip = new THREE.Group();
        L.chip.add(new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), k.fixed(k.basic(), 'amber')));
        L.chip.add(k.edges(new THREE.BoxGeometry(0.36, 0.36, 0.02), 'ink'));
        L.chip.position.set(XK, y0, 0.2); add(L.chip);
      }
      L.coins = []; L.ghosts = [];
      for (var i = 0; i < 3; i++) {
        var c = new THREE.Group();
        c.add(new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), k.fixed(k.basic(), 'amber')));
        c.add(k.edges(new THREE.BoxGeometry(0.46, 0.46, 0.02), 'ink'));
        c.position.set(COIN_X[i], y0, 0.1); add(c); L.coins.push(c);
        var gh = k.edges(new THREE.BoxGeometry(0.46, 0.46, 0.02), i === 1 && !keyed ? 'signal' : 'ink2', 0.6);
        gh.position.set(COIN_X[i], y0, 0.05); add(gh); L.ghosts.push(gh);
      }
      L.tag = k.label(tag, XB, y0 + 0.8, 3.3); add(L.tag.sprite);
      L.res = k.label(result, 6.0, y0 + 0.8, keyed ? 4.0 : 4.6, { size: 40 }); add(L.res.sprite);
      L.req = [packet('amber', keyed), packet('signal', keyed), packet('signal', keyed)];
      L.rsp = [packet('teal', false), packet('teal', false), packet('teal', false)];
      return L;
    }

    var A = lane(1.5, false, 'NO KEY', 'CHARGED TWICE');
    var B = lane(-1.5, true, 'WITH KEY', 'CHARGED ONCE');
    k.label('CLIENT', XC, -2.95, 2.7); k.label('SERVER', XS, -2.95, 2.7);
    k.label('KEY STORE', XK + 0.2, -2.95, 3.3); k.label('BALANCE', 6.4, -2.95, 3.0);
    var retries = k.label('1 RETRY', 0.5, 3.0, 3.0, { size: 40, role: 'signal' });

    function place(p, x, y, on) { p.visible = !!on; p.position.x = x; p.position.y = y; }
    function setA(m, v) { m.material.opacity = v; }

    // number of lost replies for the next round (0, 1 or 2), seeded so every visit looks the same
    var seed = 7;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    function sample() {
      var p = k.state.loss / 100;
      return rnd() < p ? (rnd() < p ? 2 : 1) : 0;
    }
    var texts = ['CHARGED ONCE', 'CHARGED TWICE', 'CHARGED 3 TIMES'];
    function begin(n) {
      Lc = n; T = 6.0 + ATT * n; start = cur;
      k.setLabel(A.res, texts[n]); k.setLabel(retries, n === 0 ? 'NO RETRY NEEDED' : n === 1 ? '1 RETRY' : '2 RETRIES');
    }
    api.resample = function () {
      var n = sample();
      if (n !== Lc) begin(n);
      hold = 'end';                                 // while paused, show the finished round
    };
    api.layout = function () {
      var m = k.state.lane;
      A.g.visible = m !== 'key'; B.g.visible = m !== 'nokey';
      A.g.position.y = m === 'nokey' ? -1.5 : 0; B.g.position.y = m === 'key' ? 1.5 : 0;
    };

    function update(L, t) {
      var y = L.y, back = seg(t, T - 0.8, T - 0.4), j, s;
      var work = 0, hit = 0, waiting = 0, lostFx = 0;
      for (j = 0; j <= Lc; j++) {
        s = 0.6 + ATT * j;
        var isLast = j === Lc, req = L.req[j], rsp = L.rsp[j];
        place(req, lerp(XC + 0.9, XS - 0.95, seg(t, s, s + 1.4)), y + 0.22, t > s && t < s + 1.4);
        if (isLast) {
          place(rsp, lerp(XS - 0.95, XC + 0.9, seg(t, s + 2.1, s + 3.7)), y - 0.22, t > s + 2.1 && t < s + 3.7);
        } else {
          place(rsp, lerp(XS - 0.95, XB + 0.2, seg(t, s + 2.0, s + 3.1)), y - 0.22, t > s + 2.0 && t < s + 3.1);
          lostFx = Math.max(lostFx, win(t, s + 3.1, s + 4.0) * (1 - seg(t, s + 3.4, s + 4.0)));
          waiting = Math.max(waiting, win(t, s + 3.8, s + 5.4) * (0.35 + 0.3 * Math.sin((t - s - 3.8) * 7)));
        }
        var w = win(t, s + 1.4, s + 1.9) * (1 - seg(t, s + 1.4, s + 1.9));
        if (j === 0 || !L.keyed) work = Math.max(work, w);
        else hit = Math.max(hit, win(t, s + 1.4, s + 2.1));
      }
      setA(L.cross, lostFx);
      setA(L.sFlash, work * 0.8);
      setA(L.cFlash, waiting);
      var sL = 0.6 + ATT * Lc;
      setA(L.cOk, seg(t, sL + 3.7, sL + 4.0) * (1 - back) * 0.85);
      // balance: attempt j debits coin (2 - j); the key lane only ever debits the first
      for (var i = 0; i < 3; i++) {
        var jj = 2 - i, sc = 1;
        if (jj <= Lc && (!L.keyed || jj === 0)) sc = Math.min(1, 1 - seg(t, 0.6 + ATT * jj + 1.4, 0.6 + ATT * jj + 1.9) + back);
        var s2 = Math.max(0.001, sc);
        L.coins[i].scale.set(s2, s2, 1);
        var gs = Math.max(0.001, 1 - sc);
        L.ghosts[i].scale.set(gs, gs, 1);
      }
      L.res.sprite.material.opacity = seg(t, sL + 2.4, sL + 2.9) * (1 - back);
      if (L.keyed) {
        var rec = seg(t, 2.0, 2.6) * (1 - back);
        L.chip.scale.setScalar(Math.max(0.001, rec * (1 + 0.25 * hit * Math.sin(t * 9))));
        setA(L.kFlash, hit * 0.7);
      }
    }

    api.layout();
    begin(1);                                        // first round: the classic story, one lost reply
    return {
      step: function (dt, clock) {
        cur = clock; hold = null;
        if (cur - start >= T) { start += T; cycle++; begin(sample()); }
      },
      paint: function () {
        var t = hold === 'end' ? T - 0.6 : Math.max(0, cur - start);
        update(A, t); update(B, t);
      }
    };
  }
});
