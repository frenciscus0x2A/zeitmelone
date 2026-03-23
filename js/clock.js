(function (W) {
  "use strict";

  var DEFAULT_INTERVAL_MS = 15000;
  var SEED_COUNT = 15;
  var DEG_PER_SEED = 360 / SEED_COUNT;
  var FACE_SELECTOR = "[data-clock-face]";

  function readIntervalMs(root) {
    var raw = root.dataset.intervalMs;
    var n = raw != null ? parseInt(String(raw), 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_MS;
  }

  function appendCycleHand(container) {
    var hand = document.createElement("div");
    hand.className = "clock-hand clock-hand--spoon clock-hand--cycle";
    hand.id = "clockHandCycle";
    container.appendChild(hand);
    return hand;
  }

  function appendHourHand(container) {
    var hand = document.createElement("div");
    hand.className = "clock-hand clock-hand--spoon clock-hand--hour";
    hand.id = "clockHandHour";
    container.appendChild(hand);
    return hand;
  }

  function appendSeeds(container) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < SEED_COUNT; i++) {
      var seed = document.createElement("div");
      seed.className = "seed";
      seed.style.setProperty("--angle", i * DEG_PER_SEED + "deg");
      frag.appendChild(seed);
    }
    container.appendChild(frag);
  }

  function rotationDegCycle(elapsedSec, intervalSec) {
    var progress = (elapsedSec % intervalSec) / intervalSec;
    return progress * 360;
  }

  function setHandRotation(handEl, deg) {
    handEl.style.transform =
      "translate(-50%, -100%) rotate(" + deg + "deg)";
  }

  var BASE_RATE = 0.8;
  var TAP_RATE_STEP = 0.48;
  var MAX_RATE = 7;
  var RATE_DECAY_PER_S = 2.2;

  function startHands(cycleHand, hourHand, intervalMs) {
    var intervalSec = intervalMs / 1000;
    var lastNow = performance.now();
    var virtualSec = 0;
    var rate = BASE_RATE;
    var lastCycle = -1;
    var seedIndex = 0;
    var rafId = 0;

    setHandRotation(hourHand, 0);

    function nudgeFromTap() {
      rate = Math.min(MAX_RATE, rate + TAP_RATE_STEP);
    }

    function frame(now) {
      var dt = (now - lastNow) / 1000;
      lastNow = now;
      if (dt < 0) dt = 0;
      if (dt > 0.25) dt = 0.25;

      if (rate > BASE_RATE) {
        var excess = rate - BASE_RATE;
        excess *= Math.exp(-RATE_DECAY_PER_S * dt);
        rate = BASE_RATE + excess;
        if (rate < BASE_RATE + 0.0005) rate = BASE_RATE;
      }

      virtualSec += rate * dt;

      var cycle = Math.floor(virtualSec / intervalSec);

      if (lastCycle >= 0 && cycle > lastCycle) {
        seedIndex = (seedIndex + 1) % SEED_COUNT;
        setHandRotation(hourHand, seedIndex * DEG_PER_SEED);
      }
      lastCycle = cycle;

      setHandRotation(cycleHand, rotationDegCycle(virtualSec, intervalSec));
      rafId = requestAnimationFrame(frame);
    }

    var prevNudge = W.nudgeWatermelonClockSpeed;
    W.nudgeWatermelonClockSpeed = nudgeFromTap;

    rafId = requestAnimationFrame(frame);

    return function stopWatermelonClock() {
      cancelAnimationFrame(rafId);
      if (W.nudgeWatermelonClockSpeed === nudgeFromTap) {
        W.nudgeWatermelonClockSpeed = prevNudge;
      }
    };
  }

  W.initWatermelonClock = function initWatermelonClock(root) {
    if (!root || !(root instanceof HTMLElement)) return null;

    var face = root.querySelector(FACE_SELECTOR);
    if (!face || !(face instanceof HTMLElement)) return null;

    var intervalMs = readIntervalMs(root);
    appendSeeds(face);
    var hourHand = appendHourHand(face);
    var cycleHand = appendCycleHand(face);

    var stopHands = startHands(cycleHand, hourHand, intervalMs);

    var SPECIAL_TAP_MSG = "/cto_it";
    var TAP_K_CAP = 999000;

    var tapRow = document.createElement("div");
    tapRow.className = "watermelon-clock__tap-count";
    tapRow.id = "watermelonTapCount";
    tapRow.setAttribute("aria-live", "polite");

    function formatTapCountDisplay(n) {
      if (n > TAP_K_CAP) return SPECIAL_TAP_MSG;
      if (n < 1000) return String(n);
      var k = (n / 1000) | 0;
      var r = n % 1000;
      var floorL = "\u230A";
      var floorR = "\u230B";
      var dot = "\u00B7";
      if (r === 0) return floorL + k + floorR;
      return floorL + k + floorR + dot + r;
    }

    function applyTapCountUi(n, display) {
      tapRow.textContent = display;
      if (n > TAP_K_CAP) {
        tapRow.classList.add("watermelon-clock__tap-count--cto");
        tapRow.setAttribute("aria-label", "Special message");
        tapRow.title = SPECIAL_TAP_MSG;
      } else {
        tapRow.classList.remove("watermelon-clock__tap-count--cto");
        tapRow.setAttribute("aria-label", "Tap count: " + n);
        tapRow.title =
          n >= 1000 && n <= TAP_K_CAP
            ? display + " → " + n
            : "Tap count: " + n;
      }
    }

    var tapTotal = 0;
    applyTapCountUi(0, "0");

    function incrementTapCount() {
      tapTotal += 1;
      applyTapCountUi(tapTotal, formatTapCountDisplay(tapTotal));
    }

    function setTapCount(n) {
      var v = n | 0;
      if (v < 0) v = 0;
      tapTotal = v;
      applyTapCountUi(tapTotal, formatTapCountDisplay(tapTotal));
    }

    var prevInc = W.incrementWatermelonTapCount;
    W.incrementWatermelonTapCount = incrementTapCount;
    var prevSet = W.setWatermelonTapCount;
    W.setWatermelonTapCount = setTapCount;
    face.appendChild(tapRow);

    return function stopWatermelonClockFull() {
      stopHands();
      if (W.incrementWatermelonTapCount === incrementTapCount) {
        W.incrementWatermelonTapCount = prevInc;
      }
      if (W.setWatermelonTapCount === setTapCount) {
        W.setWatermelonTapCount = prevSet;
      }
      if (tapRow.parentNode) tapRow.parentNode.removeChild(tapRow);
    };
  };
})(window.WatermelonKit = window.WatermelonKit || {});
