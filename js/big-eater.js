/* ==========================================================================
   Big Eater
   "Macrophage" means "big eater" in Greek. You play a macrophage clearing a
   tissue of bacteria and debris, while four parasites try to get inside you:
   Leishmania comes straight at you, Toxoplasma cuts you off, Trypanosoma
   cruzi flanks you and a Plasmodium sporozoite glides unpredictably. An IFN-γ
   token activates you for a few seconds: then you can kill them.

   A maze game in the spirit of the arcade classics, with its own maze and
   characters. Calm by design: soft colours, nothing blinks.
   Vector drawings on a canvas sized for the screen's pixel density.
   No dependencies.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- Board ---------- */
  var T = 20, COLS = 29, ROWS = 15, HUD = 30;
  var W = COLS * T, H = HUD + ROWS * T;
  var STEP = 1000 / 60, FPS = 60;
  // left half of the maze; the right half is its mirror image (column 14 is the axis)
  //  # tissue   . bacterium   o IFN-γ   V vessel wall   H inside the vessel   - vessel exit   P start   (space) empty
  var HALF = [
    "###############",
    "#o............#",
    "#.###.###.###.#",
    "#.###.###.###.#",
    "#..............",
    "#.###.####.VVV-",
    "#.###.####.VHHH",
    " ..........VHHH",
    "#.###.####.VHHH",
    "#.###.####.VVVV",
    "#.............P",
    "#.###.###.###.#",
    "#.###.###.###.#",
    "#o............#",
    "###############"
  ];
  var MAP = HALF.map(function (row) { return row + row.slice(0, 14).split("").reverse().join(""); });
  var DOOR = { c: 14, r: 5 }, ABOVE_DOOR = { c: 14, r: 4 }, START = { c: 14, r: 10 };
  var TUNNEL_ROW = 7;
  var DIRS = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
  var ORDER = ["up", "left", "down", "right"];          // tie-break order when two moves are as good
  var OPP = { up: "down", down: "up", left: "right", right: "left" };

  var CFG = {
    playerSpeed: 4.0, ghostSpeed: 3.6, frightSpeed: 2.2, tunnelSpeed: 1.9, plasmoFactor: 0.92, plasmoWhim: 0.3,
    ifnSeconds: 8, lives: 3, extraLifeAt: 5000,
    modes: [7, 20, 7, 20, 5, 20, 5, Infinity]       // scatter, chase, scatter, chase… (seconds)
  };
  var COLORS = {
    bg: "#fbf8fa", wall: "#ece4ee", wallEdge: "#c8b7d0", hud: "#26323e", hudSoft: "#6b6772",
    vessel: "#f6dedd", vesselEdge: "#d6a19f", lumen: "#fcf0ef", rbc: "#efb6b3", rbcPale: "#f7d6d4",
    panel: "#ffffff", panelEdge: "#101820", bar: "#f2c457", barEnd: "#e3923b", barBg: "#efe8f1"
  };

  var FACTS = [
    "<strong>Did you know?</strong> “Macrophage” means “big eater” in Greek. Élie Metchnikoff discovered phagocytosis in starfish larvae in 1882, work that earned him the Nobel Prize in 1908.",
    "<strong>Did you know?</strong> <i>Leishmania</i> lives inside macrophages: it survives in the very compartment meant to digest it, the phagolysosome.",
    "<strong>Did you know?</strong> <i>Leishmania</i> can hide inside neutrophils, which macrophages then eat: a Trojan horse into its favorite host cell.",
    "<strong>Did you know?</strong> <i>Toxoplasma gondii</i> can infect almost any warm-blooded animal, and it rides inside immune cells to spread through the body.",
    "<strong>Did you know?</strong> <i>Trypanosoma cruzi</i>, the agent of Chagas disease, enters cells inside a vacuole, then breaks out into the cytoplasm to multiply.",
    "<strong>Did you know?</strong> On their way to the liver cells, <i>Plasmodium</i> sporozoites can pass straight through Kupffer cells, the macrophages of the liver.",
    "<strong>Did you know?</strong> Malaria parasites digest hemoglobin and lock its toxic heme into crystals of hemozoin. Macrophages that swallow hemozoin work less well.",
    "<strong>Did you know?</strong> On a glass slide, <i>Plasmodium</i> sporozoites glide in circles.",
    "<strong>Did you know?</strong> Interferon-γ, made by T cells and NK cells, activates macrophages: they then produce nitric oxide and reactive oxygen species that kill intracellular parasites."
  ];

  /* ---------- Helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; } return null; }
  function tileAt(c, r) {
    if (r < 0 || r >= ROWS) return "#";
    c = ((c % COLS) + COLS) % COLS;
    return MAP[r][c];
  }
  function isWall(ch) { return ch === "#" || ch === "V"; }
  function wrapC(c) { return ((c % COLS) + COLS) % COLS; }

  /* ==========================================================================
     Artwork: flat fills, thin dark outlines, hand-drawn-looking curves.
     Each sprite is drawn around (0, 0), facing +x, about 24 units long.
     ========================================================================== */
  var INK = "#25222b", TAU = Math.PI * 2;
  var PAL = {
    macro: { body: "#c4a1d2", nucleus: "#8a64a1", vac: "#ecdff1", ink: INK },
    leish: { body: "#b8cf3c", light: "#dce98f", ink: INK },
    toxo: { body: "#e5a85c", light: "#f5d6a3", ink: INK },
    cruzi: { body: "#7d93ab", light: "#b9c8d8", ink: INK },
    plasmo: { body: "#ea8c80", nucleus: "#a94860", ink: INK },
    pale: { body: "#dde4ee", light: "#f1f4f8", nucleus: "#b7c2d3", vac: "#eef2f7", ink: "#7d889c" },
    grey: { body: "#d4d0d8", nucleus: "#a8a2ae", vac: "#ebe8ee", ink: "#6e6875" }
  };
  function smoothClosed(ctx, p) {
    var n = p.length;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    ctx.closePath();
  }
  function smoothOpen(ctx, p) {
    ctx.moveTo(p[0][0], p[0][1]);
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
  }
  function ellipse(ctx, x, y, rx, ry, rot, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fillStyle = fill; ctx.fill();
  }
  function outline(ctx, fill, ink, w) {
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = w || 1.05; ctx.strokeStyle = ink; ctx.lineJoin = "round"; ctx.stroke();
  }
  function ribbon(center, hw) {             // outline of a body built around a centerline
    var n = center.length, left = [], right = [];
    for (var i = 0; i < n; i++) {
      var a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len, w = hw(i / (n - 1));
      left.push([center[i][0] + nx * w, center[i][1] + ny * w]);
      right.push([center[i][0] - nx * w, center[i][1] - ny * w]);
    }
    return left.concat(right.reverse());
  }
  function flagellum(ctx, x0, y0, ang, len, amp, waves, phase, ink, w) {
    var pts = [], c = Math.cos(ang), s = Math.sin(ang), N = 18;
    for (var i = 0; i <= N; i++) {
      var u = i / N, along = u * len, side = Math.sin(u * waves * TAU - phase) * amp * Math.min(1, u * 2.2);
      pts.push([x0 + c * along - s * side, y0 + s * along + c * side]);
    }
    ctx.beginPath(); smoothOpen(ctx, pts);
    ctx.lineWidth = w || 1.1; ctx.lineCap = "round"; ctx.strokeStyle = ink; ctx.stroke();
  }

  var ART = {
    macrophage: function (ctx, open, pal) {       // a phagocytic cup that opens and closes
      pal = pal || PAL.macro;
      var R = 10.6, a = 0.1 + open * 0.56, pts = [], N = 44;
      for (var i = 0; i <= N; i++) {
        var t = a + (TAU - 2 * a) * i / N;
        var d = Math.min(t - a, TAU - a - t);
        var r = R * (1 + 0.05 * Math.sin(5 * t + 0.7) + 0.03 * Math.sin(9 * t + 2.2)) * (1 + 0.1 * Math.exp(-d * d / 0.09));
        pts.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
      var lo = pts[0], up = pts[pts.length - 1], bx = 3.4 + 3 * (1 - open);
      ctx.beginPath();
      smoothOpen(ctx, pts);
      ctx.quadraticCurveTo(bx + (up[0] - bx) * 0.22, up[1] * 0.9, bx, 0);
      ctx.quadraticCurveTo(bx + (lo[0] - bx) * 0.22, lo[1] * 0.9, lo[0], lo[1]);
      ctx.closePath();
      outline(ctx, pal.body, pal.ink, 1.1);
      ctx.save(); ctx.translate(-4.2, -1.2); ctx.rotate(-0.35);
      smoothClosed(ctx, [[-3.4, -0.6], [-2.2, -2.6], [0.6, -2.8], [2.6, -1.4], [2.4, 0.9], [0.9, 1.1], [-0.4, 0.3], [-1.6, 1.6], [-3.1, 1.3]]);
      ctx.fillStyle = pal.nucleus; ctx.fill();
      ctx.restore();
      ellipse(ctx, -1.6, 5.2, 1.7, 1.5, 0, pal.vac);
      ellipse(ctx, -5.6, 3.4, 1.1, 1.0, 0, pal.vac);
    },
    leish: function (ctx, t, pal) {               // Leishmania promastigote, flagellum in front
      pal = pal || PAL.leish;
      ctx.save(); ctx.translate(-3.5, 0);
      smoothClosed(ctx, [[7.4, 0], [5.8, -2.8], [1.2, -3.5], [-3.8, -2.8], [-8, -1.1], [-9.6, 0.4], [-7.6, 1.7], [-3.4, 2.9], [1.6, 3.4], [5.9, 2.6]]);
      outline(ctx, pal.body, pal.ink);
      ellipse(ctx, -1.6, 0.1, 2.3, 1.7, 0, pal.light);
      ellipse(ctx, 4.5, 0.1, 0.8, 0.8, 0, pal.ink);
      flagellum(ctx, 7.4, 0, 0, 10.5, 1.5, 1.2, t * 5, pal.ink, 1.1);
      ctx.restore();
    },
    toxo: function (ctx, t, pal) {                // Toxoplasma tachyzoite: a crescent, apical end in front
      pal = pal || PAL.toxo;
      var c = [];
      for (var i = 0; i <= 24; i++) { var x = -9 + 18 * i / 24; c.push([x, 2.4 - 0.05 * x * x]); }
      smoothClosed(ctx, ribbon(c, function (u) { return 7.2 * Math.pow(u, 0.42) * Math.pow(1 - u, 0.8) + 0.25; }));
      outline(ctx, pal.body, pal.ink);
      ellipse(ctx, -2.4, 2.0, 2.3, 1.8, 0.25, pal.light);
      ctx.beginPath(); ctx.moveTo(7.7, -1.3); ctx.quadraticCurveTo(5.6, -0.4, 3.6, 0.5);
      ctx.moveTo(7.5, -0.6); ctx.quadraticCurveTo(5.4, 0.4, 3.8, 1.5);
      ctx.lineWidth = 0.6; ctx.strokeStyle = pal.ink; ctx.globalAlpha *= 0.7; ctx.stroke(); ctx.globalAlpha /= 0.7;
    },
    cruzi: function (ctx, t, pal) {               // T. cruzi trypomastigote: C shape, big kinetoplast
      pal = pal || PAL.cruzi;
      var c = [], edge = [], R = 8, A0 = 192, A1 = 348;
      for (var i = 0; i <= 24; i++) {
        var th = (A0 + (A1 - A0) * i / 24) * Math.PI / 180;
        c.push([Math.cos(th) * R, 4.4 + Math.sin(th) * R]);
      }
      var hw = function (u) { return 2.3 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.7) + 0.25; };
      smoothClosed(ctx, ribbon(c, hw));
      ctx.fillStyle = pal.body; ctx.fill();
      ctx.lineWidth = 0.7; ctx.strokeStyle = pal.ink; ctx.lineJoin = "round"; ctx.stroke();
      ellipse(ctx, 0, -3.5, 1.8, 1.25, 0, pal.light);
      var k = c[3]; ellipse(ctx, k[0] + 0.5, k[1], 1.15, 1.15, 0, pal.ink);
      for (var j = 4; j <= 24; j++) {             // the flagellum along the outer edge (undulating membrane)
        var th2 = (A0 + (A1 - A0) * j / 24) * Math.PI / 180, wob = 0.35 * Math.sin(j * 0.9 - t * 6);
        var r = R + hw(j / 24) * 0.85 + wob;
        edge.push([Math.cos(th2) * r, 4.4 + Math.sin(th2) * r]);
      }
      ctx.beginPath(); smoothOpen(ctx, edge);
      ctx.lineWidth = 1.35; ctx.lineCap = "round"; ctx.strokeStyle = pal.ink; ctx.stroke();
      var last = edge[edge.length - 1];
      flagellum(ctx, last[0], last[1], 1.25, 7.5, 1.2, 1, t * 5, pal.ink, 1.1);
    },
    plasmo: function (ctx, t, pal) {              // Plasmodium sporozoite: a long slender sickle, apical end in front
      pal = pal || PAL.plasmo;
      var c = [];
      for (var i = 0; i <= 26; i++) { var x = -11.5 + 23 * i / 26; c.push([x, -2.4 + 0.042 * x * x]); }
      smoothClosed(ctx, ribbon(c, function (u) { return 2.2 * Math.pow(Math.sin(Math.PI * u), 0.55) * (1.05 - 0.25 * u) + 0.2; }));
      outline(ctx, pal.body, pal.ink, 1);
      ellipse(ctx, -0.8, -2.3, 2.3, 1.15, 0.05, pal.nucleus);
    },
    bacterium: function (ctx, angle) {           // a small rod (bacillus), each one turned its own way
      var dx = Math.cos(angle) * 1.9, dy = Math.sin(angle) * 1.9;
      ctx.beginPath(); ctx.moveTo(-dx, -dy); ctx.lineTo(dx, dy);
      ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#b8a990"; ctx.stroke();
    },
    interferon: function (ctx) {
      ctx.beginPath(); ctx.arc(0, 0, 5.6, 0, TAU);
      outline(ctx, "#f2c457", "#6d5424", 1);
      ctx.fillStyle = "#4a3a14"; ctx.font = "600 9px 'Fira Sans', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("γ", 0, 0.8);
    }
  };

  /* The four parasites. `aim` returns the tile each one heads for when chasing. */
  var GHOSTS = [
    { kind: "leish", name: "Leishmania", slot: { c: 14, r: 4 }, release: 0, corner: { c: 27, r: -3 },
      death: ["Infected!", "Leishmania moved in: it will now live and multiply inside you."] },
    { kind: "toxo", name: "Toxoplasma", slot: { c: 14, r: 7 }, release: 1.5, corner: { c: 1, r: -3 },
      death: ["Infected!", "Toxoplasma invaded you and hid in a vacuole of its own making."] },
    { kind: "cruzi", name: "Trypanosoma cruzi", slot: { c: 12, r: 7 }, release: 5, corner: { c: 28, r: 17 },
      death: ["Infected!", "Trypanosoma cruzi got in, then broke out of your phagosome."] },
    { kind: "plasmo", name: "Plasmodium", slot: { c: 16, r: 7 }, release: 9, corner: { c: 0, r: 17 },
      death: ["Traversed!", "A Plasmodium sporozoite went straight through you on its way to the liver."] }
  ];

  /* ==========================================================================
     Game instance
     ========================================================================== */
  function mount(root) {
    root.classList.add("be");
    root.innerHTML =
      '<div class="be-frame" tabindex="0" role="application" aria-label="Big Eater game area" aria-describedby="be-help">' +
        '<canvas class="be-canvas"></canvas>' +
      "</div>" +
      '<div class="be-pad" role="group" aria-label="Direction buttons">' +
        '<button type="button" data-dir="up" aria-label="Up">↑</button>' +
        '<button type="button" data-dir="left" aria-label="Left">←</button>' +
        '<button type="button" data-dir="down" aria-label="Down">↓</button>' +
        '<button type="button" data-dir="right" aria-label="Right">→</button>' +
      "</div>" +
      '<div class="run-console">' +
        '<div class="run-info"><h3 class="run-title"></h3><p class="run-text"></p><p class="run-fact"></p></div>' +
        '<div class="run-actions">' +
          '<button type="button" class="btn btn-primary" data-action="main">Start</button>' +
          '<button type="button" class="btn" data-action="sound" aria-pressed="false">Sound off</button>' +
        "</div>" +
        '<p class="run-help" id="be-help"><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> or <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to move, <kbd>P</kbd> to pause. On a phone, swipe on the game or use the arrow buttons.</p>' +
      "</div>" +
      '<p class="sr-only" aria-live="polite" data-live></p>';

    var frame = root.querySelector(".be-frame");
    var canvas = root.querySelector("canvas");
    var ctx = canvas.getContext("2d");
    var elTitle = root.querySelector(".run-title"), elText = root.querySelector(".run-text"), elFact = root.querySelector(".run-fact");
    var btnMain = root.querySelector('[data-action="main"]'), btnSound = root.querySelector('[data-action="sound"]');
    var live = root.querySelector("[data-live]");
    var touchUI = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ----- state ----- */
    var state = "ready", stateT = 0, tick = 0, level = 1, score = 0, lives = CFG.lives, extraGiven = false;
    var best = parseInt(store("bigEater.best"), 10) || 0, newRecord = false;
    var dots = null, dotsLeft = 0, modeIdx = 0, modeT = 0, ifnT = 0, ifnTotal = 1, chain = 0;
    var player = null, ghosts = [], popups = [], eaten = null, killer = null, lastFact = -1, toastT = 0;
    var inView = true, rafActive = false, lastTs = 0, acc = 0;
    var sound = store("bigEater.sound") === "on", audioCtx = null;
    var scale = 1, wallLayer = null;

    /* ----- sizing: the canvas is drawn at the screen's real resolution ----- */
    function resize() {
      var cssW = frame.clientWidth;
      if (!cssW) return;
      var dpr = Math.min(3, window.devicePixelRatio || 1);
      var bw = Math.round(cssW * dpr), bh = Math.round(cssW * H / W * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw; canvas.height = bh;
        scale = bw / W;
        buildWalls();
      }
      render();
    }
    function buildWalls() {
      wallLayer = document.createElement("canvas");
      wallLayer.width = canvas.width; wallLayer.height = canvas.height;
      var g = wallLayer.getContext("2d");
      g.setTransform(scale, 0, 0, scale, 0, HUD * scale);
      // tissue blocks: a union of tiles, grown back with round joins for soft corners
      function union(inset) {
        g.beginPath();
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          if (MAP[r][c] !== "#") continue;
          var x = c * T, y = r * T;
          g.rect(x + inset, y + inset, T - 2 * inset, T - 2 * inset);
          if (c + 1 < COLS && MAP[r][c + 1] === "#") g.rect(x + T - inset, y + inset, 2 * inset, T - 2 * inset);
          if (r + 1 < ROWS && MAP[r + 1][c] === "#") g.rect(x + inset, y + T - inset, T - 2 * inset, 2 * inset);
          if (c + 1 < COLS && r + 1 < ROWS && MAP[r][c + 1] === "#" && MAP[r + 1][c] === "#" && MAP[r + 1][c + 1] === "#")
            g.rect(x + T - inset, y + T - inset, 2 * inset, 2 * inset);
        }
      }
      var inset = 4, round = 3.5, edge = 1.2;
      g.lineJoin = "round";
      union(inset + round);
      g.fillStyle = COLORS.wallEdge; g.strokeStyle = COLORS.wallEdge; g.lineWidth = 2 * (round + edge); g.fill(); g.stroke();
      g.fillStyle = COLORS.wall; g.strokeStyle = COLORS.wall; g.lineWidth = 2 * round; g.fill(); g.stroke();
      // the blood vessel the parasites come from
      var vx = 11 * T + 4, vy = 5 * T + 4, vw = 7 * T - 8, vh = 5 * T - 8;
      g.beginPath(); g.roundRect ? g.roundRect(vx, vy, vw, vh, 12) : g.rect(vx, vy, vw, vh);
      g.fillStyle = COLORS.vessel; g.fill(); g.lineWidth = 1.4; g.strokeStyle = COLORS.vesselEdge; g.stroke();
      g.beginPath(); g.roundRect ? g.roundRect(12 * T - 3, 6 * T - 3, 5 * T + 6, 3 * T + 6, 9) : g.rect(12 * T - 3, 6 * T - 3, 5 * T + 6, 3 * T + 6);
      g.fillStyle = COLORS.lumen; g.fill();
      // the gap the parasites squeeze through
      var gx = (DOOR.c + 0.5) * T;
      g.fillStyle = COLORS.lumen; g.fillRect(gx - 6, vy - 2, 12, 6 * T - 2 - vy + 4);
      g.beginPath(); g.moveTo(gx - 6, vy); g.lineTo(gx - 6, 6 * T - 3); g.moveTo(gx + 6, vy); g.lineTo(gx + 6, 6 * T - 3);
      g.lineWidth = 1.4; g.strokeStyle = COLORS.vesselEdge; g.stroke();
      [[12.35, 7.5], [16.65, 7.5]].forEach(function (p) {
        ellipse(g, p[0] * T, p[1] * T, 3.6, 2.4, 0, COLORS.rbc);
        ellipse(g, p[0] * T, p[1] * T, 1.6, 0.9, 0, COLORS.rbcPale);
      });
    }

    /* ----- sound (off by default) ----- */
    function beep(f1, f2, dur, type, vol, delay) {
      if (!sound) return;
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        var t = audioCtx.currentTime + (delay || 0), o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type || "triangle";
        o.frequency.setValueAtTime(f1, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
        g.gain.setValueAtTime(vol || 0.035, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + dur + 0.03);
      } catch (e) { /* audio is optional */ }
    }
    var sfx = {
      chomp: function (n) { beep(n % 2 ? 330 : 262, 0, 0.05, "triangle", 0.025); },
      ifn: function () { beep(392, 784, 0.25, "triangle", 0.04); },
      kill: function () { beep(523, 1046, 0.12, "square", 0.025); },
      death: function () { beep(392, 98, 0.7, "triangle", 0.045); },
      clear: function () { [523, 659, 784, 1046].forEach(function (f, i) { beep(f, 0, 0.09, "triangle", 0.03, i * 0.1); }); },
      life: function () { beep(784, 0, 0.08, "triangle", 0.03); beep(1046, 0, 0.12, "triangle", 0.03, 0.1); }
    };
    function syncSoundButton() {
      btnSound.setAttribute("aria-pressed", String(sound));
      btnSound.textContent = sound ? "Sound on" : "Sound off";
    }

    /* ----- level set-up ----- */
    function speeds() {
      var f = Math.min(1 + 0.05 * (level - 1), 1.25), fp = Math.min(1 + 0.03 * (level - 1), 1.15);
      return {
        player: CFG.playerSpeed * fp / FPS, ghost: CFG.ghostSpeed * f / FPS,
        fright: CFG.frightSpeed / FPS, tunnel: CFG.tunnelSpeed / FPS
      };
    }
    function ifnFrames() { return Math.round(Math.max(2.5, CFG.ifnSeconds - (level - 1)) * FPS); }
    function fillDots() {
      dots = []; dotsLeft = 0;
      for (var r = 0; r < ROWS; r++) {
        dots.push([]);
        for (var c = 0; c < COLS; c++) {
          var ch = MAP[r][c], v = ch === "." ? 1 : ch === "o" ? 2 : 0;
          dots[r].push(v);
          if (v) dotsLeft++;
        }
      }
    }
    function placeActors() {
      player = { c: START.c, r: START.r, dir: "left", want: "left", p: 0, moving: false, phase: 0 };
      ghosts = GHOSTS.map(function (def) {
        var g = { def: def, kind: def.kind, mode: def.slot.r === ABOVE_DOOR.r ? "active" : "house",
                  c: def.slot.c, r: def.slot.r, dir: "left", p: 0,
                  x: (def.slot.c + 0.5) * T, y: (def.slot.r + 0.5) * T,
                  releaseAt: Math.round(def.release * Math.max(0.4, 1 - 0.15 * (level - 1)) * FPS), fright: false, deadT: 0 };
        return g;
      });
      modeIdx = 0; modeT = 0; ifnT = 0; chain = 0; popups = []; eaten = null; stateT = 0;
    }
    function newGame() {
      level = 1; score = 0; lives = CFG.lives; extraGiven = false; newRecord = false;
      fillDots(); placeActors();
    }

    /* ----- movement on the grid ----- */
    function canEnter(c, r, who) {
      var ch = tileAt(c, r);
      if (isWall(ch)) return false;
      if (ch === "-" || ch === "H") return who === "house";
      return true;
    }
    function posOf(e) {                         // centre of an actor, in maze pixels
      var d = DIRS[e.dir];
      return { x: (e.c + 0.5 + d[0] * e.p) * T, y: (e.r + 0.5 + d[1] * e.p) * T };
    }
    function reverse(e) {
      var d = DIRS[e.dir];
      if (e.p > 0) { e.c = wrapC(e.c + d[0]); e.r += d[1]; e.p = 1 - e.p; }
      e.dir = OPP[e.dir];
    }
    function inTunnel(e) { return e.r === TUNNEL_ROW && (e.c <= 4 || e.c >= COLS - 5); }

    function stepPlayer(dist) {
      var e = player;
      e.moving = false;
      if (e.want === OPP[e.dir] && e.p > 0) reverse(e);
      var guard = 0;
      while (dist > 0 && guard++ < 4) {
        if (e.p === 0) {                          // at a tile centre: turn, carry on, or stop
          eatAt(e.c, e.r);
          var w = DIRS[e.want];
          if (e.want && canEnter(e.c + w[0], e.r + w[1], "player")) e.dir = e.want;
          var d = DIRS[e.dir];
          if (!canEnter(e.c + d[0], e.r + d[1], "player")) return;
        }
        var step = Math.min(dist, 1 - e.p);
        e.p += step; dist -= step; e.moving = true;
        e.phase += step * 2.2;
        if (e.p >= 1 - 1e-9) {
          var dd = DIRS[e.dir];
          e.c = wrapC(e.c + dd[0]); e.r += dd[1]; e.p = 0;
        }
      }
    }
    function eatAt(c, r) {
      var v = dots[r] && dots[r][c];
      if (!v) return;
      dots[r][c] = 0; dotsLeft--;
      if (v === 1) { addScore(10); sfx.chomp(dotsLeft); }
      else {
        addScore(50); sfx.ifn();
        ifnTotal = ifnT = ifnFrames(); chain = 0;
        ghosts.forEach(function (g) { if (g.mode === "active") { g.fright = true; reverse(g); } });
        toast("Activated by IFN-γ: you can kill the parasites for " + Math.round(ifnTotal / FPS) + " seconds.");
      }
    }
    function addScore(n) {
      score += n;
      if (!extraGiven && score >= CFG.extraLifeAt) { extraGiven = true; lives++; sfx.life(); toast("Extra life!"); }
    }

    function targetOf(g) {
      if (modeIdx % 2 === 0) return g.def.corner;                   // scatter: each to its own corner
      var pc = player.c, pr = player.r, d = DIRS[player.dir];
      if (g.kind === "leish") return { c: pc, r: pr };
      if (g.kind === "toxo") return { c: pc + 4 * d[0], r: pr + 4 * d[1] };
      if (g.kind === "cruzi") {
        var l = ghosts[0], ax = pc + 2 * d[0], ay = pr + 2 * d[1];
        return { c: ax + (ax - l.c), r: ay + (ay - l.r) };
      }
      var dx = g.c - pc, dy = g.r - pr;                             // Plasmodium: wanders off when close
      return dx * dx + dy * dy > 64 ? { c: pc, r: pr } : g.def.corner;
    }
    function chooseDir(g) {
      var opts = ORDER.filter(function (k) {
        if (k === OPP[g.dir]) return false;
        var d = DIRS[k];
        return canEnter(g.c + d[0], g.r + d[1], "ghost");
      });
      if (!opts.length) return OPP[g.dir];
      if (g.fright || (g.kind === "plasmo" && Math.random() < CFG.plasmoWhim)) return opts[Math.floor(Math.random() * opts.length)];
      var tg = targetOf(g), bestK = opts[0], bestD = Infinity;
      opts.forEach(function (k) {
        var d = DIRS[k], nc = g.c + d[0], nr = g.r + d[1];
        var dd = (nc - tg.c) * (nc - tg.c) + (nr - tg.r) * (nr - tg.r);
        if (dd < bestD) { bestD = dd; bestK = k; }
      });
      return bestK;
    }
    function stepGhost(g, sp) {
      if (g.mode === "dead") {
        if (--g.deadT <= 0) {
          g.mode = "house"; g.x = (DOOR.c + 0.5) * T; g.y = 7.5 * T; g.releaseAt = stateT + 40; g.fright = false;
        }
        return;
      }
      if (g.mode === "house") {
        g.y = 7.5 * T + Math.sin((tick + g.def.slot.c * 7) / 14) * 3;
        if (stateT >= g.releaseAt) g.mode = "leaving";
        return;
      }
      if (g.mode === "leaving") {                 // slide to the gap, then out through it
        var v = sp.ghost * T, cx = (DOOR.c + 0.5) * T;
        if (Math.abs(g.x - cx) > 0.5) { g.x += clamp(cx - g.x, -v, v); g.y += clamp(7.5 * T - g.y, -v, v); return; }
        g.x = cx; g.y -= v;
        if (g.y <= (ABOVE_DOOR.r + 0.5) * T) {
          g.mode = "active"; g.c = ABOVE_DOOR.c; g.r = ABOVE_DOOR.r; g.p = 0;
          g.dir = Math.random() < 0.5 ? "left" : "right";
        }
        return;
      }
      var speed = g.fright ? sp.fright : inTunnel(g) ? sp.tunnel : sp.ghost;
      if (g.kind === "plasmo" && !g.fright) speed *= CFG.plasmoFactor;
      var dist = speed, guard = 0;
      while (dist > 0 && guard++ < 4) {
        if (g.p === 0) g.dir = chooseDir(g);
        var step = Math.min(dist, 1 - g.p);
        g.p += step; dist -= step;
        if (g.p >= 1 - 1e-9) {
          var d = DIRS[g.dir];
          g.c = wrapC(g.c + d[0]); g.r += d[1]; g.p = 0;
        }
      }
    }
    function ghostPos(g) { return g.mode === "active" ? posOf(g) : { x: g.x, y: g.y }; }
    function wrapDist(a, b) {
      var dx = Math.abs(a.x - b.x); dx = Math.min(dx, W - dx);
      return Math.hypot(dx, a.y - b.y);
    }

    /* ----- run lifecycle ----- */
    function setState(s) { state = s; stateT = 0; }
    function startGame() {
      newGame();
      setState("getready");
      frame.classList.add("is-playing");
      showConsole("running");
      frame.focus({ preventScroll: true });
      announce("New game. Level 1.");
      ensureLoop();
    }
    function pause(reason) {
      if (state !== "playing" && state !== "getready") return;
      root.dataset.resume = state;
      state = "paused";
      frame.classList.remove("is-playing");
      showConsole("paused", reason);
      render();
    }
    function resume() {
      if (state !== "paused") return;
      state = root.dataset.resume || "playing";
      frame.classList.add("is-playing");
      showConsole("running");
      frame.focus({ preventScroll: true });
      ensureLoop();
    }
    function loseLife(g) {
      killer = g.def;
      setState("dying");
      sfx.death();
      toast(killer.death[0] + " " + killer.death[1]);
    }
    function finishDying() {
      lives--;
      if (lives <= 0) { gameOver(); return; }
      placeActors();
      setState("getready");
      toast(killer.death[1] + " " + lives + (lives > 1 ? " lives" : " life") + " left.");
    }
    function gameOver() {
      setState("over");
      frame.classList.remove("is-playing");
      if (score > best) { best = score; newRecord = true; store("bigEater.best", String(best)); }
      showConsole("over");
      render();
    }
    function levelCleared() {
      setState("clear");
      sfx.clear();
      announce("Tissue cleared! Level " + (level + 1) + ".");
    }

    /* ----- console below the canvas ----- */
    function factHtml() {
      var i;
      do { i = Math.floor(Math.random() * FACTS.length); } while (FACTS.length > 1 && i === lastFact);
      lastFact = i;
      return FACTS[i];
    }
    function showConsole(mode, info) {
      elFact.hidden = true;
      if (mode === "ready") {
        elTitle.textContent = "Big Eater";
        elText.innerHTML = "“Macrophage” means “big eater” in Greek. Clear the tissue of bacteria and debris, and keep away from the parasites that want to get inside you. " +
          "An <strong>IFN-γ</strong> token activates you for a few seconds: then you can kill them.";
        elFact.innerHTML = "<i>Leishmania</i> comes straight at you, <i>Toxoplasma</i> cuts you off, <i>T. cruzi</i> flanks you and <i>Plasmodium</i> glides unpredictably.";
        elFact.hidden = false;
        btnMain.textContent = "Start";
      } else if (mode === "running") {
        elTitle.textContent = "Level " + level;
        elText.textContent = info || "Eat the bacteria and keep away from the parasites. Grab an IFN-γ to fight back.";
        btnMain.textContent = "Pause";
      } else if (mode === "paused") {
        elTitle.textContent = "Paused";
        elText.textContent = info || "Press Space, tap the game or choose Resume to continue.";
        btnMain.textContent = "Resume";
      } else if (mode === "over") {
        var d = killer ? killer.death : ["Game over", ""];
        elTitle.textContent = d[0];
        elText.textContent = d[1] + " Score " + score + (newRecord && score > 0 ? ", a new record!" : ". Best " + best + ".") +
          (level > 1 ? " You reached level " + level + "." : "");
        elFact.innerHTML = factHtml();
        elFact.hidden = false;
        btnMain.textContent = "Play again";
        announce(d[0] + " " + d[1] + " Score " + score + ".");
      }
    }
    function toast(msg) {
      elText.textContent = msg; toastT = 5 * FPS;
      announce(msg);
    }
    function announce(msg) { live.textContent = msg; }

    /* ----- input ----- */
    function setWant(k) {
      if (state === "ready" || state === "over") { startGame(); player.want = k; return; }
      if (state === "paused") { resume(); }
      if (player) player.want = k;
    }
    var KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", W: "up", s: "down", S: "down", a: "left", A: "left", d: "right", D: "right" };
    function panelVisible() { return !root.closest("[hidden]"); }
    document.addEventListener("keydown", function (e) {
      if (!panelVisible()) return;
      var focused = root.contains(document.activeElement);
      var active = (state === "playing" || state === "getready") && inView;
      if (!focused && !active) return;
      if (e.target.closest && e.target.closest("[role=tab]")) return;
      var onButton = e.target !== frame && e.target.closest && e.target.closest("button");
      var k = KEYMAP[e.key];
      if (k) { e.preventDefault(); setWant(k); return; }
      if ((e.key === " " || e.key === "Enter") && !onButton) {
        e.preventDefault();
        if (state === "ready" || state === "over") startGame();
        else if (state === "paused") resume();
      } else if ((e.key === "p" || e.key === "P" || e.key === "Escape") && (state === "playing" || state === "getready")) {
        e.preventDefault(); pause();
      }
    });
    // swipes and taps on the game
    var swipe = null;
    frame.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      frame.focus({ preventScroll: true });
      swipe = { x: e.clientX, y: e.clientY, used: false, id: e.pointerId };
      if (state === "playing" || state === "getready") { e.preventDefault(); try { frame.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    });
    frame.addEventListener("pointermove", function (e) {
      if (!swipe || e.pointerId !== swipe.id) return;
      var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
      if (state === "playing" || state === "getready") {
        player.want = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
        swipe.x = e.clientX; swipe.y = e.clientY; swipe.used = true;
      }
    });
    frame.addEventListener("pointerup", function () {
      if (swipe && !swipe.used) {
        if (state === "ready" || state === "over") startGame();
        else if (state === "paused") resume();
      }
      swipe = null;
    });
    frame.addEventListener("pointercancel", function () { swipe = null; });
    root.querySelectorAll("[data-dir]").forEach(function (b) {
      b.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        b.classList.add("is-down");
        setWant(b.getAttribute("data-dir"));
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { b.addEventListener(t, function () { b.classList.remove("is-down"); }); });
      b.addEventListener("click", function (e) { if (e.detail === 0) setWant(b.getAttribute("data-dir")); });   // keyboard activation
      b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
    btnMain.addEventListener("click", function () {
      if (state === "ready" || state === "over") startGame();
      else if (state === "paused") resume();
      else pause();
    });
    btnSound.addEventListener("click", function () {
      sound = !sound; store("bigEater.sound", sound ? "on" : "off"); syncSoundButton();
      if (sound) beep(660, 0, 0.06);
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });
    document.addEventListener("gametabchange", function () {
      if (!panelVisible()) pause(); else { resize(); }
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        inView = e.isIntersecting && e.intersectionRatio >= 0.5;
        if (!inView) pause("Paused while the game was off screen.");
      }, { threshold: [0, 0.5, 1] }).observe(frame);
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(frame);
    else window.addEventListener("resize", resize);

    /* ----- update ----- */
    function update() {
      tick++; stateT++;
      if (toastT > 0 && --toastT === 0 && state === "playing") elText.textContent = "Eat the bacteria and keep away from the parasites. Grab an IFN-γ to fight back.";
      popups = popups.filter(function (p) { return ++p.t < 60; });
      if (state === "getready") { if (stateT >= (reduceMotion ? 50 : 80)) setState("playing"); return; }
      if (state === "dying") { if (stateT >= 100) finishDying(); return; }
      if (state === "clear") {
        if (stateT >= 130) { level++; fillDots(); placeActors(); setState("getready"); showConsole("running", "Level " + level + ": the parasites are a little faster."); }
        return;
      }
      if (state !== "playing") return;

      var sp = speeds();
      if (eaten) { if (++eaten.t >= 24) eaten = null; else return; }   // a short pause while a parasite is digested
      if (ifnT > 0) {
        if (--ifnT === 0) { ghosts.forEach(function (g) { g.fright = false; }); chain = 0; }
      } else if (CFG.modes[modeIdx] !== Infinity && ++modeT >= CFG.modes[modeIdx] * FPS) {
        modeIdx++; modeT = 0;
        ghosts.forEach(function (g) { if (g.mode === "active") reverse(g); });
      }
      stepPlayer(sp.player);
      ghosts.forEach(function (g) { stepGhost(g, sp); });

      var pp = posOf(player);
      for (var i = 0; i < ghosts.length; i++) {
        var g = ghosts[i];
        if (g.mode !== "active") continue;
        var gp = ghostPos(g);
        if (wrapDist(pp, gp) > T * 0.6) continue;
        if (g.fright) {
          chain++;
          var pts = 100 * Math.pow(2, chain);
          addScore(pts); sfx.kill();
          popups.push({ x: gp.x, y: gp.y, text: String(pts), t: 0 });
          eaten = { g: g, x: gp.x, y: gp.y, t: 0 };
          g.mode = "dead"; g.fright = false; g.deadT = 150;
          toast(g.def.name + " destroyed: +" + pts + ".");
          break;
        } else { loseLife(g); return; }
      }
      if (dotsLeft === 0) levelCleared();
    }

    /* ----- render ----- */
    function drawActor(x, y, dir, fn) {
      function at(xx) {
        ctx.save(); ctx.translate(xx, HUD + y);
        if (dir === "left") ctx.scale(-1, 1);
        else if (dir === "up") ctx.rotate(-Math.PI / 2);
        else if (dir === "down") ctx.rotate(Math.PI / 2);
        fn(); ctx.restore();
      }
      at(x);
      if (x < T) at(x + W); else if (x > W - T) at(x - W);   // seen at both ends of the passage
    }
    function drawPanel(title, sub) {
      var cx = W / 2, cy = HUD + 7.5 * T;
      ctx.font = "700 19px Bitter, Georgia, serif";
      var tw = ctx.measureText(title).width;
      ctx.font = "500 12px 'Fira Sans', sans-serif";
      var sw = sub ? ctx.measureText(sub).width : 0;
      var bw = Math.max(tw, sw) + 44, bh = sub ? 62 : 44, bx = cx - bw / 2, by = cy - bh / 2;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 9) : ctx.rect(bx, by, bw, bh);
      ctx.fillStyle = COLORS.panel; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = COLORS.panelEdge; ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = COLORS.hud;
      ctx.font = "700 19px Bitter, Georgia, serif"; ctx.fillText(title, cx, by + (sub ? 27 : 29));
      if (sub) { ctx.font = "500 12px 'Fira Sans', sans-serif"; ctx.fillStyle = COLORS.hudSoft; ctx.fillText(sub, cx, by + 47); }
    }
    function render() {
      if (!canvas.width) return;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);
      if (wallLayer) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(wallLayer, 0, 0); ctx.setTransform(scale, 0, 0, scale, 0, 0); }
      var t = reduceMotion ? 0 : tick / FPS, r, c;

      // bacteria and IFN-γ
      if (dots) for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
        var v = dots[r][c]; if (!v) continue;
        ctx.save(); ctx.translate((c + 0.5) * T, HUD + (r + 0.5) * T);
        if (v === 1) ART.bacterium(ctx, ((c * 7 + r * 11 + c * r) % 6) * Math.PI / 6);
        else ART.interferon(ctx);
        ctx.restore();
      }

      // parasites
      var hideGhosts = state === "dying" && stateT > 30;
      if (!hideGhosts && player) ghosts.forEach(function (g) {
        if (g.mode === "dead") return;
        var gp = ghostPos(g), pal = g.fright ? PAL.pale : null;
        var dir = g.mode === "active" ? g.dir : g.mode === "leaving" ? "up" : (g.def.slot.c < DOOR.c ? "right" : "left");
        drawActor(gp.x, gp.y, dir, function () { ctx.scale(1.06, 1.06); ART[g.kind](ctx, t + g.def.slot.c, pal); });
      });
      if (eaten) {
        var k = 1 - eaten.t / 24;
        drawActor(eaten.x, eaten.y, eaten.g.dir, function () { ctx.scale(k, k); ctx.globalAlpha = k; ART[eaten.g.kind](ctx, t, PAL.pale); });
      }

      // the macrophage
      if (player) {
        var pp = posOf(player), open = player.moving ? 0.5 + 0.5 * Math.sin(player.phase * Math.PI) : 0.35, s = 1.08, pal;
        if (state === "dying") {
          var u = clamp((stateT - 20) / 70, 0, 1);
          pal = stateT > 12 ? PAL.grey : null; s *= 1 - u; open = 0.2;
        }
        if (state === "ready" || state === "getready") open = 0.55;
        if (s > 0.01) drawActor(pp.x, pp.y, player.dir, function () { ctx.scale(s, s); ART.macrophage(ctx, open, pal); });
      }

      // points earned
      popups.forEach(function (p) {
        ctx.globalAlpha = 1 - p.t / 60;
        ctx.fillStyle = COLORS.hud; ctx.font = "600 11px 'Fira Sans', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, HUD + p.y - 12 - p.t * 0.25);
        ctx.globalAlpha = 1;
      });

      // HUD
      ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, HUD);
      ctx.fillStyle = COLORS.wallEdge; ctx.fillRect(0, HUD - 1, W, 1);
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.font = "500 12px 'Fira Sans', sans-serif"; ctx.fillStyle = COLORS.hudSoft; ctx.fillText("Score", 12, HUD / 2);
      ctx.font = "600 15px 'Fira Sans', sans-serif"; ctx.fillStyle = COLORS.hud; ctx.fillText(String(score), 50, HUD / 2);
      if (best > 0) {
        var bx = 50 + ctx.measureText(String(score)).width + 18;
        ctx.font = "500 12px 'Fira Sans', sans-serif"; ctx.fillStyle = COLORS.hudSoft; ctx.fillText("Best " + best, bx, HUD / 2);
      }
      if (ifnT > 0) {
        var bw = 90, bxx = W / 2 - 10, frac = ifnT / ifnTotal;
        ctx.textAlign = "right"; ctx.font = "600 12px 'Fira Sans', sans-serif"; ctx.fillStyle = COLORS.hud;
        ctx.fillText("IFN-γ", bxx - 8, HUD / 2);
        ctx.fillStyle = COLORS.barBg; ctx.fillRect(bxx, HUD / 2 - 4, bw, 8);
        ctx.fillStyle = ifnT < 2 * FPS ? COLORS.barEnd : COLORS.bar; ctx.fillRect(bxx, HUD / 2 - 4, Math.round(bw * frac), 8);
      } else {
        ctx.textAlign = "center"; ctx.font = "500 12px 'Fira Sans', sans-serif"; ctx.fillStyle = COLORS.hudSoft;
        ctx.fillText("Level " + level, W / 2, HUD / 2);
      }
      for (var i = 0; i < Math.min(lives, 6); i++) {
        ctx.save(); ctx.translate(W - 16 - i * 20, HUD / 2); ctx.scale(0.62, 0.62); ART.macrophage(ctx, 0.5); ctx.restore();
      }
      ctx.textBaseline = "alphabetic";

      // messages
      if (state === "ready") drawPanel("Big Eater", touchUI ? "Tap to start, then swipe to move" : "Click to start, then use the arrow keys");
      else if (state === "getready") drawPanel(level > 1 ? "Level " + level : "Ready?", level > 1 ? "Ready?" : null);
      else if (state === "paused") drawPanel("Paused", touchUI ? "Tap to resume" : "Press Space to resume");
      else if (state === "clear") drawPanel("Tissue cleared!", "Level " + (level + 1) + " next");
      else if (state === "over") drawPanel("Game over", "Score " + score);
    }

    /* ----- loop: fixed 60 Hz simulation, render every animation frame ----- */
    function loop(ts) {
      if (!lastTs) lastTs = ts;
      var dt = Math.min(100, ts - lastTs); lastTs = ts;
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 5) { update(); acc -= STEP; steps++; if (state === "over" || state === "paused") break; }
      if (steps === 5) acc = 0;
      render();
      if (state === "playing" || state === "getready" || state === "dying" || state === "clear") requestAnimationFrame(loop);
      else rafActive = false;
    }
    function ensureLoop() {
      if (rafActive) return;
      rafActive = true; lastTs = 0; acc = 0;
      requestAnimationFrame(loop);
    }

    newGame();
    syncSoundButton();
    showConsole("ready");
    resize();
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load("600 15px 'Fira Sans'"), document.fonts.load("500 12px 'Fira Sans'"), document.fonts.load("700 19px Bitter")])
        .then(function () { render(); }, function () { /* fonts are optional */ });
    }

    var api = { pause: pause, start: startGame, state: function () { return state; } };
    if (/[?&]debug\b/.test(location.search)) {           // hooks for automated tests only
      api.debug = {
        snapshot: function () {
          return {
            state: state, score: score, lives: lives, level: level, dotsLeft: dotsLeft, ifn: ifnT, mode: modeIdx,
            player: player && { c: player.c, r: player.r, p: player.p, dir: player.dir, want: player.want },
            ghosts: ghosts.map(function (g) { return { kind: g.kind, mode: g.mode, c: g.c, r: g.r, p: g.p, dir: g.dir, fright: g.fright }; })
          };
        },
        map: MAP,
        clearDots: function (keep) {                // leave only `keep` bacteria, to test the end of a level
          var n = 0;
          for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) if (dots[r][c]) { if (n < (keep || 0) && dots[r][c] === 1) n++; else { dots[r][c] = 0; } }
          dotsLeft = n;
        },
        giveIFN: function () { ifnTotal = ifnT = ifnFrames(); chain = 0; ghosts.forEach(function (g) { if (g.mode === "active") g.fright = true; }); },
        freezeGhosts: function () { ghosts.forEach(function (g) { g.mode = "dead"; g.deadT = 1e9; }); },
        placeGhost: function (i, c, r, dir) { var g = ghosts[i]; g.mode = "active"; g.c = c; g.r = r; g.p = 0; g.dir = dir || "left"; g.deadT = 0; },
        setPlayer: function (c, r, dir) { player.c = c; player.r = r; player.p = 0; player.dir = dir || "left"; player.want = player.dir; },
        hasDot: function (c, r) { return !!(dots[r] && dots[r][c]); },
        endIFN: function () { ifnT = 0; chain = 0; ghosts.forEach(function (g) { g.fright = false; }); },
        render: render
      };
    }
    return api;
  }

  window.BigEater = { mount: mount, art: ART, palettes: PAL };
  document.addEventListener("DOMContentLoaded", function () {
    var el = document.querySelector("[data-big-eater]");
    if (el) window.BigEater.instance = mount(el);
  });
})();
