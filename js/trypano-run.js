/* ==========================================================================
   Trypano Run
   A runner in the spirit of the Chrome offline dinosaur, starring
   Trypanosoma brucei. Jump over leukocytes rolling on the vessel wall, dodge
   antibodies, collect glucose, and grab a VSG token to switch coats
   (antigenic variation) and become invisible to antibodies for a while.
   At 700 points the parasite crosses into the central nervous system
   (stage 2 of sleeping sickness) and the world switches to night mode.

   Everything is drawn in pixels on a 600 x 180 canvas, upscaled with
   nearest-neighbour filtering. No dependencies.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- World constants ---------- */
  var W = 600, H = 180, GROUND = 150, PX = 44, GROUND_W = 1200;
  var STEP = 1000 / 60;
  var INK = "#535353", BG = "#f7f7f7", SOFT = "#cdcdcd", HI_INK = "#7d7d7d";
  var PAL = { 1: [83, 83, 83], 2: [247, 247, 247], 3: [205, 205, 205], 4: [226, 226, 226] };
  var CFG = {
    gravity: 0.6, jumpV: -9.4, dropV: -4.6, minJump: 18, fastFall: 2.6,
    startSpeed: 6, maxSpeed: 13, accel: 0.0011,
    gapCoef: 0.62, maxGapCoef: 1.5, iggSpeed: 7.4,
    scoreCoef: 0.025, stage2: 700, vsgFrames: 360, glucose: 25
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
      var neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) this.set(x, y, v);
    }
  };
  function bboxOf(grids) {
    var b = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
    grids.forEach(function (g) {
      for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) if (g.d[y * g.w + x]) {
        if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      }
    });
    return b;
  }
  function cropAll(grids) {                 // crop frames with one shared box so they stay aligned
    var b = bboxOf(grids);
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
  function sprite(grid) {
    var c = document.createElement("canvas");
    c.width = grid.w; c.height = grid.h;
    var cx = c.getContext("2d"), img = cx.createImageData(grid.w, grid.h);
    for (var i = 0; i < grid.d.length; i++) {
      var v = grid.d[i]; if (!v) continue;
      var col = PAL[v]; img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return { grid: grid, canvas: c, w: grid.w, h: grid.h };
  }

  /* ---------- Sprite factories ---------- */
  // Neutrophil rolling on the vessel wall: bumpy membrane, granules, lobed nucleus.
  function leukocyteFrames(r, seed, frames) {
    var out = [];
    for (var f = 0; f < frames; f++) {
      var rnd = mulberry32(seed), size = Math.ceil(r * 2 + 6), g = new Grid(size, size), c = size / 2;
      var rot = -f * (Math.PI * 2 / frames);
      g.disc(c, c, r, 1);
      for (var k = 0; k < 9; k++) {
        var a = k / 9 * Math.PI * 2 + rnd() * 0.5 + rot;
        g.disc(c + Math.cos(a) * (r - 0.4), c + Math.sin(a) * (r - 0.4), 1.5 + rnd() * 0.6, 1);
      }
      g.disc(c, c, r - 1.9, 2);
      for (k = 0; k < 7; k++) {
        var a2 = rnd() * Math.PI * 2 + rot, d = 1.5 + rnd() * (r - 4.5);
        g.set(c + Math.cos(a2) * d, c + Math.sin(a2) * d, 3);
      }
      var a0 = rnd() * Math.PI * 2 + rot, pts = [];
      for (k = 0; k < 3; k++) { var a3 = a0 + k * 1.95; pts.push([c + Math.cos(a3) * r * 0.43, c + Math.sin(a3) * r * 0.43]); }
      for (k = 0; k < 3; k++) {
        g.disc(pts[k][0], pts[k][1], 1.85, 1);
        if (k) g.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], 1, 1);
      }
      out.push(g);
    }
    return cropAll(out);
  }
  // Macrophage: big cell with pseudopods, kidney-shaped nucleus and phagosomes.
  function macrophageFrames(seed, frames) {
    var out = [];
    for (var f = 0; f < frames; f++) {
      var rnd = mulberry32(seed), g = new Grid(34, 32), cx = 17, cy = 18;
      var wob = Math.sin(f / frames * Math.PI * 2);
      g.ellipse(cx, cy, 11.5, 10.5, 1);
      for (var k = 0; k < 6; k++) {
        var a = -Math.PI + 0.5 + k * (Math.PI - 1) / 5 + (rnd() - 0.5) * 0.35 + wob * 0.07;
        var len = 1.5 + rnd() * 5 + (k % 2 ? wob : -wob) * 0.8;
        g.line(cx + Math.cos(a) * 9, cy + Math.sin(a) * 8.5, cx + Math.cos(a) * (10.5 + len), cy + Math.sin(a) * (9.5 + len), 1, 2.6 + rnd());
      }
      g.ellipse(cx, cy, 9.6, 8.6, 2);
      g.ellipse(cx - 3.2, cy + 2.2, 4.6, 3.3, 1, 0.55);
      g.ellipse(cx - 1.4, cy + 1.2, 1.9, 1.3, 2, 0.55);
      g.disc(cx + 5.2, cy + 2.8, 2.6, 1); g.disc(cx + 5.2, cy + 2.8, 1.4, 2);
      g.disc(cx + 1.6, cy - 5, 1.6, 1);
      for (k = 0; k < 7; k++) g.set(cx - 7 + rnd() * 14, cy - 6 + rnd() * 6, 3);
      out.push(g);
    }
    return cropAll(out);
  }
  // IgG antibody: a Y whose Fab arms flap like wings.
  function antibodyFrames() {
    var out = [];
    [0.62, 0.98].forEach(function (spread) {
      var g = new Grid(24, 22), hx = 12, hy = 10.5, L = 8.6;
      [-1, 1].forEach(function (s) {
        var ex = hx + s * Math.sin(spread) * L, ey = hy - Math.cos(spread) * L;
        g.line(hx, hy, ex, ey, 1, 3.4);
        g.disc(ex, ey, 2.1, 1);
        // the gap between heavy and light chains
        g.line(hx + s * Math.sin(spread) * 3.2, hy - Math.cos(spread) * 3.2, ex - s * Math.sin(spread) * 0.8, ey + Math.cos(spread) * 0.8, 2, 1);
      });
      g.line(hx, hy, hx, 20, 1, 3.6);
      g.disc(hx, hy + 0.5, 2.3, 1);
      g.line(hx, hy + 3, hx, 19, 2, 1);
      out.push(g);
    });
    return cropAll(out);
  }
  function glucoseGrid() {                // pyranose ring
    var g = new Grid(13, 13), c = 6.5, r = 5, pts = [];
    for (var k = 0; k < 6; k++) { var a = -Math.PI / 2 + k * Math.PI / 3; pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]); }
    for (k = 0; k < 6; k++) { var p = pts[k], q = pts[(k + 1) % 6]; g.line(p[0], p[1], q[0], q[1], 1, 1.7); }
    g.disc(pts[1][0], pts[1][1], 1.6, 2);   // ring oxygen
    g.set(pts[1][0], pts[1][1], 1);
    return cropAll([g])[0];
  }
  function vsgFrames() {                  // a coat token: checkered disc
    var out = [];
    [0, 1].forEach(function (f) {
      var g = new Grid(17, 17), c = 8.5;
      g.disc(c, c, 7.8, 1); g.disc(c, c, 6.1, 2);
      for (var y = 0; y < 17; y++) for (var x = 0; x < 17; x++) {
        var dx = x + 0.5 - c, dy = y + 0.5 - c;
        if (dx * dx + dy * dy < 24 && ((x + y + f) % 2 === 0)) g.set(x, y, 1);
      }
      out.push(g);
    });
    return cropAll(out);
  }
  function rbcGrid(r, edge) {             // red blood cells for the background
    var s = Math.ceil(r * 2 + 4), g = new Grid(s, s), c = s / 2;
    if (edge) {
      g.ellipse(c, c, r, r * 0.26, 3);
      g.disc(c - r * 0.64, c, r * 0.34, 3); g.disc(c + r * 0.64, c, r * 0.34, 3);
    } else {
      g.disc(c, c, r, 3); g.disc(c, c, r * 0.5, 4);
    }
    return cropAll([g])[0];
  }
  function astrocyteGrid(seed) {          // stage-2 background
    var rnd = mulberry32(seed), g = new Grid(30, 30), c = 15;
    for (var k = 0; k < 7; k++) {
      var a = k / 7 * Math.PI * 2 + rnd() * 0.6, len = 7 + rnd() * 6;
      var ex = c + Math.cos(a) * len, ey = c + Math.sin(a) * len;
      g.line(c, c, ex, ey, 3, 1.3);
      if (rnd() < 0.6) g.line(ex, ey, ex + Math.cos(a + 0.8) * 3, ey + Math.sin(a + 0.8) * 3, 3, 1);
    }
    g.disc(c, c, 3.2, 3); g.disc(c, c, 1.4, 4);
    return cropAll([g])[0];
  }
  function tsetseFrames() {               // the vector, facing left
    var out = [];
    [false, true].forEach(function (up) {
      var g = new Grid(40, 22);
      g.line(1, 13, 9, 12, 1, 1.2);                     // proboscis
      g.disc(11.2, 11.5, 3, 1); g.set(10, 10, 2);       // head and eye
      g.ellipse(17, 11, 4.4, 3.8, 1);                   // thorax
      g.ellipse(26.5, 12, 7.5, 3.6, 1);                 // abdomen
      for (var x = 23; x <= 31; x += 3) g.line(x, 9.8, x, 14.4, 2, 1);
      g.line(14, 14, 12, 19, 1, 1); g.line(17, 14.5, 17.5, 19.5, 1, 1); g.line(20, 14, 23, 19, 1, 1);
      if (up) { g.ellipse(21, 4.5, 8.5, 2.6, 1, -0.45); g.ellipse(21, 4.5, 6.8, 1.2, 2, -0.45); }
      else { g.ellipse(26, 7.4, 10.5, 2.1, 1, 0.04); g.ellipse(26, 7.4, 8.8, 0.8, 2, 0.04); }
      out.push(g);
    });
    return cropAll(out);
  }
  function restartGrid() {
    var g = new Grid(21, 19), cx = 10.5, cy = 9.5;
    g.disc(cx, cy, 8, 1); g.disc(cx, cy, 5.1, 0);
    for (var y = 0; y < 19; y++) for (var x = 0; x < 21; x++) {
      var a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      if (a > -1.45 && a < -0.25) g.set(x, y, 0);
    }
    var t = -0.5, b = -1.5;
    g.tri(cx + Math.cos(t) * 6.6, cy + Math.sin(t) * 6.6,
          cx + Math.cos(b) * 2.6, cy + Math.sin(b) * 2.6,
          cx + Math.cos(b) * 10.6, cy + Math.sin(b) * 10.6, 1);
    return cropAll([g])[0];
  }
  function groundGrid() {
    var g = new Grid(GROUND_W, H - GROUND + 2), rnd = mulberry32(11);
    for (var x = 0; x < GROUND_W; x++) g.set(x, 2, 1);                       // vessel wall
    for (var i = 0; i < 28; i++) {                                           // bumps
      var bx = 8 + Math.floor(rnd() * (GROUND_W - 24)), bl = 2 + Math.floor(rnd() * 6);
      for (var k = 0; k < bl; k++) g.set(bx + k, 1, 1);
      if (bl > 4 && rnd() < 0.5) for (k = 1; k < bl - 1; k++) g.set(bx + k, 0, 1);
    }
    for (i = 0; i < 95; i++) {                                               // endothelium texture
      var dx = 4 + Math.floor(rnd() * (GROUND_W - 12)), dy = 5 + Math.floor(rnd() * 24), dl = rnd() < 0.55 ? 1 : 2 + Math.floor(rnd() * 3);
      for (k = 0; k < dl; k++) g.set(dx + k, dy, 1);
    }
    for (i = 0; i < 11; i++) g.ellipse(12 + rnd() * (GROUND_W - 24), 11 + rnd() * 14, 4 + rnd() * 3, 1.3, 3);
    return g;
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
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"], G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"], I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"], N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"], P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"], S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"], U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"], "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"], ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"]
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
        '<p class="run-help" id="run-help"><kbd>Space</kbd> or <kbd>↑</kbd> to jump (hold to jump higher), <kbd>↓</kbd> to dive, <kbd>P</kbd> to pause. On a phone, tap the game to jump and hold Dive to flatten.</p>' +
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
      cellS: [leukocyteFrames(7.6, 3, 6), leukocyteFrames(8.2, 17, 6), leukocyteFrames(7.2, 29, 6)],
      cellL: [macrophageFrames(5, 4), macrophageFrames(41, 4)],
      igg: antibodyFrames().map(sprite),
      glucose: sprite(glucoseGrid()),
      vsg: vsgFrames().map(sprite),
      rbc: [rbcGrid(4.2), rbcGrid(5.4), rbcGrid(6.6), rbcGrid(6, true), rbcGrid(7.5, true)].map(sprite),
      astro: [astrocyteGrid(2), astrocyteGrid(9), astrocyteGrid(23)].map(sprite),
      fly: tsetseFrames().map(sprite),
      restart: sprite(restartGrid()),
      ground: sprite(groundGrid())
    };
    SPR.rbc.forEach(function (s, i) { s.depth = [0.12, 0.18, 0.26, 0.22, 0.3][i]; });
    SPR.astro.forEach(function (s, i) { s.depth = [0.14, 0.2, 0.26][i]; });

    /* ----- state ----- */
    var state = "ready", tick = 0, speed = CFG.startSpeed, distance = 0, score = 0, bonus = 0;
    var best = parseInt(store("trypanoRun.best"), 10) || 0, newRecord = false;
    var stage = 1, vsgTimer = 0, groundX = 0, flashTimer = 0, overAt = 0, clearTimer = 0;
    var glucoseTimer = 0, vsgSpawnTimer = 0, cause = "", lastFact = -1, toastTimer = 0;
    var player = { y: GROUND, vy: 0, jumping: false, jumpHeld: false, reachedMin: false, duck: false, fastFall: false, phase: 0, visible: false };
    var fly = { x: 300, y: 40, frame: 0, mode: "idle", t: 0, sx: 0, sy: 0, visible: true };
    var obstacles = [], pickups = [], bgCells = [], particles = [], history = [];
    var COLS = [], FLAG = [], DOTS = [], NUC = { x: 0, y: 0 }, PB = { x0: 0, x1: 0, y0: 0, y1: 0 };
    var inView = true, rafActive = false, lastTs = 0, acc = 0;
    var sound = store("trypanoRun.sound") === "on", audioCtx = null;

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
      glucose: function () { beep(880, 1320, 0.07, "square", 0.025); },
      vsg: function () { beep(523, 0, 0.07); beep(659, 0, 0.07, "square", 0.03, 0.08); beep(784, 0, 0.1, "square", 0.03, 0.16); },
      milestone: function () { beep(1046, 0, 0.05, "square", 0.02); beep(1318, 0, 0.07, "square", 0.02, 0.07); },
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
      COLS.length = 0; FLAG.length = 0; DOTS.length = 0;
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
          COLS.push(x, top, bot);
          if (u > 0.18 && u < 0.97 && bot - top >= 3) DOTS.push(x, top + 1);   // attached flagellum, separated from the cell body
          if (top < minY) minY = top;
          if (bot > maxY) maxY = bot;
          if (i === Math.round(L * 0.5)) { NUC.x = x; NUC.y = Math.round(yc) - (duck ? 0 : 1); }
          if (i === Math.round(L * 0.13)) DOTS.push(x, Math.round(yc));
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
      speed = CFG.startSpeed; distance = 0; score = 0; bonus = 0; stage = 1; vsgTimer = 0; flashTimer = 0;
      obstacles.length = 0; pickups.length = 0; particles.length = 0; history.length = 0;
      glucoseTimer = 150 + rand(0, 120); vsgSpawnTimer = 700; clearTimer = 100; newRecord = false; toastTimer = 0;
      player.y = GROUND; player.vy = 0; player.jumping = false; player.jumpHeld = false;
      player.duck = false; player.fastFall = false; player.reachedMin = false;
      frame.classList.remove("is-cns");
    }
    function startGame(withIntro) {
      resetRun();
      if (withIntro && !reduceMotion) {
        state = "intro"; player.visible = false;
        fly.visible = true; fly.mode = "approach"; fly.t = 0; fly.sx = fly.x; fly.sy = fly.y;
      } else {
        state = "running"; player.visible = true; fly.visible = false;
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
      state = "over"; overAt = performance.now(); cause = kind;
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
    function showConsole(mode, info) {
      elFact.hidden = true;
      if (mode === "ready") {
        elTitle.textContent = "Trypano Run";
        elText.innerHTML = "A tsetse fly is about to drop you into the bloodstream. Jump over leukocytes, dodge antibodies, collect glucose and grab a VSG token to switch coats.";
        elFact.innerHTML = "Motility is everything here, and it is also the topic of my latest preprint.";
        elFact.hidden = false;
        btnMain.textContent = "Start swimming";
      } else if (mode === "running") {
        elTitle.textContent = "Swim!";
        elText.textContent = info || "Leukocytes roll on the vessel wall; antibodies float at three heights.";
        btnMain.textContent = "Pause";
      } else if (mode === "paused") {
        elTitle.textContent = "Paused";
        elText.textContent = info || "Press Space, tap the game or choose Resume to continue.";
        btnMain.textContent = "Resume";
      } else if (mode === "over") {
        var titles = {
          cellS: ["Phagocytosed!", "A neutrophil rolling on the vessel wall engulfed you."],
          cellL: ["Phagocytosed!", "A macrophage engulfed you."],
          igg: ["Opsonized!", "Antibodies recognized your VSG coat. Grab a VSG token to switch coats next time."]
        };
        var t = titles[cause] || ["Game over", ""];
        elTitle.textContent = t[0];
        elText.textContent = t[1] + " Score " + score + (newRecord && score > 0 ? ", a new record!" : ". Best " + best + ".");
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
    function groupFrames(members) {
      var n = members[0].length, out = [];
      for (var f = 0; f < n; f++) out.push(sprite(hcat(members.map(function (m) { return m[f]; }), 3)));
      return out;
    }
    function spawnObstacle() {
      var types = ["cellS", "cellS", "cellL"];
      if (speed >= CFG.iggSpeed) types.push("igg", "igg");
      var t = pick(types);
      if (history[0] === t && history[1] === t) t = t === "igg" ? "cellS" : (speed >= CFG.iggSpeed ? "igg" : (t === "cellS" ? "cellL" : "cellS"));
      history.unshift(t); history.length = Math.min(history.length, 2);
      var o = { kind: t, x: W + 2, tick: 0, frame: 0, speedOff: 0, repelled: false, minGap: 120 };
      if (t === "igg") {
        o.frames = SPR.igg; o.w = o.frames[0].w; o.h = o.frames[0].h;
        o.y = pick([GROUND - 2, GROUND - 10, GROUND - 31]) - o.h + 1; // low: jump, middle: dive, high: pass under
        o.speedOff = Math.random() < 0.5 ? 0.7 : -0.5;
        o.minGap = 150;
      } else {
        var maxN = t === "cellS" ? (speed < 7 ? 2 : 3) : (speed < 9.5 ? 1 : 2);
        var n = 1 + Math.floor(Math.random() * maxN), members = [];
        for (var k = 0; k < n; k++) members.push(pick(SPR[t]));
        o.frames = groupFrames(members); o.w = o.frames[0].w; o.h = o.frames[0].h;
        o.y = GROUND - o.h + 1;
      }
      var gap = Math.round(o.w * speed + o.minGap * CFG.gapCoef);
      o.gap = Math.round(rand(gap, gap * CFG.maxGapCoef));
      obstacles.push(o);
    }
    function clearOf(x0, x1) {
      for (var i = 0; i < obstacles.length; i++) { var o = obstacles[i]; if (o.x < x1 && o.x + o.w > x0) return false; }
      return true;
    }
    function spawnGlucose() {
      if (!clearOf(W - 40, W + 70)) { glucoseTimer = 12; return; }
      var g = SPR.glucose, baseY = GROUND - rand(30, 52) - g.h;
      if (Math.random() < 0.35) {
        [0, -9, 0].forEach(function (dy, i) { pickups.push({ kind: "glucose", x: W + 2 + i * 17, y: baseY + dy, w: g.w, h: g.h }); });
      } else {
        pickups.push({ kind: "glucose", x: W + 2, y: baseY, w: g.w, h: g.h });
      }
      glucoseTimer = rand(80, 230);
    }
    function spawnVSG() {
      if (vsgTimer > 0) { vsgSpawnTimer = 240; return; }
      if (!clearOf(W - 40, W + 60)) { vsgSpawnTimer = 15; return; }
      var s = SPR.vsg[0];
      pickups.push({ kind: "vsg", x: W + 2, y: GROUND - rand(30, 46) - s.h, w: s.w, h: s.h, t: 0 });
      vsgSpawnTimer = rand(1100, 1700);
    }
    function seedBackground() {
      bgCells.length = 0;
      for (var x = rand(10, 60); x < W; x += rand(70, 170)) {
        var s = pick(SPR.rbc); bgCells.push({ x: x, y: rand(38, 104), s: s, gap: rand(60, 190) });
      }
    }

    /* ----- update ----- */
    function overlapsPlayer(x, y, w, h) {
      return x < PB.x1 + 2 && x + w > PB.x0 - 2 && y < PB.y1 + 2 && y + h > PB.y0 - 2;
    }
    function collides(o) {
      var g = o.frames[o.frame].grid, ox = Math.round(o.x), oy = Math.round(o.y), hits = 0;
      for (var c = 0; c < COLS.length; c += 3) {
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
        if (player.y >= GROUND) {
          player.y = GROUND; player.vy = 0; player.jumping = false; player.fastFall = false;
        }
      }
    }
    function updateFly() {
      if (!fly.visible) return;
      fly.t++;
      if (fly.mode === "idle") {
        fly.frame = (tick >> 2) & 1;
        fly.x = 286 + Math.sin(tick / 46) * 34; fly.y = 44 + Math.sin(tick / 13) * 4;
      } else if (fly.mode === "approach") {
        fly.frame = (tick >> 1) & 1;
        var k = Math.min(1, fly.t / 42), e = k * k * (3 - 2 * k);
        fly.x = fly.sx + (PX + 4 - fly.sx) * e; fly.y = fly.sy + (GROUND - 58 - fly.sy) * e;
        if (k >= 1) { fly.mode = "bite"; fly.t = 0; }
      } else if (fly.mode === "bite") {
        fly.frame = (tick >> 2) & 1;
        fly.y = GROUND - 58 + Math.sin(fly.t / 3) * 1.2;
        if (fly.t === 12) {          // the parasite is released from the proboscis
          player.visible = true; player.y = fly.y + 20; player.vy = 0;
        }
      } else if (fly.mode === "leave") {
        fly.frame = (tick >> 1) & 1;
        fly.x -= 1.4 + fly.t * 0.04; fly.y -= 1.5;
        if (fly.y < -30 || fly.x < -50) fly.visible = false;
      }
    }
    function updateIntro() {
      updateFly();
      player.phase += 0.35;
      if (player.visible) {
        player.vy += CFG.gravity * 0.8; player.y += player.vy;
        if (player.y >= GROUND) {
          player.y = GROUND; player.vy = 0;
          state = "running"; fly.mode = "leave"; fly.t = 0;
        }
      }
      shapePlayer();
    }
    function updateWorld(sp) {
      groundX = (groundX + sp) % GROUND_W;
      for (var i = bgCells.length - 1; i >= 0; i--) {
        var b = bgCells[i]; b.x -= sp * b.s.depth;
        if (b.x + b.s.w < -2) bgCells.splice(i, 1);
      }
      var last = bgCells[bgCells.length - 1];
      if (!last || last.x < W - last.gap) {
        var s = pick(stage === 2 ? SPR.astro : SPR.rbc);
        bgCells.push({ x: W + 2, y: rand(38, 104), s: s, gap: rand(70, 200) });
      }
    }
    function update() {
      tick++;
      if (state === "ready") { updateFly(); return; }
      if (state === "intro") { updateIntro(); return; }
      if (state !== "running") return;

      if (speed < CFG.maxSpeed) speed += CFG.accel;
      distance += speed;
      updateWorld(speed);
      updatePlayer();
      updateFly();

      // obstacles
      for (var i = obstacles.length - 1; i >= 0; i--) {
        var o = obstacles[i];
        o.x -= speed + o.speedOff;
        if (o.kind === "igg") {
          o.frame = Math.floor(tick / 10) % 2;
          if (o.repelled) { o.y -= 2.2; o.x += 1.5; }
        } else {
          o.tick += speed; o.frame = Math.floor(o.tick / 15) % o.frames.length;
        }
        if (o.x + o.w < -4) obstacles.splice(i, 1);
      }
      if (clearTimer > 0) clearTimer--;
      else {
        var lastOb = obstacles[obstacles.length - 1];
        if (!lastOb || lastOb.x + lastOb.w + lastOb.gap < W) spawnObstacle();
      }

      // pickups
      for (i = pickups.length - 1; i >= 0; i--) {
        var p = pickups[i]; p.x -= speed; p.t = (p.t || 0) + 1;
        if (p.x + p.w < -4) { pickups.splice(i, 1); continue; }
        if (overlapsPlayer(p.x, p.y, p.w, p.h)) {
          pickups.splice(i, 1);
          if (p.kind === "glucose") {
            bonus += CFG.glucose; sfx.glucose();
            particles.push({ text: "+" + CFG.glucose, x: p.x - 2, y: p.y - 9, life: 40 });
          } else {
            vsgTimer = CFG.vsgFrames; sfx.vsg();
            particles.push({ text: "VSG!", x: p.x - 6, y: p.y - 10, life: 50 });
            toast("New VSG coat! Antibodies can’t recognize you for 6 seconds.");
          }
        }
      }
      if (--glucoseTimer <= 0) spawnGlucose();
      if (score > 150 && --vsgSpawnTimer <= 0) spawnVSG();

      for (i = particles.length - 1; i >= 0; i--) {
        var q = particles[i]; q.y -= 0.45; q.x -= speed * 0.25;
        if (--q.life <= 0) particles.splice(i, 1);
      }

      // score, milestones, stage 2
      var newScore = Math.floor(distance * CFG.scoreCoef) + bonus;
      if (Math.floor(newScore / 100) > Math.floor(score / 100)) { flashTimer = 48; sfx.milestone(); }
      score = newScore;
      if (flashTimer > 0) flashTimer--;
      if (stage === 1 && score >= CFG.stage2) {
        stage = 2; frame.classList.add("is-cns"); sfx.stage();
        toast("Stage 2: you crossed into the central nervous system.");
      }
      if (vsgTimer > 0 && --vsgTimer === 0) toast("Your new coat has been spotted: antibodies are back.");
      if (toastTimer > 0 && --toastTimer === 0) elText.textContent = "Keep swimming.";

      shapePlayer();
      for (i = 0; i < obstacles.length; i++) {
        var ob = obstacles[i];
        if (ob.repelled || ob.x > PB.x1 + 1 || ob.x + ob.w < PB.x0 - 1) continue;
        if (collides(ob)) {
          if (ob.kind === "igg" && vsgTimer > 0) {
            ob.repelled = true;
            particles.push({ text: "+5", x: ob.x, y: ob.y - 6, life: 30 }); bonus += 5;
          } else { gameOver(ob.kind); return; }
        }
      }
    }

    /* ----- render ----- */
    function drawText(str, x, y, s, color) {
      ctx.fillStyle = color || INK;
      for (var n = 0; n < str.length; n++) {
        var gl = FONT[str[n]];
        if (gl) for (var r = 0; r < 7; r++) for (var c = 0; c < 5; c++) if (gl[r].charCodeAt(c) === 49) ctx.fillRect(x + c * s, y + r * s, s, s);
        x += 6 * s;
      }
    }
    function textWidth(str, s) { return str.length * 6 * s - s; }
    function pad5(n) { var s = String(Math.min(99999, Math.max(0, n))); while (s.length < 5) s = "0" + s; return s; }
    function drawPlayer() {
      if (!player.visible) return;
      var coat = vsgTimer > 0 && !(vsgTimer < 90 && ((vsgTimer >> 3) & 1));
      ctx.fillStyle = INK;
      for (var c = 0; c < COLS.length; c += 3) {
        var x = COLS[c], top = COLS[c + 1], bot = COLS[c + 2];
        if (coat && bot - top >= 2) {      // switched coat: outlined and checkered
          ctx.fillRect(x, top, 1, 1); ctx.fillRect(x, bot, 1, 1);
          for (var y = top + 1; y < bot; y++) if (((x + y + (tick >> 3)) & 1) === 0) ctx.fillRect(x, y, 1, 1);
        } else {
          ctx.fillRect(x, top, 1, bot - top + 1);
        }
      }
      for (var f = 0; f < FLAG.length; f += 3) ctx.fillRect(FLAG[f], FLAG[f + 1], 1, FLAG[f + 2] - FLAG[f + 1] + 1);
      ctx.fillStyle = BG;
      for (var d = 0; d < DOTS.length; d += 2) ctx.fillRect(DOTS[d], DOTS[d + 1], 1, 1);
      if (state === "over") {           // the nucleus turns into a little cross
        ctx.fillStyle = BG;
        [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]].forEach(function (p) { ctx.fillRect(NUC.x + p[0], NUC.y + p[1], 1, 1); });
      } else if (!coat) {
        var wide = player.duck && !player.jumping ? 1 : 2;
        ctx.fillRect(NUC.x, NUC.y, 2, wide);
      }
    }
    function drawCentered(str, y, s, color) { drawText(str, Math.round((W - textWidth(str, s)) / 2), y, s, color); }
    function render() {
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < bgCells.length; i++) ctx.drawImage(bgCells[i].s.canvas, Math.round(bgCells[i].x), Math.round(bgCells[i].y));

      var gx = Math.floor(groundX), gw = Math.min(W, GROUND_W - gx);
      ctx.drawImage(SPR.ground.canvas, gx, 0, gw, SPR.ground.h, 0, GROUND - 2, gw, SPR.ground.h);
      if (gw < W) ctx.drawImage(SPR.ground.canvas, 0, 0, W - gw, SPR.ground.h, gw, GROUND - 2, W - gw, SPR.ground.h);

      for (i = 0; i < pickups.length; i++) {
        var p = pickups[i];
        var s = p.kind === "glucose" ? SPR.glucose : SPR.vsg[((p.t || 0) >> 3) & 1];
        var bob = p.kind === "vsg" ? Math.round(Math.sin((p.t || 0) / 8) * 1.5) : 0;
        ctx.drawImage(s.canvas, Math.round(p.x), Math.round(p.y) + bob);
      }
      for (i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        if (o.repelled && (tick & 2)) continue;
        ctx.drawImage(o.frames[o.frame].canvas, Math.round(o.x), Math.round(o.y));
      }
      if (fly.visible) ctx.drawImage(SPR.fly[fly.frame].canvas, Math.round(fly.x), Math.round(fly.y));
      drawPlayer();
      for (i = 0; i < particles.length; i++) drawText(particles[i].text, Math.round(particles[i].x), Math.round(particles[i].y), 1, INK);

      // score, Chrome-dino style
      if (state !== "ready") {
        var sc = pad5(score), sx = W - 10 - textWidth(sc, 2);
        if (!(flashTimer > 0 && ((flashTimer >> 3) & 1))) drawText(sc, sx, 10, 2, INK);
        if (best > 0) { var hi = "HI " + pad5(best); drawText(hi, sx - 20 - textWidth(hi, 2), 10, 2, HI_INK); }
        if (vsgTimer > 0) {
          var bw = 56, bx = W - 10 - bw;
          drawText("VSG", bx - 22, 31, 1, INK);
          ctx.fillStyle = SOFT; ctx.fillRect(bx, 32, bw, 4);
          ctx.fillStyle = INK; ctx.fillRect(bx, 32, Math.round(bw * vsgTimer / CFG.vsgFrames), 4);
        }
      } else if (best > 0) {
        var hi2 = "HI " + pad5(best); drawText(hi2, W - 10 - textWidth(hi2, 2), 10, 2, HI_INK);
      }
      if (state === "ready") drawCentered(touchUI ? "TAP TO START" : "PRESS SPACE OR TAP", 86, 2, INK);
      if (state === "paused") { drawCentered("PAUSED", 62, 2, INK); drawCentered(touchUI ? "TAP TO RESUME" : "PRESS SPACE TO RESUME", 86, 1, INK); }
      if (state === "over") {
        drawCentered("GAME OVER", 52, 2, INK);
        ctx.drawImage(SPR.restart.canvas, Math.round((W - SPR.restart.w) / 2), 78);
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

    // first paint
    seedBackground();
    syncSoundButton();
    showConsole("ready");
    render();
    ensureLoop();

    var api = { pause: pause, start: startGame, state: function () { return state; } };
    if (/[?&]debug\b/.test(location.search)) {           // hooks for automated tests only
      api.debug = {
        snapshot: function () {
          return {
            state: state, score: score, speed: speed, stage: stage, vsg: vsgTimer, tick: tick,
            player: { y: player.y, jumping: player.jumping, duck: player.duck, bbox: { x0: PB.x0, x1: PB.x1, y0: PB.y0, y1: PB.y1 } },
            obstacles: obstacles.map(function (o) { return { kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h, repelled: o.repelled }; }),
            pickups: pickups.map(function (p) { return { kind: p.kind, x: p.x, y: p.y }; })
          };
        },
        setScore: function (v) { bonus = 0; distance = v / CFG.scoreCoef; score = v; },
        setSpeed: function (v) { speed = v; },
        giveVSG: function () { vsgTimer = CFG.vsgFrames; },
        spawn: function (kind) { pickups.push(kind === "vsg" ? { kind: "vsg", x: 200, y: GROUND - 50, w: SPR.vsg[0].w, h: SPR.vsg[0].h, t: 0 } : { kind: "glucose", x: 200, y: GROUND - 45, w: SPR.glucose.w, h: SPR.glucose.h }); },
        sprites: SPR,
        toSprite: sprite
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
