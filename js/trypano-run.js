/* ==========================================================================
   Trypano Run
   A runner in the spirit of the Chrome offline dinosaur, starring
   Trypanosoma brucei. Jump over white blood cells, dive under antibodies,
   and grab the green shield: a new VSG coat (antigenic variation) makes the
   parasite invisible to antibodies for 6 seconds.
   At 700 points the parasite reaches the central nervous system (stage 2 of
   sleeping sickness): a banner announces it and the colours change.

   Calm by design: obstacles are still, the ground is plain, nothing blinks.
   Pixel art on a 600 x 180 canvas, upscaled with nearest-neighbour filtering.
   No dependencies.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- World constants ---------- */
  var W = 600, H = 180, GROUND = 150, PX = 44, MARK_W = 1200;
  var STEP = 1000 / 60;
  var CFG = {
    gravity: 0.6, jumpV: -9.4, dropV: -4.6, minJump: 18, fastFall: 2.6,
    startSpeed: 5.6, maxSpeed: 11, accel: 0.0009,
    gapCoef: 0.7, maxGapCoef: 1.55, iggSpeed: 7.2,
    scoreCoef: 0.025, stage2: 700, vsgFrames: 360, vsgFrom: 120
  };
  // two calm colour themes: bloodstream (stage 1) and central nervous system (stage 2)
  var THEMES = {
    blood: { bg: "#fbf1ee", ground: "#f0dad4", line: "#c48d82", mark: "#e2bfb6", hud: "#4b3a3f", soft: "#a28b90", panel: "#ffffff" },
    cns:   { bg: "#edf1fa", ground: "#d7e0f2", line: "#7f96c2", mark: "#bccae6", hud: "#2f3b55", soft: "#8692ab", panel: "#ffffff" }
  };
  var C = {
    body: "#7d95ab", light: "#dbe4ec", outline: "#26323f", nucleus: "#ffffff",
    coatBody: "#4cbf89", coatLight: "#d6f3e5", coatOutline: "#1d6b46",
    bar: "#43b97f", barEnd: "#e3a23b"
  };
  var PAL = {
    cell: { 1: "#76599a", 2: "#f4ecf9", 3: "#cfb8e2" },     // neutrophil
    macro: { 1: "#664a88", 2: "#ede2f5", 3: "#c6abdc" },    // macrophage
    igg: { 1: "#e07b28", 2: "#ffe2c4" },                    // antibody
    vsg: { 1: "#1d6b46", 2: "#43b97f", 3: "#ffffff" },      // new coat
    fly: { 1: "#5a4a3b", 2: "#f1e8dc" }                     // tsetse fly
  };

  var FACTS = [
    "<strong>Did you know?</strong> <i>T. brucei</i> swims flagellum first: its beat starts at the tip of the flagellum and travels towards the base.",
    "<strong>Did you know?</strong> Each trypanosome is wrapped in millions of copies of a single variant surface glycoprotein (VSG). Switching to a new VSG lets the population escape antibodies: this is antigenic variation.",
    "<strong>Did you know?</strong> Swimming also cleans the coat: the flow created by forward motility drags antibody-bound VSGs to the flagellar pocket, where they are endocytosed (Engstler et al., <i>Cell</i>, 2007).",
    "<strong>Did you know?</strong> Bloodstream-form <i>T. brucei</i> makes its ATP by glycolysis, and the first seven glycolytic enzymes sit in peroxisome-like organelles called glycosomes.",
    "<strong>Did you know?</strong> Sleeping sickness has two stages: parasites first multiply in the blood and lymph, then invade the central nervous system.",
    "<strong>Did you know?</strong> Tsetse flies (<i>Glossina</i>) transmit <i>T. brucei</i> when they take a blood meal.",
    "<strong>Did you know?</strong> Unlike in mammals, β-tubulin carries a C-terminal tyrosine in trypanosomatids. My PhD showed that its tyrosination tunes glutamylation and motility in <i>T. brucei</i>.",
    "<strong>Did you know?</strong> Microtubules carry a “tubulin code” of post-translational modifications, such as detyrosination and polyglutamylation, that tune how they work."
  ];

  /* ---------- Helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; } return null; }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return "rgb(" + Math.round(x[0] + (y[0] - x[0]) * t) + "," + Math.round(x[1] + (y[1] - x[1]) * t) + "," + Math.round(x[2] + (y[2] - x[2]) * t) + ")";
  }

  /* ---------- A tiny pixel raster ---------- */
  function Grid(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  Grid.prototype.set = function (x, y, v) {
    x = Math.floor(x); y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = v;
  };
  Grid.prototype.get = function (x, y) {
    return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[y * this.w + x];
  };
  Grid.prototype.ellipse = function (cx, cy, rx, ry, v, rot) {
    var c = Math.cos(rot || 0), s = Math.sin(rot || 0), R = Math.max(rx, ry) + 1;
    for (var y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      for (var x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        var dx = x + 0.5 - cx, dy = y + 0.5 - cy, u = dx * c + dy * s, w = -dx * s + dy * c;
        if ((u * u) / (rx * rx) + (w * w) / (ry * ry) <= 1) this.set(x, y, v);
      }
    }
  };
  Grid.prototype.disc = function (cx, cy, r, v) { this.ellipse(cx, cy, r, r, v, 0); };
  Grid.prototype.line = function (x0, y0, x1, y1, v, t) {
    var n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (var i = 0; i <= n; i++) {
      var x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      if (!t || t <= 1) this.set(x, y, v); else this.disc(x, y, t / 2, v);
    }
  };
  Grid.prototype.tri = function (ax, ay, bx, by, cx, cy, v) {
    var minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
    var minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
    function side(px, py, x0, y0, x1, y1) { return (px - x1) * (y0 - y1) - (x0 - x1) * (py - y1); }
    for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
      var px = x + 0.5, py = y + 0.5;
      var d1 = side(px, py, ax, ay, bx, by), d2 = side(px, py, bx, by, cx, cy), d3 = side(px, py, cx, cy, ax, ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) this.set(x, y, v);
    }
  };
  function cropAll(grids) {                 // crop frames with one shared box so they stay aligned
    var b = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
    grids.forEach(function (g) {
      for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) if (g.d[y * g.w + x]) {
        if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      }
    });
    return grids.map(function (g) {
      var out = new Grid(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
      for (var y = b.y0; y <= b.y1; y++) for (var x = b.x0; x <= b.x1; x++) out.d[(y - b.y0) * out.w + (x - b.x0)] = g.get(x, y);
      return out;
    });
  }
  function hcat(grids, overlap) {           // bottom-aligned side-by-side group
    var w = 0, h = 0;
    grids.forEach(function (g, i) { w += g.w - (i ? overlap : 0); h = Math.max(h, g.h); });
    var out = new Grid(w, h), x0 = 0;
    grids.forEach(function (g, i) {
      if (i) x0 -= overlap;
      for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) {
        var v = g.d[y * g.w + x]; if (v) out.d[(y + h - g.h) * w + x0 + x] = v;
      }
      x0 += g.w;
    });
    return out;
  }
  function sprite(grid, pal) {
    var c = document.createElement("canvas");
    c.width = grid.w; c.height = grid.h;
    var cx = c.getContext("2d"), img = cx.createImageData(grid.w, grid.h), cols = {};
    Object.keys(pal).forEach(function (k) { cols[k] = rgb(pal[k]); });
    for (var i = 0; i < grid.d.length; i++) {
      var v = grid.d[i]; if (!v || !cols[v]) continue;
      img.data[i * 4] = cols[v][0]; img.data[i * 4 + 1] = cols[v][1]; img.data[i * 4 + 2] = cols[v][2]; img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return { grid: grid, canvas: c, w: grid.w, h: grid.h };
  }

  /* ---------- Sprites (still images: nothing that comes at you is animated) ---------- */
  function neutrophil(r, seed) {            // round white blood cell with a lobed nucleus
    var rnd = mulberry32(seed), size = Math.ceil(r * 2 + 6), g = new Grid(size, size), c = size / 2;
    g.disc(c, c, r, 1);
    for (var k = 0; k < 9; k++) {
      var a = k / 9 * Math.PI * 2 + rnd() * 0.5;
      g.disc(c + Math.cos(a) * (r - 0.4), c + Math.sin(a) * (r - 0.4), 1.5 + rnd() * 0.6, 1);
    }
    g.disc(c, c, r - 1.9, 2);
    for (k = 0; k < 7; k++) { var a2 = rnd() * Math.PI * 2, d = 1.5 + rnd() * (r - 4.5); g.set(c + Math.cos(a2) * d, c + Math.sin(a2) * d, 3); }
    var a0 = rnd() * Math.PI * 2, pts = [];
    for (k = 0; k < 3; k++) { var a3 = a0 + k * 1.95; pts.push([c + Math.cos(a3) * r * 0.43, c + Math.sin(a3) * r * 0.43]); }
    for (k = 0; k < 3; k++) {
      g.disc(pts[k][0], pts[k][1], 1.85, 1);
      if (k) g.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], 1, 1);
    }
    return cropAll([g])[0];
  }
  function macrophage(seed) {               // big cell with pseudopods and phagosomes
    var rnd = mulberry32(seed), g = new Grid(34, 32), cx = 17, cy = 18;
    g.ellipse(cx, cy, 11.5, 10.5, 1);
    for (var k = 0; k < 6; k++) {
      var a = -Math.PI + 0.5 + k * (Math.PI - 1) / 5 + (rnd() - 0.5) * 0.35, len = 1.5 + rnd() * 5;
      g.line(cx + Math.cos(a) * 9, cy + Math.sin(a) * 8.5, cx + Math.cos(a) * (10.5 + len), cy + Math.sin(a) * (9.5 + len), 1, 2.6 + rnd());
    }
    g.ellipse(cx, cy, 9.6, 8.6, 2);
    g.ellipse(cx - 3.2, cy + 2.2, 4.6, 3.3, 1, 0.55);
    g.ellipse(cx - 1.4, cy + 1.2, 1.9, 1.3, 2, 0.55);
    g.disc(cx + 5.2, cy + 2.8, 2.6, 1); g.disc(cx + 5.2, cy + 2.8, 1.4, 2);
    g.disc(cx + 1.6, cy - 5, 1.6, 1);
    for (k = 0; k < 7; k++) g.set(cx - 7 + rnd() * 14, cy - 6 + rnd() * 6, 3);
    return cropAll([g])[0];
  }
  function antibody() {                     // IgG: a Y with heavy and light chains
    var g = new Grid(24, 22), hx = 12, hy = 10.5, L = 8.6, spread = 0.9;
    [-1, 1].forEach(function (s) {
      var ex = hx + s * Math.sin(spread) * L, ey = hy - Math.cos(spread) * L;
      g.line(hx, hy, ex, ey, 1, 3.4);
      g.disc(ex, ey, 2.1, 1);
      g.line(hx + s * Math.sin(spread) * 3.2, hy - Math.cos(spread) * 3.2, ex - s * Math.sin(spread) * 0.8, ey + Math.cos(spread) * 0.8, 2, 1);
    });
    g.line(hx, hy, hx, 20, 1, 3.6);
    g.disc(hx, hy + 0.5, 2.3, 1);
    g.line(hx, hy + 3, hx, 19, 2, 1);
    return cropAll([g])[0];
  }
  function shield() {                       // the VSG token: a green shield with a V
    var g = new Grid(15, 18);
    function inside(x, y) {
      if (y < 0 || y > 17 || x < 0 || x > 14) return false;
      if (y === 0) return x >= 1 && x <= 13;
      if (y <= 9) return true;
      var half = 7.5 - (y - 9) * 0.95;
      return Math.abs(x + 0.5 - 7.5) <= half;
    }
    for (var y = 0; y < 18; y++) for (var x = 0; x < 15; x++) {
      if (!inside(x, y)) continue;
      var edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      g.set(x, y, edge ? 1 : 2);
    }
    g.line(4, 4, 7.5, 11.5, 3, 1.6); g.line(11, 4, 7.5, 11.5, 3, 1.6);
    return g;
  }
  function tsetse(up) {                     // the vector, facing left
    var g = new Grid(40, 22);
    g.line(1, 13, 9, 12, 1, 1.2);
    g.disc(11.2, 11.5, 3, 1); g.set(10, 10, 2);
    g.ellipse(17, 11, 4.4, 3.8, 1);
    g.ellipse(26.5, 12, 7.5, 3.6, 1);
    for (var x = 23; x <= 31; x += 3) g.line(x, 9.8, x, 14.4, 2, 1);
    g.line(14, 14, 12, 19, 1, 1); g.line(17, 14.5, 17.5, 19.5, 1, 1); g.line(20, 14, 23, 19, 1, 1);
    if (up) { g.ellipse(21, 4.5, 8.5, 2.6, 1, -0.45); g.ellipse(21, 4.5, 6.8, 1.2, 2, -0.45); }
    else { g.ellipse(26, 7.4, 10.5, 2.1, 1, 0.04); g.ellipse(26, 7.4, 8.8, 0.8, 2, 0.04); }
    return g;
  }
  function restartGrid() {
    var g = new Grid(21, 19), cx = 10.5, cy = 9.5;
    g.disc(cx, cy, 8, 1); g.disc(cx, cy, 5.1, 0);
    for (var y = 0; y < 19; y++) for (var x = 0; x < 21; x++) {
      var a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      if (a > -1.45 && a < -0.25) g.set(x, y, 0);
    }
    var t = -0.5, b = -1.5;
    g.tri(cx + Math.cos(t) * 6.6, cy + Math.sin(t) * 6.6, cx + Math.cos(b) * 2.6, cy + Math.sin(b) * 2.6, cx + Math.cos(b) * 10.6, cy + Math.sin(b) * 10.6, 1);
    return cropAll([g])[0];
  }

  /* ---------- Pixel font (5 x 7) ---------- */
  var FONT = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"], "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"], B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"], D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"], F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"], H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"], J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"], L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"], N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"], P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"], R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"], T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"], V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"], X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"], Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"], ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
    "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"], "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"]
  };

  /* ==========================================================================
     Game instance
     ========================================================================== */
  function mount(root) {
    root.classList.add("run");
    root.innerHTML =
      '<div class="run-frame" tabindex="0" role="application" aria-label="Trypano Run game area" aria-describedby="run-help">' +
        '<canvas class="run-canvas" width="' + W + '" height="' + H + '"></canvas>' +
      "</div>" +
      '<div class="run-touch">' +
        '<button type="button" data-touch="jump">Jump</button>' +
        '<button type="button" data-touch="dive">Dive</button>' +
      "</div>" +
      '<div class="run-console">' +
        '<div class="run-info"><h3 class="run-title"></h3><p class="run-text"></p><p class="run-fact"></p></div>' +
        '<div class="run-actions">' +
          '<button type="button" class="btn btn-primary" data-action="main">Start swimming</button>' +
          '<button type="button" class="btn" data-action="sound" aria-pressed="false">Sound off</button>' +
        "</div>" +
        '<p class="run-help" id="run-help"><kbd>Space</kbd> or <kbd>↑</kbd> to jump (hold to jump higher), <kbd>↓</kbd> to dive under antibodies, <kbd>P</kbd> to pause. On a phone, tap the game to jump and hold Dive.</p>' +
      "</div>" +
      '<p class="sr-only" aria-live="polite" data-live></p>';

    var frame = root.querySelector(".run-frame");
    var canvas = root.querySelector("canvas");
    var ctx = canvas.getContext("2d");
    var elTitle = root.querySelector(".run-title"), elText = root.querySelector(".run-text"), elFact = root.querySelector(".run-fact");
    var btnMain = root.querySelector('[data-action="main"]'), btnSound = root.querySelector('[data-action="sound"]');
    var live = root.querySelector("[data-live]");
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var touchUI = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    /* ----- sprites ----- */
    var SPR = {
      cell: [neutrophil(7.6, 3), neutrophil(8.2, 17), neutrophil(7.2, 29)],
      macro: [sprite(macrophage(5), PAL.macro), sprite(macrophage(41), PAL.macro)],
      igg: sprite(antibody(), PAL.igg),
      vsg: sprite(shield(), PAL.vsg),
      fly: cropAll([tsetse(false), tsetse(true)]).map(function (g) { return sprite(g, PAL.fly); }),
      restart: restartGrid()
    };
    var MARKS = (function () {               // a few quiet marks on the vessel wall
      var r = mulberry32(7), out = [];
      for (var i = 0; i < 14; i++) out.push({ x: Math.floor(i * MARK_W / 14 + r() * 50), y: GROUND + 7 + Math.floor(r() * 16), len: 3 + Math.floor(r() * 5) });
      return out;
    })();

    /* ----- state ----- */
    var state = "ready", tick = 0, speed = CFG.startSpeed, distance = 0, score = 0;
    var best = parseInt(store("trypanoRun.best"), 10) || 0, newRecord = false;
    var stage = 1, themeT = 0, vsgTimer = 0, groundX = 0, overAt = 0, clearTimer = 0;
    var vsgSpawnTimer = 0, cause = "", lastFact = -1, toastTimer = 0, banner = null;
    var player = { y: GROUND, vy: 0, jumping: false, jumpHeld: false, reachedMin: false, duck: false, fastFall: false, phase: 0, visible: false };
    var fly = { x: 300, y: 40, frame: 0, mode: "idle", t: 0, sx: 0, sy: 0, visible: true };
    var obstacles = [], pickups = [], history = [];
    var COLS = [], FLAG = [], NUC = { x: 0, y: 0 }, KIN = { x: 0, y: 0 }, PB = { x0: 0, x1: 0, y0: 0, y1: 0 };
    var inView = true, rafActive = false, lastTs = 0, acc = 0;
    var sound = store("trypanoRun.sound") === "on", audioCtx = null;

    function theme() {
      var a = THEMES.blood, b = THEMES.cns, t = themeT, out = {};
      Object.keys(a).forEach(function (k) { out[k] = t <= 0 ? a[k] : t >= 1 ? b[k] : mix(a[k], b[k], t); });
      return out;
    }

    /* ----- sound (off by default) ----- */
    function beep(f1, f2, dur, type, vol, delay) {
      if (!sound) return;
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        var t = audioCtx.currentTime + (delay || 0), o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type || "square";
        o.frequency.setValueAtTime(f1, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
        g.gain.setValueAtTime(vol || 0.03, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + dur + 0.03);
      } catch (e) { /* audio is optional */ }
    }
    var sfx = {
      jump: function () { beep(420, 760, 0.08); },
      vsg: function () { beep(523, 0, 0.07); beep(659, 0, 0.07, "square", 0.03, 0.08); beep(784, 0, 0.1, "square", 0.03, 0.16); },
      milestone: function () { beep(1046, 0, 0.05, "square", 0.02); },
      stage: function () { beep(330, 660, 0.35, "triangle", 0.05); },
      over: function () { beep(240, 90, 0.32, "sawtooth", 0.035); }
    };
    function syncSoundButton() {
      btnSound.setAttribute("aria-pressed", String(sound));
      btnSound.textContent = sound ? "Sound on" : "Sound off";
    }

    /* ----- the trypanosome, rebuilt every frame from a travelling wave ----- */
    function profile(u) {               // body thickness from posterior (0) to anterior (1)
      if (u < 0.1) return 0.6 + u * 3;
      if (u < 0.4) return 0.9 + (u - 0.1) / 3;
      if (u < 0.55) return 1;
      return Math.max(0.16, 1 - (u - 0.55) * 1.9);
    }
    function shapePlayer() {
      COLS.length = 0; FLAG.length = 0;
      var duck = player.duck && !player.jumping;
      var L = duck ? 39 : 34, T = duck ? 5.5 : 9.5, A = duck ? 0.8 : 1.7, F = duck ? 9 : 11;
      var tilt = duck ? 0.03 : 0.3;
      if (player.jumping) tilt = clamp(0.3 - player.vy * 0.028, -0.1, 0.56);
      var k = Math.PI * 2 / 21, ph = player.phase;
      var base = player.y - 1 - T * 0.3;
      var minY = 1e9, maxY = -1e9, prevY = null;
      for (var i = 0; i <= L + F; i++) {
        var u = Math.min(1, i / L);
        var amp = A * (0.3 + 0.7 * u) * (i > L ? 1.3 : 1);
        var yc = base - tilt * i + amp * Math.sin(k * i - ph);
        var x = PX + i;
        if (i <= L) {
          var th = Math.max(1, T * profile(u));
          var top = Math.round(yc - th / 2), bot = Math.round(yc + th / 2) - 1;
          if (bot < top) bot = top;
          COLS.push(x, top, bot, u > 0.18 && u < 0.97 && bot - top >= 3 ? 1 : 0);
          if (top < minY) minY = top;
          if (bot > maxY) maxY = bot;
          if (i === Math.round(L * 0.5)) { NUC.x = x; NUC.y = Math.round(yc) - (duck ? 0 : 1); }
          if (i === Math.round(L * 0.13)) { KIN.x = x; KIN.y = Math.round(yc); }
          prevY = Math.round(yc);
        } else {
          var fy = Math.round(yc), a = fy, b = fy;
          if (prevY !== null) { if (fy > prevY + 1) a = prevY + 1; else if (fy < prevY - 1) b = prevY - 1; }
          FLAG.push(x, Math.min(a, b), Math.max(a, b));
          if (fy < minY) minY = fy;
          if (fy > maxY) maxY = fy;
          prevY = fy;
        }
      }
      PB.x0 = PX; PB.x1 = PX + L + F; PB.y0 = minY; PB.y1 = maxY;
    }

    /* ----- run lifecycle ----- */
    function resetRun() {
      speed = CFG.startSpeed; distance = 0; score = 0; stage = 1; themeT = 0; vsgTimer = 0;
      obstacles.length = 0; pickups.length = 0; history.length = 0; banner = null;
      vsgSpawnTimer = 300; clearTimer = 100; newRecord = false; toastTimer = 0;
      player.y = GROUND; player.vy = 0; player.jumping = false; player.jumpHeld = false;
      player.duck = false; player.fastFall = false; player.reachedMin = false;
    }
    function showBanner(lines, dur) { banner = { lines: lines, t: 0, dur: dur || 150 }; }
    function startGame(withIntro) {
      resetRun();
      if (withIntro && !reduceMotion) {
        state = "intro"; player.visible = false;
        fly.visible = true; fly.mode = "approach"; fly.t = 0; fly.sx = fly.x; fly.sy = fly.y;
      } else {
        state = "running"; player.visible = true; fly.visible = false;
        showBanner(["STAGE 1", "BLOODSTREAM"], 110);
      }
      frame.classList.add("is-playing");
      showConsole("running");
      frame.focus({ preventScroll: true });
      ensureLoop();
    }
    function pause(reason) {
      if (state !== "running" && state !== "intro") return;
      state = "paused";
      player.jumpHeld = false;
      frame.classList.remove("is-playing");
      showConsole("paused", reason);
      render();
    }
    function resume() {
      if (state !== "paused") return;
      state = player.visible ? "running" : "intro";
      frame.classList.add("is-playing");
      showConsole("running");
      frame.focus({ preventScroll: true });
      ensureLoop();
    }
    function gameOver(kind) {
      state = "over"; overAt = performance.now(); cause = kind; banner = null;
      player.jumpHeld = false;
      frame.classList.remove("is-playing");
      if (score > best) { best = score; newRecord = true; store("trypanoRun.best", String(best)); }
      sfx.over();
      showConsole("over");
      render();
    }

    /* ----- console below the canvas ----- */
    function factHtml() {
      var i;
      do { i = Math.floor(Math.random() * FACTS.length); } while (FACTS.length > 1 && i === lastFact);
      lastFact = i;
      return FACTS[i];
    }
    function stageTitle() { return stage === 2 ? "Stage 2: central nervous system" : "Stage 1: bloodstream"; }
    function showConsole(mode, info) {
      elFact.hidden = true;
      if (mode === "ready") {
        elTitle.textContent = "Trypano Run";
        elText.innerHTML = "Help <i>Trypanosoma brucei</i> swim through the bloodstream. Jump over the white blood cells and dive under the orange antibodies. " +
          "The <strong>green shield</strong> gives you a new VSG coat: for 6 seconds, antibodies can’t recognise you (white blood cells still can).";
        elFact.innerHTML = "At 700 points, the parasite reaches the central nervous system: stage 2 of sleeping sickness.";
        elFact.hidden = false;
        btnMain.textContent = "Start swimming";
      } else if (mode === "running") {
        elTitle.textContent = stageTitle();
        elText.textContent = info || "Jump over white blood cells, dive under the orange antibodies.";
        btnMain.textContent = "Pause";
      } else if (mode === "paused") {
        elTitle.textContent = "Paused";
        elText.textContent = info || "Press Space, tap the game or choose Resume to continue.";
        btnMain.textContent = "Resume";
      } else if (mode === "over") {
        var titles = {
          cell: ["Phagocytosed!", "A neutrophil, a white blood cell, engulfed you."],
          macro: ["Phagocytosed!", "A macrophage engulfed you."],
          igg: ["Opsonized!", "Antibodies recognized your VSG coat. The green shield gives you a new one."]
        };
        if (stage === 2) titles.macro = ["Phagocytosed!", "A microglial cell, the brain’s own macrophage, engulfed you."];
        var t = titles[cause] || ["Game over", ""];
        elTitle.textContent = t[0];
        elText.textContent = t[1] + " Score " + score + (newRecord && score > 0 ? ", a new record!" : ". Best " + best + ".") +
          (stage === 2 ? " You reached the central nervous system." : "");
        elFact.innerHTML = factHtml();
        elFact.hidden = false;
        btnMain.textContent = "Swim again";
        live.textContent = t[0] + " " + t[1] + " Score " + score + ".";
      }
    }
    function toast(msg) {
      if (state === "running" || state === "intro") { elText.textContent = msg; toastTimer = 300; }
      live.textContent = msg;
    }

    /* ----- input ----- */
    function pressJump() {
      if (state === "ready") { startGame(true); return; }
      if (state === "over") { if (performance.now() - overAt > 450) startGame(false); return; }
      if (state === "paused") { resume(); return; }
      if (state !== "running") return;
      player.jumpHeld = true;
      if (!player.jumping) {
        player.jumping = true; player.duck = false; player.reachedMin = false; player.fastFall = false;
        player.vy = CFG.jumpV - speed / 12;
        sfx.jump();
      }
    }
    function releaseJump() { player.jumpHeld = false; }
    function pressDive(down) {
      if (state !== "running") { if (!down) player.duck = false; return; }
      player.duck = down;
      player.fastFall = down && player.jumping;
    }
    function isJumpKey(k) { return k === " " || k === "Spacebar" || k === "ArrowUp" || k === "w" || k === "W"; }
    function isDiveKey(k) { return k === "ArrowDown" || k === "s" || k === "S"; }

    document.addEventListener("keydown", function (e) {
      var focused = root.contains(document.activeElement);
      var active = (state === "running" || state === "intro") && inView;
      if (!focused && !active) return;
      if (e.target !== frame && e.target.closest && e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
      if (isJumpKey(e.key) || (e.key === "Enter" && state !== "running")) {
        e.preventDefault();
        if (!e.repeat) pressJump();
      } else if (isDiveKey(e.key)) {
        e.preventDefault(); pressDive(true);
      } else if ((e.key === "p" || e.key === "P" || e.key === "Escape") && (state === "running" || state === "intro")) {
        e.preventDefault(); pause();
      }
    });
    document.addEventListener("keyup", function (e) {
      if (isJumpKey(e.key)) releaseJump();
      if (isDiveKey(e.key)) pressDive(false);
    });
    frame.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      e.preventDefault();
      frame.focus({ preventScroll: true });
      pressJump();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { frame.addEventListener(t, releaseJump); });
    root.querySelectorAll("[data-touch]").forEach(function (b) {
      var isJump = b.getAttribute("data-touch") === "jump";
      b.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        b.classList.add("is-down");
        if (isJump) pressJump(); else pressDive(true);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (t) {
        b.addEventListener(t, function () {
          b.classList.remove("is-down");
          if (isJump) releaseJump(); else pressDive(false);
        });
      });
      b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
    btnMain.addEventListener("click", function () {
      if (state === "ready") startGame(true);
      else if (state === "over") startGame(false);
      else if (state === "paused") resume();
      else pause();
    });
    btnSound.addEventListener("click", function () {
      sound = !sound; store("trypanoRun.sound", sound ? "on" : "off"); syncSoundButton();
      if (sound) beep(660, 0, 0.06);
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });
    document.addEventListener("gametabchange", function () {
      if (root.closest("[hidden]")) pause(); else ensureLoop();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        inView = e.isIntersecting && e.intersectionRatio >= 0.5;
        if (!inView) pause("Paused while the game was off screen.");
        else ensureLoop();
      }, { threshold: [0, 0.5, 1] }).observe(frame);
    }

    /* ----- spawning ----- */
    function spawnObstacle() {
      var types = ["cell", "cell", "macro"];
      if (speed >= CFG.iggSpeed) types.push("igg", "igg");
      var t = pick(types);
      if (history[0] === t && history[1] === t) t = t === "igg" ? "cell" : (speed >= CFG.iggSpeed ? "igg" : (t === "cell" ? "macro" : "cell"));
      history.unshift(t); history.length = Math.min(history.length, 2);
      var o = { kind: t, x: W + 2, speedOff: 0, minGap: 125 };
      if (t === "igg") {
        o.spr = SPR.igg;
        o.y = pick([GROUND - 2, GROUND - 10, GROUND - 31]) - o.spr.h + 1;  // low: jump, middle: dive, high: pass under
        o.speedOff = Math.random() < 0.5 ? 0.5 : -0.4;
        o.minGap = 155;
      } else if (t === "cell") {
        var n = speed < 7.5 ? 1 : 1 + Math.floor(Math.random() * 2);
        var members = []; for (var k = 0; k < n; k++) members.push(pick(SPR.cell));
        o.spr = sprite(hcat(members, 3), PAL.cell);
        o.y = GROUND - o.spr.h + 1;
      } else {
        o.spr = pick(SPR.macro);
        o.y = GROUND - o.spr.h + 1;
      }
      o.w = o.spr.w; o.h = o.spr.h;
      var gap = Math.round(o.w * speed + o.minGap * CFG.gapCoef);
      o.gap = Math.round(rand(gap, gap * CFG.maxGapCoef));
      obstacles.push(o);
    }
    function clearOf(x0, x1) {
      for (var i = 0; i < obstacles.length; i++) { var o = obstacles[i]; if (o.x < x1 && o.x + o.w > x0) return false; }
      return true;
    }
    function spawnVSG() {
      if (vsgTimer > 0) { vsgSpawnTimer = 240; return; }
      if (!clearOf(W - 50, W + 70)) { vsgSpawnTimer = 15; return; }
      pickups.push({ x: W + 2, y: GROUND - rand(30, 44) - SPR.vsg.h, w: SPR.vsg.w, h: SPR.vsg.h });
      vsgSpawnTimer = rand(900, 1500);
    }

    /* ----- update ----- */
    function overlapsPlayer(x, y, w, h) {
      return x < PB.x1 + 2 && x + w > PB.x0 - 2 && y < PB.y1 + 2 && y + h > PB.y0 - 2;
    }
    function collides(o) {
      var g = o.spr.grid, ox = Math.round(o.x), oy = Math.round(o.y), hits = 0;
      for (var c = 0; c < COLS.length; c += 4) {
        var gx = COLS[c] - ox; if (gx < 0 || gx >= g.w) continue;
        for (var y = COLS[c + 1]; y <= COLS[c + 2]; y++) {
          if (g.get(gx, y - oy) && ++hits >= 2) return true;
        }
      }
      return false;
    }
    function updatePlayer() {
      player.phase += 0.24 + speed * 0.022;
      if (player.jumping) {
        player.vy += CFG.gravity * (player.fastFall ? CFG.fastFall : 1);
        player.y += player.vy;
        if (!player.reachedMin && GROUND - player.y >= CFG.minJump) player.reachedMin = true;
        if (player.reachedMin && !player.jumpHeld && player.vy < CFG.dropV) player.vy = CFG.dropV;
        if (player.y >= GROUND) { player.y = GROUND; player.vy = 0; player.jumping = false; player.fastFall = false; }
      }
    }
    function updateFly() {
      if (!fly.visible) return;
      fly.t++;
      fly.frame = (tick >> 3) & 1;                 // calm wing beat
      if (fly.mode === "idle") {
        fly.x = 286 + Math.sin(tick / 60) * 30; fly.y = 50 + Math.sin(tick / 30) * 3;
      } else if (fly.mode === "approach") {
        var k = Math.min(1, fly.t / 48), e = k * k * (3 - 2 * k);
        fly.x = fly.sx + (PX + 4 - fly.sx) * e; fly.y = fly.sy + (GROUND - 58 - fly.sy) * e;
        if (k >= 1) { fly.mode = "bite"; fly.t = 0; }
      } else if (fly.mode === "bite") {
        fly.y = GROUND - 58;
        if (fly.t === 12) { player.visible = true; player.y = fly.y + 20; player.vy = 0; }
      } else if (fly.mode === "leave") {
        fly.x -= 1.2 + fly.t * 0.03; fly.y -= 1.2;
        if (fly.y < -30 || fly.x < -50) fly.visible = false;
      }
    }
    function update() {
      tick++;
      if (banner && ++banner.t >= banner.dur) banner = null;
      if (state === "ready") { updateFly(); return; }
      if (state === "intro") {
        updateFly();
        player.phase += 0.35;
        if (player.visible) {
          player.vy += CFG.gravity * 0.8; player.y += player.vy;
          if (player.y >= GROUND) {
            player.y = GROUND; player.vy = 0;
            state = "running"; fly.mode = "leave"; fly.t = 0;
            showBanner(["STAGE 1", "BLOODSTREAM"], 110);
          }
        }
        shapePlayer();
        return;
      }
      if (state !== "running") return;

      if (speed < CFG.maxSpeed) speed += CFG.accel;
      distance += speed;
      groundX = (groundX + speed) % MARK_W;
      if (stage === 2 && themeT < 1) themeT = Math.min(1, themeT + 1 / 90);
      updatePlayer();
      updateFly();

      for (var i = obstacles.length - 1; i >= 0; i--) {
        var o = obstacles[i];
        o.x -= speed + o.speedOff;
        if (o.x + o.w < -4) obstacles.splice(i, 1);
      }
      if (clearTimer > 0) clearTimer--;
      else {
        var lastOb = obstacles[obstacles.length - 1];
        if (!lastOb || lastOb.x + lastOb.w + lastOb.gap < W) spawnObstacle();
      }

      for (i = pickups.length - 1; i >= 0; i--) {
        var p = pickups[i]; p.x -= speed;
        if (p.x + p.w < -4) { pickups.splice(i, 1); continue; }
        if (overlapsPlayer(p.x, p.y, p.w, p.h)) {
          pickups.splice(i, 1);
          vsgTimer = CFG.vsgFrames; sfx.vsg();
          showBanner(["NEW VSG COAT!", "ANTIBODIES CAN'T SEE YOU"], 130);
          toast("New VSG coat: antibodies can’t recognise you for 6 seconds. White blood cells still can!");
        }
      }
      if (score > CFG.vsgFrom && --vsgSpawnTimer <= 0) spawnVSG();

      var newScore = Math.floor(distance * CFG.scoreCoef);
      if (Math.floor(newScore / 100) > Math.floor(score / 100)) sfx.milestone();
      score = newScore;
      if (stage === 1 && score >= CFG.stage2) {
        stage = 2; sfx.stage();
        showBanner(["STAGE 2", "CENTRAL NERVOUS SYSTEM"], 210);
        elTitle.textContent = stageTitle();
        toast("You crossed into the central nervous system: stage 2 of sleeping sickness.");
      }
      if (vsgTimer > 0 && --vsgTimer === 0) toast("Your coat has been spotted: antibodies can recognise you again.");
      if (toastTimer > 0 && --toastTimer === 0) elText.textContent = "Jump over white blood cells, dive under the orange antibodies.";

      shapePlayer();
      for (i = 0; i < obstacles.length; i++) {
        var ob = obstacles[i];
        if (ob.x > PB.x1 + 1 || ob.x + ob.w < PB.x0 - 1) continue;
        if (ob.kind === "igg" && vsgTimer > 0) continue;      // the new coat is invisible to antibodies
        if (collides(ob)) { gameOver(ob.kind); return; }
      }
    }

    /* ----- render ----- */
    function drawText(str, x, y, s, color) {
      ctx.fillStyle = color;
      for (var n = 0; n < str.length; n++) {
        var gl = FONT[str[n]];
        if (gl) for (var r = 0; r < 7; r++) for (var c = 0; c < 5; c++) if (gl[r].charCodeAt(c) === 49) ctx.fillRect(x + c * s, y + r * s, s, s);
        x += 6 * s;
      }
    }
    function textWidth(str, s) { return str.length * 6 * s - s; }
    function drawCentered(str, y, s, color) { drawText(str, Math.round((W - textWidth(str, s)) / 2), y, s, color); }
    function pad5(n) { var s = String(Math.min(99999, Math.max(0, n))); while (s.length < 5) s = "0" + s; return s; }
    function box(x, y, w, h) { ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2); }
    function drawPlayer() {
      if (!player.visible) return;
      var coat = vsgTimer > 0;
      var body = coat ? C.coatBody : C.body, light = coat ? C.coatLight : C.light, edge = coat ? C.coatOutline : C.outline;
      for (var c = 0; c < COLS.length; c += 4) {
        var x = COLS[c], top = COLS[c + 1], bot = COLS[c + 2], hasLine = COLS[c + 3];
        ctx.fillStyle = edge;
        if (bot - top < 2) { ctx.fillRect(x, top, 1, bot - top + 1); continue; }
        ctx.fillRect(x, top, 1, 1); ctx.fillRect(x, bot, 1, 1);
        ctx.fillStyle = body; ctx.fillRect(x, top + 1, 1, bot - top - 1);
        if (hasLine) { ctx.fillStyle = light; ctx.fillRect(x, top + 1, 1, 1); }   // attached flagellum
      }
      ctx.fillStyle = edge;
      for (var f = 0; f < FLAG.length; f += 3) ctx.fillRect(FLAG[f], FLAG[f + 1], 1, FLAG[f + 2] - FLAG[f + 1] + 1);
      ctx.fillRect(KIN.x, KIN.y, 1, 1);
      ctx.fillStyle = C.nucleus;
      if (state === "over") {
        [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]].forEach(function (p) { ctx.fillRect(NUC.x + p[0], NUC.y + p[1], 1, 1); });
      } else {
        ctx.fillRect(NUC.x, NUC.y, 2, player.duck && !player.jumping ? 1 : 2);
      }
    }
    function drawPanel(lines, alpha, th) {      // a framed message in the middle of the screen
      if (alpha <= 0) return;
      var s = 2, lh = 7 * s + 6, w = 0;
      lines.forEach(function (l) { w = Math.max(w, textWidth(l, s)); });
      var bw = w + 32, bh = lines.length * lh + 14, bx = Math.round((W - bw) / 2), by = 34;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = th.line; box(bx, by, bw, bh);
      ctx.fillStyle = th.panel; box(bx + 2, by + 2, bw - 4, bh - 4);
      lines.forEach(function (l, i) { drawCentered(l, by + 10 + i * lh, s, th.hud); });
      ctx.globalAlpha = 1;
    }
    function drawBanner(th) {
      if (!banner || state === "paused") return;
      drawPanel(banner.lines, Math.min(1, banner.t / 12, (banner.dur - banner.t) / 12), th);
    }
    function render() {
      var th = theme(), i;
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = th.ground; ctx.fillRect(0, GROUND + 1, W, H - GROUND - 1);
      ctx.fillStyle = th.line; ctx.fillRect(0, GROUND, W, 1);
      ctx.fillStyle = th.mark;
      for (i = 0; i < MARKS.length; i++) {
        var mx = ((MARKS[i].x - groundX) % MARK_W + MARK_W) % MARK_W;
        if (mx < W) ctx.fillRect(Math.round(mx), MARKS[i].y, MARKS[i].len, 1);
      }

      for (i = 0; i < pickups.length; i++) ctx.drawImage(SPR.vsg.canvas, Math.round(pickups[i].x), Math.round(pickups[i].y));
      for (i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        ctx.globalAlpha = o.kind === "igg" && vsgTimer > 0 ? 0.3 : 1;   // antibodies fade while the coat is new
        ctx.drawImage(o.spr.canvas, Math.round(o.x), Math.round(o.y));
      }
      ctx.globalAlpha = 1;
      drawBanner(th);
      if (fly.visible) ctx.drawImage(SPR.fly[fly.frame].canvas, Math.round(fly.x), Math.round(fly.y));
      drawPlayer();

      if (state !== "ready") {
        drawText(stage === 2 ? "CNS" : "BLOODSTREAM", 10, 10, 2, th.hud);
        var sc = pad5(score), sx = W - 10 - textWidth(sc, 2);
        drawText(sc, sx, 10, 2, th.hud);
        if (best > 0) { var hi = "HI " + pad5(best); drawText(hi, sx - 20 - textWidth(hi, 2), 10, 2, th.soft); }
        if (vsgTimer > 0) {
          var bw = 70, bx = W - 10 - bw;
          drawText("VSG", bx - 8 - textWidth("VSG", 2), 30, 2, th.hud);
          ctx.fillStyle = th.ground; ctx.fillRect(bx, 33, bw, 8);
          ctx.fillStyle = vsgTimer < 90 ? C.barEnd : C.bar; ctx.fillRect(bx, 33, Math.round(bw * vsgTimer / CFG.vsgFrames), 8);
        }
      } else if (best > 0) {
        var hi2 = "HI " + pad5(best); drawText(hi2, W - 10 - textWidth(hi2, 2), 10, 2, th.soft);
      }
      if (state === "ready") drawCentered(touchUI ? "TAP TO START" : "PRESS SPACE OR TAP", 98, 2, th.hud);
      if (state === "paused") drawPanel(["PAUSED", touchUI ? "TAP TO RESUME" : "PRESS SPACE TO RESUME"], 1, th);
      if (state === "over") {
        drawCentered("GAME OVER", 52, 2, th.hud);
        var g = SPR.restart, rx = Math.round((W - g.w) / 2);
        ctx.fillStyle = th.hud;
        for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) if (g.d[y * g.w + x]) ctx.fillRect(rx + x, 78 + y, 1, 1);
      }
    }

    /* ----- loop: fixed 60 Hz simulation, render every animation frame ----- */
    function loop(ts) {
      if (!lastTs) lastTs = ts;
      var dt = Math.min(100, ts - lastTs); lastTs = ts;
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 5) { update(); acc -= STEP; steps++; if (state === "over") break; }
      if (steps === 5) acc = 0;
      render();
      var animate = (state === "running" || state === "intro") || (state === "ready" && inView && !root.closest("[hidden]"));
      if (animate) requestAnimationFrame(loop);
      else rafActive = false;
    }
    function ensureLoop() {
      if (rafActive) return;
      rafActive = true; lastTs = 0; acc = 0;
      requestAnimationFrame(loop);
    }

    syncSoundButton();
    showConsole("ready");
    render();
    ensureLoop();

    var api = { pause: pause, start: startGame, state: function () { return state; } };
    if (/[?&]debug\b/.test(location.search)) {           // hooks for automated tests only
      api.debug = {
        snapshot: function () {
          return {
            state: state, score: score, speed: speed, stage: stage, vsg: vsgTimer, tick: tick, banner: banner && banner.lines.join(" / "),
            player: { y: player.y, jumping: player.jumping, duck: player.duck, bbox: { x0: PB.x0, x1: PB.x1, y0: PB.y0, y1: PB.y1 } },
            obstacles: obstacles.map(function (o) { return { kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h }; }),
            pickups: pickups.map(function (p) { return { x: p.x, y: p.y }; })
          };
        },
        setScore: function (v) { distance = v / CFG.scoreCoef; score = v; },
        setSpeed: function (v) { speed = v; },
        giveVSG: function () { vsgTimer = CFG.vsgFrames; },
        spawnVSG: function (x, y) { pickups.push({ x: x == null ? 160 : x, y: y == null ? GROUND - 48 : y, w: SPR.vsg.w, h: SPR.vsg.h }); },
        sprites: SPR
      };
    }
    return api;
  }

  window.TrypanoRun = { mount: mount };
  document.addEventListener("DOMContentLoaded", function () {
    var el = document.querySelector("[data-trypano-run]");
    if (el) window.TrypanoRun.instance = mount(el);
  });
})();
