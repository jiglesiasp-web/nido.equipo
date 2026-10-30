/* ==========================================================================
   FLOW BARBER — main.js (classic script, IIFE, no modules)
   Each init runs inside safe() so one failure never breaks the rest.
   ========================================================================== */
(function () {
  "use strict";

  var data = window.__BRAND__ || {};
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  var isSmall = window.innerWidth < 760;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "] failed:", e); }
  }

  /* One shared rAF loop (gotcha B.11) */
  var updaters = [];
  function addUpdater(fn) { updaters.push(fn); }
  function loop(t) {
    for (var i = 0; i < updaters.length; i++) {
      try { updaters[i](t); } catch (e) { /* keep loop alive */ }
    }
    requestAnimationFrame(loop);
  }

  /* ---------- splash ---------- */
  function initSplash() {
    var splash = $("[data-splash]");
    if (!splash) return;
    var counter = $("[data-splash-count]");
    var start = performance.now();
    var done = false;
    function tick(now) {
      var p = clamp((now - start) / 1300, 0, 1);
      if (counter) counter.textContent = String(Math.round(ease(p) * 100)).padStart(3, "0");
      if (p < 1 && !done) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    function hide() {
      if (done) return;
      done = true;
      if (counter) counter.textContent = "100";
      splash.classList.add("is-out");
      document.documentElement.classList.add("is-loaded");
      setTimeout(function () { splash.style.display = "none"; }, 1000);
    }
    if (document.readyState === "complete") setTimeout(hide, 900);
    else window.addEventListener("load", function () { setTimeout(hide, 500); });
    setTimeout(hide, 3800); // safety net
  }

  /* ---------- nav ---------- */
  function initNav() {
    var nav = $("[data-nav]");
    var burger = $("[data-burger]");
    var menu = $("[data-menu]");
    function onScroll() {
      if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 30);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    if (!burger || !menu) return;
    function setOpen(open) {
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      menu.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
    }
    burger.addEventListener("click", function () { setOpen(menu.hidden); });
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { setOpen(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) setOpen(false); });
  }

  /* ---------- reveals (threshold ≤ 0.05 + 6s safety, gotcha A.8) ---------- */
  function initReveals() {
    var els = $$(".reveal:not([data-split])");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el, i) {
      // light stagger for siblings
      var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.transitionDelay = Math.min(sib, 5) * 70 + "ms";
      io.observe(el);
    });
    setTimeout(function () {
      $$(".reveal:not(.is-visible)").forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-visible");
      });
    }, 6000);
  }

  /* ---------- count-up ---------- */
  function initCountUp() {
    var els = $$("[data-count]");
    if (!els.length) return;
    function run(el) {
      if (el.dataset.counted) return;
      el.dataset.counted = "1";
      var target = parseFloat(el.dataset.count);
      var dec = parseInt(el.dataset.decimals || "0", 10);
      var t0 = performance.now();
      var dur = 1600;
      (function step(now) {
        var p = clamp((now - t0) / dur, 0, 1);
        el.textContent = (target * ease(p)).toFixed(dec).replace(".", ",");
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.01 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- live open / closed status (Europe/Madrid) ---------- */
  function initStatus() {
    var hours = data.hours;
    if (!hours) return;
    function madridNow() {
      try {
        var parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: data.timezone || "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false
        }).formatToParts(new Date());
        var o = {};
        parts.forEach(function (p) { o[p.type] = p.value; });
        var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        return { day: days[o.weekday], min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
      } catch (e) {
        var d = new Date();
        return { day: d.getDay(), min: d.getHours() * 60 + d.getMinutes() };
      }
    }
    var toMin = function (s) { var p = s.split(":"); return +p[0] * 60 + +p[1]; };
    function compute() {
      var now = madridNow();
      var today = hours[now.day] || [];
      var open = false, closesAt = null, nextOpen = null;
      today.forEach(function (r) {
        var a = toMin(r[0]), b = toMin(r[1]);
        if (now.min >= a && now.min < b) { open = true; closesAt = r[1]; }
        if (!nextOpen && now.min < a) nextOpen = r[0];
      });
      var label;
      if (open) label = "Abierto · cierra " + closesAt;
      else if (nextOpen) label = "Cerrado · abre " + nextOpen;
      else {
        var names = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
        for (var k = 1; k <= 7; k++) {
          var d = (now.day + k) % 7;
          if (hours[d] && hours[d].length) {
            label = "Cerrado · abre " + (k === 1 ? "mañana" : names[d]) + " " + hours[d][0][0];
            break;
          }
        }
      }
      $$("[data-status]").forEach(function (el) {
        el.classList.toggle("is-open", open);
        el.classList.toggle("is-closed", !open);
        var b = $("b", el);
        if (b && label) b.textContent = label;
      });
      $$(".hours tr").forEach(function (tr) {
        tr.classList.toggle("is-today", +tr.dataset.day === now.day);
      });
    }
    compute();
    setInterval(compute, 60000);
  }

  /* ---------- magnetic buttons ---------- */
  function initMagnetic() {
    if (!canHover) return;
    $$("[data-magnetic]").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.22;
        var y = (e.clientY - r.top - r.height / 2) * 0.32;
        btn.style.setProperty("--mx", x.toFixed(1) + "px");
        btn.style.setProperty("--my", y.toFixed(1) + "px");
      });
      btn.addEventListener("mouseout", function (e) {
        if (btn.contains(e.relatedTarget)) return;
        btn.style.setProperty("--mx", "0px");
        btn.style.setProperty("--my", "0px");
      });
    });
  }

  /* ---------- tilt on work shots ---------- */
  function initTilt() {
    if (!canHover) return;
    $$("[data-tilt]").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(900px) rotateY(" + (px * 7).toFixed(2) + "deg) rotateX(" + (-py * 7).toFixed(2) + "deg)";
      });
      card.addEventListener("mouseout", function (e) {
        if (card.contains(e.relatedTarget)) return;
        card.style.transform = "";
      });
    });
  }

  /* ---------- scramble on nav hover ---------- */
  function initScramble() {
    if (!canHover) return;
    var glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#*";
    $$("[data-scramble]").forEach(function (el) {
      var original = el.textContent;
      var running = false;
      el.addEventListener("mouseover", function (e) {
        if (running || el.contains(e.relatedTarget)) return;
        running = true;
        var frame = 0, total = 14;
        (function step() {
          var out = "";
          for (var i = 0; i < original.length; i++) {
            out += (i < (frame / total) * original.length || original[i] === " ")
              ? original[i]
              : glyphs[Math.floor(Math.random() * glyphs.length)];
          }
          el.textContent = out;
          frame++;
          if (frame <= total) requestAnimationFrame(step);
          else { el.textContent = original; running = false; }
        })();
      });
    });
  }

  /* ---------- Booksy booking widget (inline, lazy) ---------- */
  function initBooking() {
    var box = $("[data-booksy]");
    if (!box) return;
    var loaded = false;
    function load() {
      if (loaded) return;
      loaded = true;
      var s = document.createElement("script");
      s.src = "https://booksy.com/widget/code.js?id=" + (box.dataset.booksyId || "153876") + "&country=es&lang=es&mode=inline";
      s.async = true;
      s.onerror = function () { box.classList.add("is-error"); };
      box.appendChild(s);
      // hide the loader once the iframe has loaded (or after 12s at worst)
      var t0 = Date.now();
      (function wait() {
        var f = box.querySelector("iframe");
        if (f) {
          f.removeAttribute("width");
          f.setAttribute("title", "Reserva de cita en Flow Barber (Booksy)");
          f.addEventListener("load", function () { box.classList.add("is-loaded"); });
          setTimeout(function () { box.classList.add("is-loaded"); }, 6000);
          return;
        }
        if (Date.now() - t0 < 12000) setTimeout(wait, 150);
        else box.classList.add("is-loaded");
      })();
    }
    $$('a[href="#reservar"]').forEach(function (a) { a.addEventListener("click", load); });
    if (location.hash === "#reservar") load();
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { load(); io.disconnect(); }
      }, { rootMargin: "900px 0px" });
      io.observe(box);
    } else {
      load();
    }
    setTimeout(load, 8000); // load anyway after first paint settles
  }

  /* ---------- GSAP: studio parallax + final CTA ---------- */
  function initGsap() {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    var img = $("[data-parallax]");
    if (img) {
      gsap.fromTo(img, { yPercent: -8 }, {
        yPercent: 4, ease: "none",
        scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: 0.6 }
      });
    }
    var cta = $(".final-cta");
    if (cta) {
      gsap.fromTo(cta, { scale: 0.86, letterSpacing: "0.02em" }, {
        scale: 1, letterSpacing: "-0.05em", ease: "none",
        scrollTrigger: { trigger: cta, start: "top bottom", end: "center center", scrub: 0.8 }
      });
    }
  }

  /* ======================================================================
     3D SCENE — holographic barber pole
     ====================================================================== */
  function initScene() {
    var canvas = $("#scene");
    if (!canvas || !window.THREE) { document.documentElement.classList.add("no-webgl"); return; }
    var T = window.THREE;

    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !isSmall, alpha: true, powerPreference: "high-performance" });
    } catch (e) {
      canvas.style.display = "none";
      document.documentElement.classList.add("no-webgl");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 1.75)); // before setSize (B.10)
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(0x050403, 1);

    var scene = new T.Scene();
    scene.fog = new T.FogExp2(0x050403, 0.055);
    var camera = new T.PerspectiveCamera(isSmall ? 52 : 38, window.innerWidth / window.innerHeight, 0.1, 100);

    /* environment for metals: tiny scene of emissive panels → PMREM */
    try {
      var pmrem = new T.PMREMGenerator(renderer);
      var env = new T.Scene();
      var panel = function (color, x, y, z, w, h, ry) {
        var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: color, side: T.DoubleSide }));
        m.position.set(x, y, z); m.rotation.y = ry || 0; env.add(m);
      };
      env.background = new T.Color(0x080604);
      panel(0xfff1c8, 0, 4, -6, 8, 2, 0);
      panel(0xd4af37, -6, 0, 0, 3, 8, Math.PI / 2);
      panel(0xffffff, 6, 1, 0, 2, 6, -Math.PI / 2);
      panel(0x6b5320, 0, -4, 6, 10, 2, Math.PI);
      scene.environment = pmrem.fromScene(env, 0.04).texture;
    } catch (e) { /* metals just look flatter */ }

    /* lights: 4 sources */
    scene.add(new T.AmbientLight(0x2a2016, 0.6));
    var key = new T.DirectionalLight(0xffe2a8, 2.2); key.position.set(-4, 5, 4); scene.add(key);
    var rim = new T.DirectionalLight(0xfff6e0, 1.4); rim.position.set(5, 2, -4); scene.add(rim);
    var core = new T.PointLight(0xd4af37, 6, 7, 1.6); core.position.set(0, 0, 0); scene.add(core);
    var under = new T.PointLight(0x8a6f33, 3, 9, 1.8); under.position.set(0, -3.4, 2); scene.add(under);

    /* stripe texture (gold / cream / void), scrolled to fake the spiral spin */
    var cv = document.createElement("canvas");
    cv.width = 512; cv.height = 512;
    var g = cv.getContext("2d");
    g.fillStyle = "#0b0805"; g.fillRect(0, 0, 512, 512);
    g.save();
    g.translate(256, 256); g.rotate(-Math.PI / 4.6); g.translate(-512, -512);
    var band = 64, cols = ["#d4af37", "#0b0805", "#f4ead5", "#0b0805"];
    for (var i = 0; i < 40; i++) { g.fillStyle = cols[i % 4]; g.fillRect(0, i * band / 2, 1024, band / 2); }
    g.restore();
    // fine scan lines for a holographic feel
    g.globalAlpha = 0.18; g.fillStyle = "#000";
    for (var y = 0; y < 512; y += 4) g.fillRect(0, y, 512, 1);
    g.globalAlpha = 1;
    var stripeTex = new T.CanvasTexture(cv);
    stripeTex.colorSpace = T.SRGBColorSpace;
    stripeTex.wrapS = stripeTex.wrapT = T.RepeatWrapping;
    stripeTex.repeat.set(1, 2.2);
    stripeTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    var pole = new T.Group();
    scene.add(pole);

    var H = 4.2;
    var inner = new T.Mesh(
      new T.CylinderGeometry(0.52, 0.52, H, 72, 1, true),
      new T.MeshStandardMaterial({ map: stripeTex, emissiveMap: stripeTex, emissive: 0xffffff, emissiveIntensity: 0.32, metalness: 0.35, roughness: 0.35 })
    );
    pole.add(inner);

    var glass = new T.Mesh(
      new T.CylinderGeometry(0.66, 0.66, H + 0.1, 72, 1, true),
      new T.MeshPhysicalMaterial({ color: 0xfff4d6, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, side: T.DoubleSide, depthWrite: false })
    );
    pole.add(glass);

    var gold = new T.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.22 });
    var capGeo = new T.CylinderGeometry(0.8, 0.8, 0.2, 64);
    var collarGeo = new T.TorusGeometry(0.7, 0.05, 16, 80);
    [1, -1].forEach(function (s) {
      var cap = new T.Mesh(capGeo, gold); cap.position.y = s * (H / 2 + 0.12); pole.add(cap);
      var collar = new T.Mesh(collarGeo, gold); collar.rotation.x = Math.PI / 2; collar.position.y = s * (H / 2 + 0.28); pole.add(collar);
    });
    var dome = new T.Mesh(new T.SphereGeometry(0.46, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    dome.position.y = H / 2 + 0.22; pole.add(dome);
    var knob = new T.Mesh(new T.SphereGeometry(0.12, 24, 16), gold);
    knob.position.y = H / 2 + 0.74; pole.add(knob);
    var foot = new T.Mesh(new T.CylinderGeometry(0.34, 0.52, 0.5, 48), gold);
    foot.position.y = -(H / 2 + 0.47); pole.add(foot);

    /* holographic rings + vertical scanner ring */
    var holoMat = function (op) {
      return new T.MeshBasicMaterial({ color: 0xe9cf7a, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    };
    var rings = [];
    [[1.25, 0.006, 0.55, 0.6], [1.6, 0.004, 0.32, -0.9], [2.05, 0.003, 0.2, 1.5]].forEach(function (r, idx) {
      var ring = new T.Mesh(new T.TorusGeometry(r[0], r[1], 8, 160), holoMat(r[2]));
      ring.rotation.x = Math.PI / 2 + (idx - 1) * 0.28;
      ring.userData.speed = r[3];
      pole.add(ring); rings.push(ring);
    });
    // tick marks on the middle ring (HUD feel)
    var ticks = new T.Group();
    for (var k = 0; k < 48; k++) {
      var a = (k / 48) * Math.PI * 2;
      var len = k % 6 === 0 ? 0.16 : 0.06;
      var tick = new T.Mesh(new T.PlaneGeometry(0.008, len), holoMat(0.6));
      tick.position.set(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
      tick.lookAt(0, 0, 0);
      ticks.add(tick);
    }
    pole.add(ticks);

    var scanner = new T.Mesh(new T.RingGeometry(0.7, 0.92, 96), holoMat(0.28));
    scanner.rotation.x = -Math.PI / 2;
    pole.add(scanner);

    /* floor: polar grid fading in fog */
    var grid = new T.PolarGridHelper(9, 24, 12, 96, 0x8a6f33, 0x3a2e16);
    grid.position.y = -(H / 2 + 0.75);
    grid.material.transparent = true; grid.material.opacity = 0.45; grid.material.depthWrite = false;
    scene.add(grid);

    /* particles — skipped for reduced motion (intrusive) */
    var dust = null;
    if (!reduced) {
      var N = isSmall ? 320 : 900;
      var pos = new Float32Array(N * 3);
      var spd = new Float32Array(N);
      for (var n = 0; n < N; n++) {
        var rad = 1 + Math.random() * 7, ang = Math.random() * Math.PI * 2;
        pos[n * 3] = Math.cos(ang) * rad;
        pos[n * 3 + 1] = (Math.random() - 0.5) * 9;
        pos[n * 3 + 2] = Math.sin(ang) * rad;
        spd[n] = 0.002 + Math.random() * 0.006;
      }
      var dg = new T.BufferGeometry();
      dg.setAttribute("position", new T.BufferAttribute(pos, 3));
      dust = new T.Points(dg, new T.PointsMaterial({ color: 0xe9cf7a, size: isSmall ? 0.035 : 0.028, transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
      dust.userData.spd = spd;
      scene.add(dust);
    }

    /* camera keyframes, one per [data-stage] section */
    var wide = !isSmall;
    var KF = [
      { pos: wide ? [-2.1, 0.5, 7.2] : [0, 0.4, 8.6], look: wide ? [-2.1, 0.2, 0] : [0, 0.6, 0], exp: 0.95 },
      { pos: [0.2, 1.4, 3.1], look: [0, 1.1, 0], exp: 0.7 },
      { pos: wide ? [3.6, -0.4, 9.5] : [0, -0.2, 11], look: wide ? [3.2, 0.2, 0] : [0, 0.4, 0], exp: 0.62 },
      { pos: [0.4, 6.2, 4.6], look: [0, -0.2, 0], exp: 0.62 },
      { pos: wide ? [2.6, 0.2, 6.2] : [0, 0.2, 9], look: wide ? [2.6, 0.2, 0] : [0, 0.2, 0], exp: 0.72 },
      { pos: [-0.6, -2.2, 4.6], look: [0, 0.8, 0], exp: 0.64 },
      { pos: [0, 0.6, 11.5], look: [0, 0.2, 0], exp: 0.6 },
      { pos: [0, 0.1, 5.4], look: [0, 0.2, 0], exp: 1.05 }
    ];
    var stages = $$("[data-stage]");
    var stageTops = [];
    function measure() {
      stageTops = stages.map(function (s) { return s.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.35; });
      stageTops[0] = 0;
    }
    measure();
    window.addEventListener("load", measure);

    function targetFor(y) {
      var i = 0;
      while (i < stageTops.length - 1 && y >= stageTops[i + 1]) i++;
      var a = KF[Math.min(i, KF.length - 1)];
      var b = KF[Math.min(i + 1, KF.length - 1)];
      var span = (stageTops[i + 1] || stageTops[i] + 1) - stageTops[i];
      var t = i >= stageTops.length - 1 ? 0 : ease(clamp((y - stageTops[i]) / span, 0, 1));
      return {
        pos: [lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t)],
        look: [lerp(a.look[0], b.look[0], t), lerp(a.look[1], b.look[1], t), lerp(a.look[2], b.look[2], t)],
        exp: lerp(a.exp, b.exp, t)
      };
    }

    var cur = targetFor(window.scrollY);
    camera.position.set(cur.pos[0], cur.pos[1], cur.pos[2]);
    var look = new T.Vector3(cur.look[0], cur.look[1], cur.look[2]);

    var mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    if (canHover) {
      window.addEventListener("mousemove", function (e) {
        mouse.x = e.clientX / window.innerWidth - 0.5;
        mouse.y = e.clientY / window.innerHeight - 0.5;
      }, { passive: true });
    }

    var root = document.documentElement;
    window.addEventListener("scroll", function () {
      root.classList.toggle("is-deep", window.scrollY > window.innerHeight * 0.6);
    }, { passive: true });

    function onResize() {
      isSmall = window.innerWidth < 760;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 1.75));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      measure();
    }
    var rz;
    window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(onResize, 120); });

    var visible = true;
    document.addEventListener("visibilitychange", function () { visible = !document.hidden; });

    var speed = reduced ? 0.25 : 1;
    var last = performance.now();
    addUpdater(function (now) {
      if (!visible) { last = now; return; }
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      var t = now / 1000;

      stripeTex.offset.y -= dt * 0.22 * speed;
      pole.rotation.y += dt * 0.12 * speed;
      pole.position.y = Math.sin(t * 0.8) * 0.06;
      rings.forEach(function (r) { r.rotation.z += dt * r.userData.speed * 0.3 * speed; });
      ticks.rotation.y -= dt * 0.2 * speed;
      scanner.position.y = Math.sin(t * 0.9 * speed) * (H / 2 - 0.1);
      scanner.material.opacity = 0.18 + Math.abs(Math.cos(t * 0.9 * speed)) * 0.22;
      core.intensity = 5 + Math.sin(t * 2) * 1.2;

      if (dust) {
        var p = dust.geometry.attributes.position.array, s = dust.userData.spd;
        for (var m = 0; m < s.length; m++) {
          p[m * 3 + 1] += s[m];
          if (p[m * 3 + 1] > 4.5) p[m * 3 + 1] = -4.5;
        }
        dust.geometry.attributes.position.needsUpdate = true;
        dust.rotation.y += dt * 0.03;
      }

      var tg = targetFor(window.scrollY);
      var k = 1 - Math.pow(0.0025, dt); // frame-rate independent smoothing
      mouse.sx += (mouse.x - mouse.sx) * k; mouse.sy += (mouse.y - mouse.sy) * k;
      cur.pos[0] = lerp(cur.pos[0], tg.pos[0], k);
      cur.pos[1] = lerp(cur.pos[1], tg.pos[1], k);
      cur.pos[2] = lerp(cur.pos[2], tg.pos[2], k);
      cur.look[0] = lerp(cur.look[0], tg.look[0], k);
      cur.look[1] = lerp(cur.look[1], tg.look[1], k);
      cur.look[2] = lerp(cur.look[2], tg.look[2], k);
      cur.exp = lerp(cur.exp, tg.exp, k);

      camera.position.set(cur.pos[0] + mouse.sx * 0.6, cur.pos[1] - mouse.sy * 0.4, cur.pos[2]);
      look.set(cur.look[0], cur.look[1], cur.look[2]);
      camera.lookAt(look);
      renderer.toneMappingExposure = cur.exp;
      renderer.render(scene, camera);
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    safe(initSplash, "initSplash");
    safe(initNav, "initNav");
    safe(initReveals, "initReveals");
    safe(initCountUp, "initCountUp");
    safe(initStatus, "initStatus");
    safe(initMagnetic, "initMagnetic");
    safe(initTilt, "initTilt");
    safe(initScramble, "initScramble");
    safe(initBooking, "initBooking");
    safe(initGsap, "initGsap");
    safe(initScene, "initScene");
    var yr = $("[data-year]");
    if (yr) yr.textContent = String(new Date().getFullYear());
    requestAnimationFrame(loop);
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
