/* Interactive CV – page behaviour: parasite picker, section highlighting,
   education map, image viewer and game tabs. No dependencies. */
(function () {
  "use strict";

  var root = document.documentElement;
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function cssVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }

  /* ---------- Pick your parasite (cursor + colours) ---------- */
  var pickerButtons = $$(".picker-btn");
  function currentChoice() {
    if (root.getAttribute("data-cursor") === "arrow") return "arrow";
    return root.getAttribute("data-parasite") || "brucei";
  }
  function applyChoice(choice, remember) {
    if (choice === "arrow") {                       // basic white arrow, default colours
      root.setAttribute("data-cursor", "arrow");
      root.setAttribute("data-parasite", "brucei");
    } else {
      root.setAttribute("data-cursor", "parasite");
      root.setAttribute("data-parasite", choice);
    }
    pickerButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-choice") === choice));
    });
    if (remember) { try { localStorage.setItem("parasite", choice); } catch (e) {} }
    document.dispatchEvent(new CustomEvent("parasitechange", { detail: choice }));
  }
  pickerButtons.forEach(function (b) {
    b.addEventListener("click", function () { applyChoice(b.getAttribute("data-choice"), true); });
  });
  applyChoice(currentChoice(), false);

  /* ---------- Highlight the current section in the navigation ---------- */
  var navLinks = $$(".toc a");
  var sections = [document.getElementById("profile")].concat(navLinks.map(function (a) {
    return document.getElementById(a.getAttribute("href").slice(1));
  })).filter(Boolean);                     // "profile" has no link: nothing is highlighted at the top
  var currentId = null;
  function setCurrent(id) {
    navLinks.forEach(function (a) {
      if (a.getAttribute("href") === "#" + id) {
        a.setAttribute("aria-current", "true");
        var toc = a.closest(".toc");
        if (toc && toc.scrollWidth > toc.clientWidth + 1) {   // navigation wider than the screen
          var box = toc.getBoundingClientRect(), r = a.getBoundingClientRect();
          if (r.left < box.left || r.right > box.right - 24) {
            toc.scrollTo({ left: Math.max(0, toc.scrollLeft + r.left - box.left - 24), behavior: "smooth" });
          }
        }
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }
  var spyQueued = false;
  function spy() {
    spyQueued = false;
    if (!sections.length) return;
    var line = window.innerHeight * 0.35, id = sections[0].id;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= line) id = sections[i].id;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      id = sections[sections.length - 1].id;
    }
    if (id !== currentId) { currentId = id; setCurrent(id); }
  }
  window.addEventListener("scroll", function () {
    if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); }
  }, { passive: true });
  window.addEventListener("resize", spy);
  spy();

  /* ---------- Education map (Leaflet, loaded only when needed) ---------- */
  var LEAFLET_CSS = {
    href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    integrity: "sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w=="
  };
  var LEAFLET_JS = {
    src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    integrity: "sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg=="
  };
  var PLACES = [
    { title: "University of Rouen Normandy", text: "Two-year technical degree (DUT), 2018–2020", ll: [49.01819, 1.135823] },
    { title: "Université Clermont Auvergne", text: "Bachelor’s programme, 2020–2021", ll: [45.760927, 3.115079] },
    { title: "University of Montpellier", text: "MSc 2021–2023, PhD 2023–2026", ll: [43.632327, 3.864331] }
  ];

  function loadLeaflet() {
    return new Promise(function (resolve, reject) {
      if (window.L) { resolve(window.L); return; }
      var link = document.createElement("link");
      link.rel = "stylesheet"; link.href = LEAFLET_CSS.href;
      link.integrity = LEAFLET_CSS.integrity; link.crossOrigin = "anonymous";
      document.head.appendChild(link);
      var script = document.createElement("script");
      script.src = LEAFLET_JS.src; script.integrity = LEAFLET_JS.integrity; script.crossOrigin = "anonymous";
      script.onload = function () { if (window.L) resolve(window.L); else reject(new Error("Leaflet missing")); };
      script.onerror = function () { reject(new Error("Leaflet failed to load")); };
      document.head.appendChild(script);
      setTimeout(function () { if (!window.L) reject(new Error("Leaflet timeout")); }, 12000);
    });
  }

  function mapFallback(el) {
    el.classList.add("is-fallback");
    el.innerHTML = "<p>The map could not load.<br>Normandy, then Clermont-Ferrand, then Montpellier.</p>";
  }

  function initMap(el) {
    loadLeaflet().then(function (L) {
      var map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      var lls = PLACES.map(function (p) { return p.ll; });
      var route = L.polyline(lls, { weight: 3, dashArray: "1 8", lineCap: "round" }).addTo(map);
      var markers = PLACES.map(function (p) {
        return L.circleMarker(p.ll, { radius: 8, weight: 2, fillOpacity: 1 })
          .bindPopup("<strong>" + p.title + "</strong><br>" + p.text)
          .addTo(map);
      });
      function paint() {
        var ink = cssVar("--ink") || "#101820", accent = cssVar("--accent") || "#748da3", accentInk = cssVar("--accent-ink") || "#3e5770";
        route.setStyle({ color: accentInk });
        markers.forEach(function (m) { m.setStyle({ color: ink, fillColor: accent }); });
      }
      paint();
      document.addEventListener("parasitechange", paint);
      map.fitBounds(L.latLngBounds(lls), { padding: [34, 34] });
      map.on("click", function () { map.scrollWheelZoom.enable(); });
      map.on("mouseout", function () { map.scrollWheelZoom.disable(); });
      window.addEventListener("resize", function () { map.invalidateSize(); });
    }).catch(function () { mapFallback(el); });
  }

  var mapEl = document.getElementById("edu-map");
  if (mapEl) {
    if ("IntersectionObserver" in window) {
      var mapObserver = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          mapObserver.disconnect();
          initMap(mapEl);
        }
      }, { rootMargin: "600px 0px" });
      mapObserver.observe(mapEl);
    } else {
      initMap(mapEl);
    }
  }

  /* ---------- Image viewer ---------- */
  var dialog = document.getElementById("lightbox");
  var groups = {};
  var viewing = { group: null, index: 0 };
  if (dialog) {
    var dImg = $("img", dialog), dCap = $("figcaption", dialog);
    $$("[data-lightbox]").forEach(function (btn) {
      var g = btn.getAttribute("data-lightbox");
      (groups[g] = groups[g] || []).push(btn);
      btn.addEventListener("click", function () { openViewer(g, groups[g].indexOf(btn)); });
    });
    var showItem = function () {
      var list = groups[viewing.group], btn = list[viewing.index], thumb = $("img", btn);
      dImg.src = btn.getAttribute("data-full");
      dImg.alt = thumb ? thumb.alt : "";
      dCap.textContent = btn.getAttribute("data-caption") || "";
      dialog.classList.toggle("is-single", list.length < 2);
    };
    var openViewer = function (group, index) {
      viewing.group = group; viewing.index = index;
      showItem();
      if (typeof dialog.showModal === "function") dialog.showModal();
      else window.open(groups[group][index].getAttribute("data-full"), "_blank", "noopener");
    };
    var step = function (n) {
      var len = groups[viewing.group].length;
      viewing.index = (viewing.index + n + len) % len;
      showItem();
    };
    $(".lightbox-close", dialog).addEventListener("click", function () { dialog.close(); });
    $(".lightbox-prev", dialog).addEventListener("click", function () { step(-1); });
    $(".lightbox-next", dialog).addEventListener("click", function () { step(1); });
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog || e.target.classList.contains("lightbox-figure")) dialog.close();
    });
    dialog.addEventListener("close", function () { dImg.removeAttribute("src"); });
  }

  /* ---------- Game tabs ---------- */
  var tabs = $$(".game-tab");
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
    document.dispatchEvent(new CustomEvent("gametabchange", { detail: tab.id }));
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { selectTab(tab, false); });
    tab.addEventListener("keydown", function (e) {
      var next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home") next = tabs[0];
      if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  });
})();
