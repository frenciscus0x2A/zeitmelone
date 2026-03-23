(function (W) {
  "use strict";

  var DEFAULT_EATING_SOUND_URL = "assets/sounds/eating.mp3";

  var reducedMotionMq =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  function noop() {}

  var HIT_CLASS = "watermelon-clock--hit";
  var HIT_RESET_MS = 520;
  var tapHitState = new WeakMap();

  var HIT_VAR_NAMES = [
    "--hit-x1",
    "--hit-y1",
    "--hit-r1",
    "--hit-s1",
    "--hit-k1",
    "--hit-k2",
    "--hit-x2",
    "--hit-y2",
    "--hit-r2",
    "--hit-s2",
    "--hit-k3",
    "--hit-k4",
    "--hit-x3",
    "--hit-y3",
    "--hit-r3",
    "--hit-s3",
    "--hit-x4",
    "--hit-y4",
    "--hit-r4",
  ];

  function setRandomShockVars(root) {
    var a = reducedMotionMq && reducedMotionMq.matches ? 0.38 : 1;
    function px(lo, hi) {
      return (lo + Math.random() * (hi - lo)).toFixed(2) + "px";
    }
    function deg(lo, hi) {
      return (lo + Math.random() * (hi - lo)).toFixed(2) + "deg";
    }
    function scl(lo, hi) {
      return (lo + Math.random() * (hi - lo)).toFixed(3);
    }
    root.style.setProperty("--hit-x1", px(-11 * a, 11 * a));
    root.style.setProperty("--hit-y1", px(-9 * a, 9 * a));
    root.style.setProperty("--hit-r1", deg(-5.2 * a, 5.2 * a));
    root.style.setProperty("--hit-s1", scl(0.9, 0.98));
    root.style.setProperty("--hit-k1", deg(-7 * a, 7 * a));
    root.style.setProperty("--hit-k2", deg(-5 * a, 5 * a));
    root.style.setProperty("--hit-x2", px(-10 * a, 10 * a));
    root.style.setProperty("--hit-y2", px(-10 * a, 10 * a));
    root.style.setProperty("--hit-r2", deg(-4.8 * a, 4.8 * a));
    root.style.setProperty("--hit-s2", scl(1.01, 1.08));
    root.style.setProperty("--hit-k3", deg(-5 * a, 5 * a));
    root.style.setProperty("--hit-k4", deg(-4 * a, 4 * a));
    root.style.setProperty("--hit-x3", px(-6 * a, 6 * a));
    root.style.setProperty("--hit-y3", px(-5 * a, 5 * a));
    root.style.setProperty("--hit-r3", deg(-3 * a, 3 * a));
    root.style.setProperty("--hit-s3", scl(0.96, 1.04));
    root.style.setProperty("--hit-x4", px(-3 * a, 3 * a));
    root.style.setProperty("--hit-y4", px(-2.5 * a, 2.5 * a));
    root.style.setProperty("--hit-r4", deg(-1.6 * a, 1.6 * a));
  }

  function scheduleTapShock(root) {
    var st = tapHitState.get(root);
    if (!st) {
      st = { gen: 0, timer: 0, shockRaf: null };
      tapHitState.set(root, st);
    }
    if (st.shockRaf != null) return;
    st.shockRaf = requestAnimationFrame(function () {
      st.shockRaf = null;
      triggerBrutalTap(root);
    });
  }

  function triggerBrutalTap(root) {
    var st = tapHitState.get(root);
    if (!st) {
      st = { gen: 0, timer: 0, shockRaf: null };
      tapHitState.set(root, st);
    }
    st.gen += 1;
    var gen = st.gen;

    setRandomShockVars(root);
    root.classList.remove(HIT_CLASS);
    void root.offsetWidth;
    root.classList.add(HIT_CLASS);

    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(function () {
      st.timer = 0;
      if (st.gen === gen) root.classList.remove(HIT_CLASS);
    }, HIT_RESET_MS);
  }

  var AUDIO_POOL_SIZE = 4;
  var EAT_SOUND_MIN_GAP_MS = 55;

  function playFromPool(pool, gate) {
    if (!pool || !pool.length) return;
    try {
      var now = performance.now();
      if (now - gate.lastAt < EAT_SOUND_MIN_GAP_MS) return;
      gate.lastAt = now;
      var i;
      for (i = 0; i < pool.length; i += 1) {
        var a = pool[i];
        if (a.paused || a.ended) {
          a.currentTime = 0;
          a.play().catch(function () {});
          return;
        }
      }
      var steal = pool[0];
      steal.pause();
      steal.currentTime = 0;
      steal.play().catch(function () {});
    } catch (e) {}
  }

  W.attachWatermelonEatingSound = function attachWatermelonEatingSound(
    root,
    options,
  ) {
    options = options || {};
    if (!root || !(root instanceof HTMLElement)) return noop;

    var src =
      typeof options.src === "string" && options.src.length > 0
        ? options.src
        : DEFAULT_EATING_SOUND_URL;

    var audioPool = [];
    var pi;
    for (pi = 0; pi < AUDIO_POOL_SIZE; pi += 1) {
      try {
        var aud = new Audio(src);
        aud.preload = "auto";
        audioPool.push(aud);
      } catch (e) {}
    }

    var soundGate = { lastAt: 0 };

    function tapViewportPoint(el, source) {
      if (
        source &&
        "clientX" in source &&
        typeof source.clientX === "number" &&
        typeof source.clientY === "number"
      ) {
        return { x: source.clientX, y: source.clientY };
      }
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function burstAt(x, y) {
      if (typeof W.burstWatermelonEmojis === "function") {
        W.burstWatermelonEmojis(x, y);
      }
    }

    function onTap(source) {
      var p = tapViewportPoint(root, source);
      if (typeof W.nudgeWatermelonClockSpeed === "function") {
        W.nudgeWatermelonClockSpeed();
      }
      if (typeof W.incrementWatermelonTapCount === "function") {
        W.incrementWatermelonTapCount();
      }
      burstAt(p.x, p.y);
      scheduleTapShock(root);
      playFromPool(audioPool, soundGate);
    }

    function onClickFallback(e) {
      if (!root.contains(e.target)) return;
      if (e.button != null && e.button !== 0) return;
      onTap(e);
    }

    function onPointerDown(e) {
      if (!root.contains(e.target)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      onTap(e);
    }

    function onKeyDown(e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      onTap(e);
    }

    var prevTabIndex = root.getAttribute("tabindex");
    var prevLabel = root.getAttribute("aria-label") || "";
    var addon = " Click to play eating sound.";

    root.classList.add("watermelon-clock--interactive");
    root.tabIndex = 0;
    if (prevLabel.indexOf("Click to play eating sound") === -1) {
      root.setAttribute("aria-label", prevLabel + addon);
    }

    var usePointer = typeof window.PointerEvent !== "undefined";
    if (usePointer) {
      root.addEventListener("pointerdown", onPointerDown, true);
    } else {
      root.addEventListener("click", onClickFallback, true);
    }
    root.addEventListener("keydown", onKeyDown);

    return function detachWatermelonEatingSound() {
      var st = tapHitState.get(root);
      if (st && st.timer) {
        clearTimeout(st.timer);
        st.timer = 0;
      }
      if (st && st.shockRaf != null) {
        cancelAnimationFrame(st.shockRaf);
        st.shockRaf = null;
      }
      tapHitState.delete(root);

      var aj;
      for (aj = 0; aj < audioPool.length; aj += 1) {
        try {
          audioPool[aj].pause();
          audioPool[aj].src = "";
          audioPool[aj].load();
        } catch (e) {}
      }
      audioPool.length = 0;

      var vi;
      for (vi = 0; vi < HIT_VAR_NAMES.length; vi += 1) {
        root.style.removeProperty(HIT_VAR_NAMES[vi]);
      }

      if (usePointer) {
        root.removeEventListener("pointerdown", onPointerDown, true);
      } else {
        root.removeEventListener("click", onClickFallback, true);
      }
      root.removeEventListener("keydown", onKeyDown);
      root.classList.remove(HIT_CLASS);
      root.classList.remove("watermelon-clock--interactive");
      if (prevTabIndex == null) root.removeAttribute("tabindex");
      else root.setAttribute("tabindex", prevTabIndex);
      root.setAttribute("aria-label", prevLabel);
    };
  };
})(window.WatermelonKit = window.WatermelonKit || {});
