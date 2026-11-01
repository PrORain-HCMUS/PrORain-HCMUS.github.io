/* Speculative decoding, round by round: a small draft model proposes γ = 4 tokens, the big target
   model checks them in one pass; each token survives with probability α = 0.85, the first rejection
   is replaced by a draw from the residual, and a clean sweep earns a free bonus token.
   The running mean of tokens per round converges to E[τ] = (1 − α^(γ+1)) / (1 − α) ≈ 3.71. */
(function () {
  'use strict';
  if (!window.SceneKit) return;
  SceneKit.mount({
    canvas: 'scene3d', fit: { w: 16.6, h: 6.3 }, warmup: 260,
    build: function (k) {
      var T = k.THREE, g = k.g, P = k.P, ease = k.ease, v3 = k.v3, i, j;
      var GAMMA = 4, ALPHA = 0.85, PERIOD = 5.4, PASS = 1.7, VT = 2.6, EMIT = 4.0, Y = 1.15;
      var EXPECT = (1 - Math.pow(ALPHA, GAMMA + 1)) / (1 - ALPHA);
      function clamp(x) { return Math.max(0, Math.min(1, x)); }
      function slotX(n) { return -5.0 + n * 1.0; }

      /* ---------- draft model (small) and target model (big) ---------- */
      var draftGeo = new T.BoxGeometry(0.2, 1.0, 0.6), draftMat = k.basic();
      var draft = new T.Mesh(draftGeo, draftMat); draft.add(k.edges(draftGeo, 'ink')); draft.position.set(-6.6, Y, 0); g.add(draft);
      var slabGeo = new T.BoxGeometry(0.16, 2.3, 1.0), slabs = [], roles = ['paper2', 'amber', 'signal'];
      for (i = 0; i < 3; i++) {
        var sm = k.basic(), sl = new T.Mesh(slabGeo, sm); sl.add(k.edges(slabGeo, 'ink'));
        sl.position.set(1.3 + i * 0.4, Y, -0.1 + i * 0.1); g.add(sl); slabs.push({ mesh: sl, mat: sm, role: roles[i] });
      }
      var draftFlash = 0, slabFlash = 0;

      /* ---------- wires ---------- */
      k.dashed(new T.LineCurve3(v3(-6.4, Y), v3(-5.6, Y)), 'ink2', 0.6);
      k.dashed(new T.QuadraticBezierCurve3(v3(-0.45, Y + 0.7, 0), v3(0.4, Y + 1.5, 0), v3(1.05, Y + 0.7, 0)), 'ink2', 0.6);
      k.dashed(new T.LineCurve3(v3(2.55, Y), v3(3.85, Y)), 'ink2', 0.6);
      var passCurve = new T.QuadraticBezierCurve3(v3(-0.5, Y + 0.7, 0.1), v3(0.4, Y + 1.5, 0.2), v3(1.1, Y + 0.7, 0.1));

      /* ---------- draft cards, replacement card, bonus slot ---------- */
      var cardGeo = new T.BoxGeometry(0.62, 0.84, 0.1), picGeo = new T.BoxGeometry(0.46, 0.4, 0.06);
      function makeCard() {
        var grp = new T.Group(), body = new T.Mesh(cardGeo, k.fixed(k.basic(), 'paper')); body.add(k.edges(cardGeo, 'ink')); grp.add(body);
        var pm = k.basic(), pic = new T.Mesh(picGeo, pm); pic.position.set(0, 0.12, 0.08); pic.add(k.edges(picGeo, 'ink', 0.9)); grp.add(pic);
        var l1 = new T.Mesh(new T.BoxGeometry(0.36, 0.05, 0.02), k.fixed(k.basic(), 'ink2')); l1.position.set(0, -0.2, 0.07); grp.add(l1);
        var l2 = new T.Mesh(new T.BoxGeometry(0.22, 0.05, 0.02), k.fixed(k.basic(), 'ink2')); l2.position.set(-0.07, -0.3, 0.07); grp.add(l2);
        grp.scale.setScalar(0.001); g.add(grp);
        return { g: grp, pm: pm, u: 0, flash: 0, dim: 0 };
      }
      var cards = []; for (i = 0; i < GAMMA; i++) cards.push(makeCard());
      var rep = makeCard();
      var ghostPts = [v3(-0.31, Y - 0.42), v3(0.31, Y - 0.42), v3(0.31, Y + 0.42), v3(-0.31, Y + 0.42), v3(-0.31, Y - 0.42)];
      for (i = 0; i < ghostPts.length; i++) ghostPts[i].x += slotX(GAMMA);
      var ghost = new T.Line(new T.BufferGeometry().setFromPoints(ghostPts),
        k.fixed(new T.LineDashedMaterial({ color: 0xffffff, dashSize: 0.1, gapSize: 0.08, transparent: true, opacity: 0.55 }), 'ink2'));
      ghost.computeLineDistances(); g.add(ghost);

      /* ---------- output stream: the tokens the target actually emits ---------- */
      var trayGeo = new T.BoxGeometry(0.46, 0.46, 0.1), tray = [], trayRoles = ['teal', 'teal', 'amber', 'teal', 'teal', 'teal', 'amber'];
      for (i = 0; i < 7; i++) {
        var tm = k.basic(), tmesh = new T.Mesh(trayGeo, tm); tmesh.add(k.edges(trayGeo, 'ink'));
        tmesh.position.set(4.2 + i * 0.62, Y, 0); g.add(tmesh); tray.push({ mat: tm });
      }
      /* tokens-this-round pips */
      var pips = []; for (i = 0; i < GAMMA + 1; i++) {
        var pm2 = k.basic(), pmesh = new T.Mesh(trayGeo, pm2); pmesh.add(k.edges(trayGeo, 'ink'));
        pmesh.position.set(4.2 + i * 0.62, -0.85, 0); g.add(pmesh); pips.push({ mat: pm2 });
      }

      /* ---------- overlap of p and q: the acceptance rate is the teal part ---------- */
      var pv = [0.50, 0.30, 0.15, 0.05], qv = [0.40, 0.40, 0.10, 0.10], SC = 2.0, BASE = -1.9, BW = 0.32;
      function bar(x, h, role) {
        if (h <= 0.001) return;
        var geo = new T.BoxGeometry(BW, h, 0.1); geo.translate(0, h / 2, 0);
        var m = new T.Mesh(geo, k.fixed(k.basic(), role)); m.add(k.edges(geo, 'ink')); m.position.set(x, BASE, 0); g.add(m); return m;
      }
      for (j = 0; j < 4; j++) {
        var cx = -7.6 + j * 0.9, ov = Math.min(pv[j], qv[j]) * SC;
        bar(cx - 0.18, ov, 'teal'); bar(cx + 0.18, ov, 'teal');
        var up = (pv[j] - qv[j]) * SC, dn = (qv[j] - pv[j]) * SC;
        if (up > 0) { var b1 = bar(cx - 0.18, up, 'amber'); b1.position.y = BASE + ov; }
        if (dn > 0) { var b2 = bar(cx + 0.18, dn, 'paper2'); b2.position.y = BASE + ov; }
      }
      var baseLine = new T.Line(new T.BufferGeometry().setFromPoints([v3(-8.0, BASE), v3(-4.5, BASE)]), k.lineMat('ink', 1)); g.add(baseLine);

      k.label('DRAFT q', -6.6, Y - 1.05, 2.7);
      k.label('TARGET p', 1.7, Y - 1.55, 3.0);
      k.label('OUTPUT', 5.9, Y - 0.8, 2.6);
      k.label('TOKENS / ROUND', 5.65, -1.5, 3.9);
      k.label('α = 1 − TV', -6.1, -2.3, 3.2);

      /* ---------- running mean (own sprite, redrawn when a round ends) ---------- */
      var statC = document.createElement('canvas'); statC.width = 512; statC.height = 96;
      var statTex = new T.CanvasTexture(statC), statSprite = new T.Sprite(new T.SpriteMaterial({ map: statTex, transparent: true, depthTest: false }));
      statSprite.scale.set(4.6, 4.6 * 96 / 512, 1); statSprite.position.set(5.65, -2.1, 0.5); g.add(statSprite);
      var rounds = 0, total = 0;
      function drawStat() {
        var ctx = statC.getContext('2d'); ctx.clearRect(0, 0, 512, 96);
        ctx.fillStyle = '#' + P.ink2.getHexString(); ctx.font = '500 34px "JetBrains Mono", "Consolas", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((rounds ? 'avg ' + (total / rounds).toFixed(2) : 'avg –') + ' · theory ' + EXPECT.toFixed(2), 256, 50);
        statTex.needsUpdate = true;
      }

      /* ---------- the round ---------- */
      var t = 4.3 - 260 / 60, nAcc = 2, tau = 3, emitted = 0, passSent = false, statDone = false;   // the opening frame shows a rejection, a replacement and a discarded draft
      function newRound() {
        t -= PERIOD; emitted = 0; passSent = false; statDone = false;
        nAcc = 0; while (nAcc < GAMMA && Math.random() < ALPHA) nAcc++;
        tau = nAcc + 1;
      }
      var cardRoleMix = function (out) { return out.copy(P.ink2).lerp(P.paper, 0.55); };

      function place(c, x, y, s, rz) { c.g.position.set(x, y, 0); c.g.scale.setScalar(Math.max(0.001, s)); c.g.rotation.z = rz || 0; }

      function step(dt) {
        t += dt;
        while (t >= PERIOD) newRound();
        var fade = 1 - ease((t - (PERIOD - 0.45)) / 0.4);
        draftFlash = 0; for (i = 0; i < GAMMA; i++) draftFlash = Math.max(draftFlash, 1 - Math.abs(t - (0.25 + 0.28 * i)) / 0.18);
        draftFlash = Math.max(0, draftFlash);
        for (i = 0; i < GAMMA; i++) {
          var c = cards[i], ap = ease((t - (0.25 + 0.28 * i)) / 0.25), vt = VT + 0.26 * i, s = ap, rz = 0;
          c.u = 0; c.flash = 0; c.dim = 0;
          if (i < nAcc) c.u = ease((t - vt) / 0.25);
          else if (i === nAcc) { c.flash = clamp((t - vt) / 0.3); s *= 1 - ease((t - vt - 0.12) / 0.25); rz = c.flash * 0.35; }
          else { var d = ease((t - (VT + 0.26 * nAcc)) / 0.3); c.dim = d; s *= 1 - d; }
          place(c, slotX(i), Y + 0.2 * c.u, s * fade, rz);
        }
        var rt = nAcc < GAMMA ? VT + 0.26 * nAcc + 0.3 : VT + 0.26 * GAMMA;
        place(rep, slotX(nAcc), Y + (nAcc === GAMMA ? 0.2 : 0), ease((t - rt) / 0.25) * fade, 0);
        if (t >= PASS && !passSent) { passSent = true; k.send(passCurve, 0.7, function () { slabFlash = 1; }, true); }
        slabFlash = Math.max(0, slabFlash - dt * 1.6);
        while (emitted < tau && t >= EMIT + 0.12 * emitted) {
          var role = emitted < nAcc ? 'teal' : 'amber', from = slotX(emitted);
          (function (role) {
            k.send(new T.QuadraticBezierCurve3(v3(from, Y + 0.5, 0.2), v3((from + 4.2) / 2, Y + 1.7, 0.3), v3(4.2, Y + 0.3, 0.1)), 0.55,
              function () { trayRoles.unshift(role); trayRoles.pop(); }, false);
          })(role);
          emitted++;
        }
        if (!statDone && emitted >= tau && t >= EMIT + 0.12 * tau) { statDone = true; rounds++; total += tau; drawStat(); }
      }

      function paint() {
        var col = new T.Color(), base = new T.Color();
        draftMat.color.copy(P.paper2).lerp(P.signal, Math.max(0, draftFlash) * 0.7);
        for (i = 0; i < slabs.length; i++) slabs[i].mat.color.copy(P[slabs[i].role]).lerp(P.signal, slabFlash * 0.6);
        cardRoleMix(base);
        for (i = 0; i < cards.length; i++) {
          var c = cards[i];
          col.copy(base).lerp(P.teal, c.u).lerp(P.signal, c.flash).lerp(P.paper2, c.dim * 0.8);
          c.pm.color.copy(col);
        }
        rep.pm.color.copy(P.amber);
        for (i = 0; i < tray.length; i++) tray[i].mat.color.copy(P[trayRoles[i]]);
        for (i = 0; i < pips.length; i++) {
          var lit = i < tau && t >= EMIT + 0.12 * i;
          if (lit) pips[i].mat.color.copy(i < nAcc ? P.teal : P.amber); else pips[i].mat.color.copy(P.paper2);
        }
      }

      drawStat();
      return { step: step, paint: paint, palette: drawStat };
    }
  });
})();
