(function () {
  var root = document.documentElement;
  root.classList.remove("no-js");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- theme: saved choice, else system ---- */
  var KEY = "hvl-theme";
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }
  function apply(t) {
    root.setAttribute("data-theme", t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === "dark" ? "#12131d" : "#f4efe4";
  }
  apply(read() || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  Array.prototype.forEach.call(document.querySelectorAll("[data-theme-toggle]"), function (b) {
    b.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next); write(next);
    });
  });

  /* ---- mobile menu ---- */
  var links = document.querySelector(".links"), menuBtn = document.querySelector(".menu-btn");
  if (menuBtn && links) {
    menuBtn.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) { links.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
    });
  }

  /* ---- tuning band: scroll progress on narrow screens ---- */
  var band = document.querySelector(".band i, .progress i");
  function prog() {
    if (!band) return;
    var h = root, max = h.scrollHeight - h.clientHeight;
    band.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  }
  document.addEventListener("scroll", prog, { passive: true }); prog();

  /* ---- vertical tuning dial: evenly spaced stations, needle interpolates between them ---- */
  var dial = document.querySelector(".vdial");
  var els = Array.prototype.slice.call(document.querySelectorAll("[data-st]"));
  if (!els.length) {  // blog posts: use the section headings
    els = Array.prototype.slice.call(document.querySelectorAll(".prose h2")).slice(0, 8);
    els.forEach(function (h, i) { h.setAttribute("data-st", h.textContent.length > 22 ? h.textContent.slice(0, 21).replace(/\s+\S*$/, "") + "…" : h.textContent); h.setAttribute("data-n", String(i + 1).padStart(2, "0")); });
  }
  var n = els.length, marks = [], tops = [], lastActive = -1;
  if (dial && n > 1) {
    var box = dial.querySelector(".marks"), needle = dial.querySelector(".needle");
    els.forEach(function (el, i) {
      var b = document.createElement("button");
      b.className = "mk"; b.type = "button";
      b.style.top = (i / (n - 1) * 100) + "%";
      var num = el.getAttribute("data-n");
      b.innerHTML = (num ? '<span class="n">' + num + "</span>" : "") + el.getAttribute("data-st");
      b.addEventListener("click", function () { el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); });
      box.appendChild(b); marks.push(b);
    });
    var measure = function () {
      var off = window.innerHeight * 0.35;
      tops = els.map(function (el) { return el.getBoundingClientRect().top + window.scrollY - off; });
      update();
    };
    var update = function () {
      if (getComputedStyle(dial).display === "none") return;
      var y = window.scrollY, h = root, max = h.scrollHeight - h.clientHeight, pos, active = 0, i;
      if (y >= max - 2) { pos = n - 1; active = n - 1; }
      else {
        for (i = 0; i < n; i++) if (tops[i] <= y) active = i;
        var next = active + 1 < n ? tops[active + 1] : max;
        var frac = next > tops[active] ? Math.min(1, Math.max(0, (y - tops[active]) / (next - tops[active]))) : 0;
        pos = Math.min(n - 1, active + frac);
      }
      needle.style.top = (pos / (n - 1) * 100) + "%";
      marks.forEach(function (m, k) { m.classList.toggle("on", k === active); });
      if (active !== lastActive) { lastActive = active; document.dispatchEvent(new CustomEvent("station", { detail: active })); }
    };
    document.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    measure();
  }

  /* ---- top-bar scroll spy (home page) ---- */
  var anchors = Array.prototype.slice.call(document.querySelectorAll('.links a[href^="#"]'));
  var spy = new Map();
  anchors.forEach(function (a) {
    var sec = document.getElementById(a.getAttribute("href").slice(1));
    if (sec) spy.set(sec, a);
  });
  if (spy.size && "IntersectionObserver" in window) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { anchors.forEach(function (a) { a.classList.remove("active"); }); spy.get(en.target).classList.add("active"); }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    spy.forEach(function (_, sec) { so.observe(sec); });
  }

  /* ---- on-air panel: caption + a terminal that types real facts for the section ---- */
  var live = document.querySelector(".live");
  if (live && els.length) {
    var tag = live.querySelector(".lv-step"), cap = live.querySelector(".lv-cap"), term = live.querySelector(".lv-term");
    var timer = null;
    var show = function (i) {
      var el = els[i]; if (!el) return;
      live.classList.toggle("show", i > 0 || window.scrollY > 300);
      tag.textContent = el.getAttribute("data-st");
      cap.textContent = el.getAttribute("data-cap") || "";
      var cmd = el.getAttribute("data-cmd") || "", out = (el.getAttribute("data-out") || "").split("|");
      clearInterval(timer);
      if (reduce) { term.innerHTML = '<span class="cmdl">$ ' + esc(cmd) + "</span>\n" + out.map(esc).join("\n"); return; }
      var k = 0, lines = out.length, buf = "";
      term.innerHTML = '<span class="cmdl">$ </span><span class="cur">▌</span>';
      var typed = 0;
      timer = setInterval(function () {
        if (typed <= cmd.length) {
          term.innerHTML = '<span class="cmdl">$ ' + esc(cmd.slice(0, typed)) + '</span><span class="cur">▌</span>'; typed++;
        } else if (k < lines) {
          buf += (k ? "\n" : "") + out[k++];
          term.innerHTML = '<span class="cmdl">$ ' + esc(cmd) + "</span>\n" + esc(buf) + '<span class="cur">▌</span>';
        } else clearInterval(timer);
      }, 38);
    };
    var esc = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
    document.addEventListener("station", function (e) { show(e.detail); });
    if (lastActive >= 0) show(lastActive);
    document.addEventListener("scroll", function () { if (lastActive === 0) live.classList.toggle("show", window.scrollY > 300); }, { passive: true });
  }

  /* ---- reveal on scroll ---- */
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.06, rootMargin: "0px 0px -4% 0px" });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  } else Array.prototype.forEach.call(items, function (el) { el.classList.add("in"); });

  /* ---- reading list filters ---- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-filters]"), function (bar) {
    var rows = document.querySelectorAll(bar.getAttribute("data-filters") || "[data-tag]");
    bar.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      Array.prototype.forEach.call(bar.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      var f = btn.dataset.filter;
      Array.prototype.forEach.call(rows, function (r) { r.hidden = !(f === "all" || r.dataset.tag === f); });
    });
  });

  /* ---- count-up stats ---- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-count]"), function (el) {
    var end = parseFloat(el.dataset.count), suffix = el.dataset.suffix || "", prefix = el.dataset.prefix || "";
    var dec = (el.dataset.count.split(".")[1] || "").length;
    if (reduce || !("IntersectionObserver" in window)) return;
    var o = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      o.disconnect();
      var t0 = performance.now(), dur = 1000;
      (function tick(t) {
        var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + (end * e).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + suffix;
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
    o.observe(el);
  });

  /* experience: hovering a tech tag lights the same tag on every card */
  var techs = document.querySelectorAll(".xp .tech li[data-t]");
  Array.prototype.forEach.call(techs, function (li) {
    var on = function (v) { Array.prototype.forEach.call(techs, function (o) { if (o.getAttribute("data-t") === li.getAttribute("data-t")) o.classList.toggle("hl", v); }); };
    li.addEventListener("mouseenter", function () { on(true); });
    li.addEventListener("mouseleave", function () { on(false); });
  });

  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
