/* Click the parasite – the original mini-game, rewritten without dependencies.
   Catch as many parasites as possible in 20 seconds in a counting chamber. */
(function () {
  "use strict";

  var DURATION = 20;
  var SPRITES = [
    { src: "img/sprite-giardia.png", name: "Giardia" },
    { src: "img/sprite-brucei.png", name: "Trypanosoma brucei" },
    { src: "img/sprite-leishmania.png", name: "Leishmania" }
  ];

  function readBest() { try { return parseInt(localStorage.getItem("clickParasite.best"), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem("clickParasite.best", String(v)); } catch (e) {} }

  function mount(root) {
    root.innerHTML =
      '<div class="clicker-board">' +
        '<div class="clicker-message"><strong>Click the parasite</strong>' +
        "<span>The counting chamber is full of parasites. Catch as many as you can in 20 seconds.</span></div>" +
        '<button type="button" class="clicker-target" hidden><img alt=""></button>' +
      "</div>" +
      '<div class="clicker-bar">' +
        '<p class="clicker-stat">Time <b data-time>' + DURATION + "</b> s</p>" +
        '<p class="clicker-stat">Caught <b data-score>0</b></p>' +
        '<p class="clicker-stat">Best <b data-best>0</b></p>' +
        '<button type="button" class="btn btn-primary" data-start>Start counting</button>' +
      "</div>" +
      '<p class="sr-only" aria-live="polite" data-live></p>';

    var board = root.querySelector(".clicker-board");
    var message = root.querySelector(".clicker-message");
    var msgTitle = message.querySelector("strong"), msgText = message.querySelector("span");
    var target = root.querySelector(".clicker-target"), targetImg = target.querySelector("img");
    var timeEl = root.querySelector("[data-time]"), scoreEl = root.querySelector("[data-score]");
    var bestEl = root.querySelector("[data-best]"), startBtn = root.querySelector("[data-start]");
    var live = root.querySelector("[data-live]");

    var running = false, score = 0, endAt = 0, raf = 0, best = readBest(), last = -1;
    bestEl.textContent = best;

    function place() {
      var i;
      do { i = Math.floor(Math.random() * SPRITES.length); } while (SPRITES.length > 1 && i === last);
      last = i;
      targetImg.src = SPRITES[i].src;
      target.setAttribute("aria-label", "Catch the " + SPRITES[i].name);
      var pad = 44, w = board.clientWidth, h = board.clientHeight;
      target.style.left = (pad + Math.random() * Math.max(1, w - 2 * pad)) + "px";
      target.style.top = (pad + Math.random() * Math.max(1, h - 2 * pad)) + "px";
    }
    function tick() {
      var left = Math.max(0, endAt - performance.now());
      timeEl.textContent = Math.ceil(left / 1000);
      if (left <= 0) { finish(true); return; }
      raf = requestAnimationFrame(tick);
    }
    function start() {
      score = 0; scoreEl.textContent = "0";
      running = true; endAt = performance.now() + DURATION * 1000;
      message.hidden = true; target.hidden = false;
      startBtn.textContent = "Restart";
      place();
      target.focus({ preventScroll: true });
      cancelAnimationFrame(raf); tick();
    }
    function finish(timeUp) {
      running = false; cancelAnimationFrame(raf);
      target.hidden = true; message.hidden = false;
      if (!timeUp) {
        msgTitle.textContent = "Click the parasite";
        msgText.textContent = "Game stopped. Start again whenever you like.";
        timeEl.textContent = DURATION; startBtn.textContent = "Start counting";
        return;
      }
      var record = score > best;
      if (record) { best = score; saveBest(best); bestEl.textContent = best; }
      msgTitle.textContent = "Time’s up!";
      msgText.textContent = "You caught " + score + " parasite" + (score === 1 ? "" : "s") + "." + (record && score > 0 ? " New record!" : "");
      live.textContent = msgTitle.textContent + " " + msgText.textContent;
      startBtn.textContent = "Play again";
    }

    target.addEventListener("click", function () {
      if (!running) return;
      score += 1; scoreEl.textContent = score;
      place();
    });
    startBtn.addEventListener("click", start);
    document.addEventListener("gametabchange", function () {
      if (running && root.closest("[hidden]")) finish(false);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && running) finish(false);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.querySelector("[data-click-parasite]");
    if (el) mount(el);
  });
})();
