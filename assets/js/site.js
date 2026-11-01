(() => {
  const root = document.documentElement;
  root.classList.remove("no-js");

  /* ---- theme: saved choice, else system ---- */
  const KEY = "hvl-theme";
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };
  const preferred = () => read() || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const apply = (t) => {
    root.setAttribute("data-theme", t);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === "dark" ? "#0c0c10" : "#fafaf9";
  };
  apply(preferred());
  document.querySelectorAll("[data-theme-toggle]").forEach((b) =>
    b.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next); write(next);
    })
  );

  /* ---- nav: border on scroll, mobile menu ---- */
  const nav = document.querySelector(".nav");
  const onScroll = () => nav && nav.classList.toggle("scrolled", scrollY > 8);
  onScroll(); addEventListener("scroll", onScroll, { passive: true });

  const links = document.querySelector(".links");
  const menuBtn = document.querySelector(".menu-btn");
  if (menuBtn && links) {
    menuBtn.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", (e) => {
      if (e.target.closest("a")) { links.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
    });
  }

  /* ---- scroll-spy for in-page anchors ---- */
  const anchors = [...document.querySelectorAll('.links a[href^="#"], .links a[href*="/#"]')];
  const map = new Map();
  anchors.forEach((a) => {
    const id = a.getAttribute("href").split("#")[1];
    const sec = id && document.getElementById(id);
    if (sec) map.set(sec, a);
  });
  if (map.size && "IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          anchors.forEach((a) => a.classList.remove("active"));
          map.get(en.target).classList.add("active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    map.forEach((_, sec) => spy.observe(sec));
  }

  /* ---- reveal on scroll ---- */
  const items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el) => io.observe(el));
  } else items.forEach((el) => el.classList.add("in"));

  /* ---- reading list filters ---- */
  const bar = document.querySelector("[data-filters]");
  if (bar) {
    const rows = document.querySelectorAll("[data-tag]");
    bar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      bar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      const f = btn.dataset.filter;
      rows.forEach((r) => { r.hidden = !(f === "all" || r.dataset.tag === f); });
    });
  }

  /* ---- article reading progress ---- */
  const prog = document.querySelector(".progress");
  if (prog) {
    const upd = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      prog.style.width = (h > 0 ? Math.min(100, (scrollY / h) * 100) : 0) + "%";
    };
    upd(); addEventListener("scroll", upd, { passive: true });
  }

  /* ---- count-up stats ---- */
  document.querySelectorAll("[data-count]").forEach((el) => {
    const end = parseFloat(el.dataset.count), suffix = el.dataset.suffix || "", prefix = el.dataset.prefix || "";
    const dec = (el.dataset.count.split(".")[1] || "").length;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 1100;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + (end * e).toFixed(dec) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
  });

  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
