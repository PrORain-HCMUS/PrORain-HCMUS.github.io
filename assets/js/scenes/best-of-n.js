/* Best-of-n: n answers are sampled, each gets a reward, the highest is kept. The gauges show the exact
   expectations for a toy Gaussian reward: E[max of n] and the KL bill ln n - (n-1)/n.
   Cycles n = 1, 4, 16, 64 (the table in the post). Built on SceneKit.
   Guidable: pick n (or leave it on Auto), and add grader noise sigma. Bars show the grader's score; the dark tick on each bar
   is the answer's true quality. The winner is the highest score, and the REWARD gauge shows its expected TRUE quality,
   E[max of n] / sqrt(1 + sigma^2), which equals the table's numbers at sigma = 0. */
var bonApi = {};
SceneKit.mount({
  canvas: 'scene3d',
  fit: { w: 16.6, h: 7.0 },
  lift: 0.5,
  warmup: 0,
  controls: [
    { id: 'n', type: 'seg', label: 'n', value: 'auto', options: [{ v: 'auto', t: 'Auto' }, { v: '1', t: '1' }, { v: '4', t: '4' }, { v: '16', t: '16' }, { v: '64', t: '64' }],
      onChange: function (v) { if (bonApi.pickN) bonApi.pickN(v); } },
    { id: 'sigma', type: 'range', label: 'grader noise', min: 0, max: 2, step: 0.05, value: 0, fmt: function (v) { return v.toFixed(2); } },
    { type: 'button', label: 'Resample', onClick: function () { if (bonApi.resample) bonApi.resample(); } }
  ],
  build: function (k) {
    var THREE = k.THREE, g = k.g, P = k.P, ease = k.ease;

    var NS = [1, 4, 16, 64];
    var REWARD = [0, 1.0294, 1.766, 2.3437];       // E[max of n standard normals]
    var KL = [0, 0.6363, 1.8351, 3.1745];          // ln n - (n-1)/n
    var SPREAD = [1.5, 5.0, 8.6, 9.0];             // width of the row of answers per n
    var BASE = -2.2, CX = -2.0, GX = 3.75, GW = 3.9;
    var T_GROW = 0.9, T_PICK = 1.25, T_HOLD = 3.6, T_END = 4.15;
    var FONT = '700 64px "Space Grotesk", "Segoe UI", sans-serif';

    function rng(seed) {
      return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

    /* ---- own text sprites: sized by their text, so they stay legible when the scene is scaled down ---- */
    var tags = [];
    function tag(text, x, y, h, align) {
      var c = document.createElement('canvas'); c.height = 96; c.width = 64;
      var tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      s.position.set(x, y, 0.5); g.add(s);
      var t = { text: text, x: x, y: y, h: h, align: align || 'center', canvas: c, tex: tex, sprite: s };
      tags.push(t); drawTag(t); return t;
    }
    function drawTag(t) {
      var c = t.canvas, ctx = c.getContext('2d');
      ctx.font = FONT;
      var w = Math.ceil(ctx.measureText(t.text).width) + 14;
      c.width = w; c.height = 96;
      ctx = c.getContext('2d');
      ctx.font = FONT; ctx.fillStyle = '#' + P.ink.getHexString();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.text, w / 2, 50);
      t.tex.needsUpdate = true;
      var ww = t.h * w / 96;
      t.sprite.scale.set(ww, t.h, 1);
      t.sprite.position.x = t.align === 'left' ? t.x + ww / 2 : t.align === 'right' ? t.x - ww / 2 : t.x;
    }
    function redrawTags() { for (var q = 0; q < tags.length; q++) drawTag(tags[q]); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawTags);

    /* ---- the 64 reusable answer bars: unit box, origin at its foot ---- */
    var barGeo = new THREE.BoxGeometry(1, 1, 0.3); barGeo.translate(0, 0.5, 0);
    var bars = [], i;
    for (i = 0; i < 64; i++) {
      var grp = new THREE.Group(), mat = k.basic();
      grp.add(new THREE.Mesh(barGeo, mat));
      grp.add(k.edges(barGeo, 'ink'));
      grp.visible = false; g.add(grp);
      bars.push({ grp: grp, mat: mat, th: 0, e: 0, s: 0, ht: 0, r: 0, h: 0, x: 0, w: 0 });
    }

    /* true-quality ticks: a thin dark bar across each answer, shown once the grader is noisy */
    var tickGeo = new THREE.PlaneGeometry(1, 1), ticks = [];
    for (i = 0; i < 64; i++) {
      var tk = new THREE.Mesh(tickGeo, k.fixed(k.basic(), 'ink'));
      tk.visible = false; g.add(tk); ticks.push(tk);
    }

    /* crown over the winner */
    var tri = new THREE.Shape(); tri.moveTo(-0.3, 0); tri.lineTo(0.3, 0); tri.lineTo(0, 0.5); tri.closePath();
    var crownGeo = new THREE.ShapeGeometry(tri), crownMat = k.basic();
    var crown = new THREE.Group(); crown.add(new THREE.Mesh(crownGeo, crownMat)); crown.add(k.edges(crownGeo, 'ink'));
    crown.visible = false; g.add(crown);

    /* dashed level line at the winner's height */
    var level = k.dashed(new THREE.LineCurve3(k.v3(-7.0, 0, 0), k.v3(2.9, 0, 0)), 'signal', 0.9);
    level.visible = false;

    /* baseline */
    var baseGeo = new THREE.BufferGeometry().setFromPoints([k.v3(-7.0, BASE, 0), k.v3(2.9, BASE, 0)]);
    g.add(new THREE.Line(baseGeo, k.lineMat('ink', 1)));

    /* gauges */
    var fillGeo = new THREE.BoxGeometry(1, 0.5, 0.2); fillGeo.translate(0.5, 0, 0);
    var boxGeo = new THREE.BoxGeometry(GW, 0.5, 0.2); boxGeo.translate(GW / 2, 0, 0);
    function gauge(y, role) {
      var fill = new THREE.Mesh(fillGeo, k.fixed(k.basic(), role));
      fill.position.set(GX, y, 0); fill.scale.x = 0.001; g.add(fill);
      var box = k.edges(boxGeo, 'ink'); box.position.set(GX, y, 0.05); g.add(box);
      return fill;
    }
    var gR = gauge(0.85, 'teal'), gK = gauge(-0.8, 'amber');

    /* the n picker: four boxes, the live one filled */
    var pickGeo = new THREE.BoxGeometry(0.8, 0.5, 0.2), picks = [], PX = [4.2, 5.2, 6.2, 7.2];
    for (i = 0; i < 4; i++) {
      var pm = k.basic(), pm_mesh = new THREE.Mesh(pickGeo, pm);
      pm_mesh.position.set(PX[i], -2.0, 0); g.add(pm_mesh);
      var pe = k.edges(pickGeo, 'ink'); pe.position.set(PX[i], -2.0, 0.05); g.add(pe);
      picks.push(pm);
      tag(String(NS[i]), PX[i], -2.7, 0.72);
    }

    tag('REWARD', GX, 1.65, 0.78, 'left');
    tag('KL COST', GX, 0.0, 0.78, 'left');
    tag('ANSWERS', CX, -2.85, 0.8);
    var nTag = [], rTag = [], kTag = [];
    for (i = 0; i < 4; i++) {
      nTag.push(tag('n = ' + NS[i], -7.0, 2.5, 1.15, 'left'));
      rTag.push(tag('+' + REWARD[i].toFixed(2), GX + GW, 1.65, 0.78, 'right'));
      kTag.push(tag(KL[i].toFixed(2), GX + GW, 0.0, 0.78, 'right'));
    }

    /* ---- simulation state ---- */
    var idx = 3, t = 2.6, gr = REWARD[3] / 2.6, gk = KL[3] / 3.4, rand = rng(7);
    function show() {
      for (var q = 0; q < 4; q++) nTag[q].sprite.visible = rTag[q].sprite.visible = kTag[q].sprite.visible = (q === idx);
    }
    var win = 0, st = k.state, rand2 = rng(11), lastSig = -1;
    function sig() { return st.sigma || 0; }
    function norm() { return Math.sqrt(1 + sig() * sig()); }
    function rescore() {
      var n = NS[idx], j, b, nm = norm(), sg = sig();
      win = 0;
      for (j = 0; j < n; j++) {
        b = bars[j];
        b.s = b.th + sg * b.e;
        b.h = Math.max(0.12, 1.4 + 0.72 * b.s / nm);
        b.ht = Math.max(0.05, 1.4 + 0.72 * b.th / nm);
        if (b.s > bars[win].s) win = j;
      }
      for (j = 0; j < 4; j++) setTag(rTag[j], '+' + (REWARD[j] / nm).toFixed(2));
    }
    function deal() {
      var n = NS[idx], w = SPREAD[idx], j;
      for (j = 0; j < 64; j++) {
        var b = bars[j];
        if (j < n) {
          b.th = gauss(rand); b.e = gauss(rand2);
          b.w = Math.min(0.7, 0.72 * w / n);
          b.x = CX - w / 2 + (j + 0.5) * w / n;
        }
        b.grp.visible = j < n;
        ticks[j].visible = false;
      }
      rescore();
    }
    function setTag(t, text) { if (t.text !== text) { t.text = text; drawTag(t); } }
    deal(); show();

    bonApi.pickN = function (v) { if (v !== 'auto') idx = NS.indexOf(parseInt(v, 10)); t = 0; deal(); show(); layout(0); };
    bonApi.resample = function () { t = 0; deal(); show(); layout(0); };

    function layout(dt) {
      var n = NS[idx], j, b, grow, wb = bars[win], sg = sig(), nm = norm();
      var shrink = t > T_HOLD ? 1 - ease((t - T_HOLD) / (T_END - T_HOLD)) : 1;
      for (j = 0; j < n; j++) {
        b = bars[j];
        grow = ease((t - (n > 1 ? 0.55 * j / (n - 1) : 0)) / (T_GROW - 0.3));
        b.grp.position.set(b.x, BASE, 0);
        b.grp.scale.set(b.w, Math.max(0.001, b.h * grow * shrink), 1);
        var tk = ticks[j];
        tk.visible = sg > 0.01 && grow > 0.05;
        tk.position.set(b.x, BASE + b.ht * grow * shrink, 0.25);
        tk.scale.set(b.w * 1.12, 0.07, 1);
      }
      for (j = n; j < 64; j++) ticks[j].visible = false;
      var drop = ease((t - T_PICK) / 0.35);
      crown.visible = level.visible = t >= T_PICK && shrink > 0.02;
      crown.position.set(wb.x, BASE + wb.h * shrink + 0.12 + (1 - drop) * 0.9 + 0.03 * Math.sin(t * 6), 0.2);
      crown.scale.setScalar(n === 1 ? 1.0 : Math.min(1, 0.4 + wb.w * 1.6));
      level.position.set(0, BASE + wb.h * shrink, 0.1);
      level.material.opacity = 0.9 * drop * shrink;
      if (t > T_PICK + 0.2) {
        gr += (REWARD[idx] / nm / 2.6 - gr) * Math.min(1, dt * 4.5);
        gk += (KL[idx] / 3.4 - gk) * Math.min(1, dt * 4.5);
      }
      gR.scale.x = Math.max(0.001, gr * GW); gK.scale.x = Math.max(0.001, gk * GW);
    }

    function step(dt) {
      t += dt;
      if (t >= T_END) { t = 0; if (st.n === 'auto') idx = (idx + 1) % 4; deal(); show(); }
      if (sig() !== lastSig) { lastSig = sig(); rescore(); }
      layout(dt);
    }

    function paint() {
      if (sig() !== lastSig) { lastSig = sig(); rescore(); layout(0); }
      var n = NS[idx], j;
      for (j = 0; j < n; j++) bars[j].mat.color.copy(j === win && t > T_PICK ? P.signal : P.paper2);
      crownMat.color.copy(P.amber);
      for (j = 0; j < 4; j++) picks[j].color.copy(j === idx ? P.amber : P.paper);
    }

    step(0); paint();
    return { step: step, paint: paint, palette: redrawTags };
  }
});
