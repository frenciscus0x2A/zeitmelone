(function (W) {
  "use strict";

  var EMOJI = "🍉";
  var FONT_FAMILY =
    '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

  var DEFAULT_COUNT = 1;
  var MAX_PER_BURST = 32;
  var MAX_ALIVE = 300;
  var MAX_SPAWN_PER_RAF = 9;
  var PENDING_BURST_CAP = 36;
  var FADE_LAST_MS = 950;
  var PARTICLE_LIFETIME_MS = 4200;
  var FADE_START_MS = PARTICLE_LIFETIME_MS - FADE_LAST_MS;

  var DRAW_FONT_PX = 22;
  var FX_CANVAS_DPR = 1;
  var SPRITE_CELL = 112;

  var LS_KEY = "watermelon_fx_debug";

  var canvas = null;
  var ctx = null;
  var dpr = 1;
  var emojiSprite = null;
  var spriteHalfW = 0;
  var spriteHalfH = 0;
  var spriteOk = false;
  var particles = [];
  var pool = [];
  var rafId = null;
  var pendingBursts = [];
  var resizeBound = false;
  var lastBurst = { cx: 0, cy: 0, t: 0 };
  var firstTickLogged = false;
  var fxHelpPrinted = false;
  var measuredEmojiW = -1;
  var debugCacheReady = false;
  var debugCacheVal = false;

  function invalidateDebugCache() {
    debugCacheReady = false;
  }

  function isDebug() {
    if (debugCacheReady) return debugCacheVal;
    try {
      debugCacheVal =
        window.location.search.indexOf("wcdebug=1") !== -1 ||
        localStorage.getItem(LS_KEY) === "1";
      if (!debugCacheVal) {
        var el = document.getElementById("watermelonClock");
        debugCacheVal = !!(
          el &&
          el.dataset &&
          String(el.dataset.watermelonDebug) === "1"
        );
      }
    } catch (e) {
      debugCacheVal = false;
    }
    debugCacheReady = true;
    return debugCacheVal;
  }

  function debugLog() {
    if (!isDebug()) return;
    var a = ["[watermelon-fx]"];
    for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
    console.log.apply(console, a);
  }

  W.setWatermelonFxDebug = function setWatermelonFxDebug(on) {
    try {
      if (on) localStorage.setItem(LS_KEY, "1");
      else localStorage.removeItem(LS_KEY);
    } catch (e) {}
    invalidateDebugCache();
    debugLog("persistent debug", on ? "ON" : "OFF", "— reload the page");
  };

  W.isWatermelonFxDebug = function isWatermelonFxDebug() {
    return isDebug();
  };

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("data-watermelon-fx", "");
    canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483645;contain:strict";
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
      willReadFrequently: false,
    });
    if (!ctx) {
      debugLog("ERROR: getContext('2d') returned null");
      return;
    }
    bindResize();
    resize();
    debugLog(
      "canvas OK — buffer",
      canvas.width,
      "x",
      canvas.height,
      "css",
      window.innerWidth,
      "x",
      window.innerHeight,
    );
  }

  function bindResize() {
    if (resizeBound) return;
    resizeBound = true;
    window.addEventListener("resize", resize, { passive: true });
  }

  function rebuildEmojiSprite() {
    emojiSprite = null;
    spriteOk = false;
    var sc = document.createElement("canvas");
    sc.width = SPRITE_CELL;
    sc.height = SPRITE_CELL;
    var sctx = sc.getContext("2d", {
      alpha: true,
      desynchronized: true,
      willReadFrequently: false,
    });
    if (!sctx) return;
    sctx.textAlign = "center";
    sctx.textBaseline = "middle";
    sctx.font = DRAW_FONT_PX + "px " + FONT_FAMILY;
    var cx = SPRITE_CELL * 0.5;
    var cy = SPRITE_CELL * 0.5;
    sctx.fillText(EMOJI, cx, cy);
    var mw = sctx.measureText(EMOJI).width;
    measuredEmojiW = mw;
    if (!isFinite(mw) || mw < 1.5) {
      debugLog("emoji sprite skipped — measureText width=", mw);
      return;
    }
    emojiSprite = sc;
    spriteHalfW = SPRITE_CELL * 0.5;
    spriteHalfH = SPRITE_CELL * 0.5;
    spriteOk = true;
  }

  function resize() {
    if (!canvas || !ctx) return;
    dpr = FX_CANVAS_DPR;
    var w = window.innerWidth | 0;
    var h = window.innerHeight | 0;
    if (w < 1 || h < 1) return;
    canvas.width = (w * dpr) | 0;
    canvas.height = (h * dpr) | 0;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    rebuildEmojiSprite();
  }

  function obtainParticle() {
    return pool.length ? pool.pop() : {};
  }

  function recycleParticle(p) {
    pool.push(p);
  }

  function drawFallbackMelon(px, py, scale, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    ctx.rotate(0);
    ctx.scale(scale, scale);
    var r = 10;
    ctx.fillStyle = "#e84a6c";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.9, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7ef0a8";
    ctx.beginPath();
    ctx.arc(0, -r * 0.35, r * 0.45, Math.PI * 0.15, Math.PI * 0.85);
    ctx.fill();
    ctx.restore();
  }

  function spawnBurstParticles(cx, cy, count) {
    lastBurst.cx = cx;
    lastBurst.cy = cy;
    lastBurst.t = performance.now();

    var room = MAX_ALIVE - particles.length;
    if (room <= 0) {
      debugLog("spawn skipped: MAX_ALIVE reached", particles.length);
      return;
    }
    count = Math.min(count, room, MAX_PER_BURST);
    if (count < 1) return;
    debugLog("spawn", count, "particles at", cx, cy, "room", room);

    var tSpawn = performance.now();
    var i;
    var twoPi = Math.PI * 2;
    for (i = 0; i < count; i += 1) {
      var p = obtainParticle();
      var ang =
        count === 1
          ? Math.random() * twoPi
          : (twoPi * i) / count + (Math.random() - 0.5) * 0.55;
      var sp = 1.6 + Math.random() * 3.1;

      p.x = cx + (Math.random() - 0.5) * 6;
      p.y = cy + (Math.random() - 0.5) * 6;
      p.vx = Math.cos(ang) * sp * 0.62;
      p.vy = Math.sin(ang) * sp * 0.45 - (6.2 + Math.random() * 4.8);
      p.z = -1.12 + Math.random() * 0.2;
      p.vz = 0.045 + Math.random() * 0.042;
      p.g = 0.34 + Math.random() * 0.09;
      p.rot = (Math.random() - 0.5) * 0.75;
      p.vr = (Math.random() - 0.5) * 0.12;
      p.rx = (Math.random() - 0.5) * 0.55;
      p.vrx = (Math.random() - 0.5) * 0.16;
      p.t0 = tSpawn;
      particles.push(p);
    }
  }

  function ensureTick() {
    if (rafId != null) return;
    firstTickLogged = false;
    rafId = requestAnimationFrame(tick);
  }

  function drainPendingBursts(budget) {
    if (!ctx) return;
    while (pendingBursts.length > 0 && budget > 0) {
      var job = pendingBursts.shift();
      var want = job.n | 0;
      if (want < 1) continue;

      var room = MAX_ALIVE - particles.length;
      if (room <= 0) {
        pendingBursts.unshift(job);
        break;
      }
      var take = Math.min(want, room, MAX_PER_BURST, budget);
      if (take > 0) {
        spawnBurstParticles(job.cx, job.cy, take);
        budget -= take;
      }
      if (want > take) {
        pendingBursts.unshift({
          cx: job.cx,
          cy: job.cy,
          n: want - take,
        });
        break;
      }
    }
  }

  function enqueueBurst(cx, cy, count) {
    ensureCanvas();
    if (!ctx) return;

    while (pendingBursts.length >= PENDING_BURST_CAP) pendingBursts.shift();

    pendingBursts.push({ cx: cx, cy: cy, n: count });
    ensureTick();
  }

  function tick() {
    if (!ctx) {
      rafId = null;
      return;
    }

    drainPendingBursts(MAX_SPAWN_PER_RAF);

    var w = window.innerWidth;
    var h = window.innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);

    var dbg = isDebug();
    var now = performance.now();
    if (dbg && now - lastBurst.t < 2500) {
      ctx.save();
      ctx.strokeStyle = "rgba(0,255,100,0.95)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(lastBurst.cx, lastBurst.cy, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0,255,100,0.25)";
      ctx.beginPath();
      ctx.arc(lastBurst.cx, lastBurst.cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    var i;
    var len = particles.length;
    for (i = len - 1; i >= 0; i -= 1) {
      var p = particles[i];
      var ageMs = now - p.t0;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vz += 0.00105;
      if (p.vy > 2.1) p.vz += 0.00055;
      p.z += p.vz;
      p.rot += p.vr;
      p.rx += p.vrx;
      p.vrx *= 0.984;
      p.vx *= 0.996;

      var dead = ageMs > PARTICLE_LIFETIME_MS;

      if (dead) {
        recycleParticle(p);
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }

      var zClamped = p.z > 2.6 ? 2.6 : p.z;
      var t = (zClamped + 1.18) / 3.05;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var scale = 0.16 + t * 2.72;
      var flatY = 0.34 + 0.66 * Math.abs(Math.cos(p.rx));
      if (flatY < 0.34) flatY = 0.34;
      var fade;
      if (ageMs <= FADE_START_MS) {
        fade = 1;
      } else {
        var u = (ageMs - FADE_START_MS) / FADE_LAST_MS;
        if (u < 0) u = 0;
        if (u > 1) u = 1;
        fade = 0.5 * (1 + Math.cos(Math.PI * u));
      }
      if (fade < 0) fade = 0;
      if (fade > 1) fade = 1;
      var alpha = fade * (0.97 + 0.03 * t);

      if (alpha < 0.018) {
        continue;
      }

      var co = Math.cos(p.rot);
      var si = Math.sin(p.rot);
      var sx = scale;
      var sy = scale * flatY;
      var la = co * sx;
      var lb = si * sx;
      var lc = -si * sy;
      var ld = co * sy;

      ctx.globalAlpha = alpha;
      if (spriteOk && emojiSprite) {
        ctx.setTransform(
          dpr * la,
          dpr * lb,
          dpr * lc,
          dpr * ld,
          dpr * p.x,
          dpr * p.y,
        );
        ctx.drawImage(emojiSprite, -spriteHalfW, -spriteHalfH);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(sx, sy);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = DRAW_FONT_PX + "px " + FONT_FAMILY;
        ctx.fillText(EMOJI, 0, 0);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;

      if (dbg) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(sx, sy);
        ctx.strokeStyle = "rgba(255,0,255,0.9)";
        ctx.lineWidth = 2 / Math.max(scale, 0.2);
        var db = DRAW_FONT_PX * 0.55;
        ctx.strokeRect(-db, -db, db * 2, db * 2);
        ctx.restore();
      }

      if (dbg && measuredEmojiW >= 0 && measuredEmojiW < 2) {
        drawFallbackMelon(p.x, p.y, scale * flatY * 0.85, alpha * 0.9);
      }
    }

    if (dbg && particles.length > 0 && !firstTickLogged) {
      firstTickLogged = true;
      var s = particles[particles.length - 1];
      debugLog("first tick: n=", particles.length, "sample", {
        x: s.x,
        y: s.y,
        z: s.z,
        ageMs: now - s.t0,
      });
    }

    var keepTicking = particles.length > 0 || pendingBursts.length > 0;
    if (keepTicking) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
      firstTickLogged = false;
    }
  }

  W.burstWatermelonEmojis = function burstWatermelonEmojis(
    clientX,
    clientY,
    options,
  ) {
    options = options || {};

    var n = Number(options.count);
    if (!isFinite(n) || n < 1) n = DEFAULT_COUNT;
    n = Math.min(MAX_PER_BURST, Math.max(1, n | 0));

    debugLog("burst called", clientX, clientY, "count", n);

    if (isDebug() && !fxHelpPrinted) {
      fxHelpPrinted = true;
      console.info(
        "[watermelon-fx] Help: ?wcdebug=1 | WatermelonKit.setWatermelonFxDebug(true) | data-watermelon-debug on #watermelonClock",
      );
    }

    enqueueBurst(clientX, clientY, n);
  };

  if (isDebug()) {
    debugLog(
      "debug on — green marker = click point, magenta = emoji bbox, pink/green fallback if measureText≈0",
    );
  }
})((window.WatermelonKit = window.WatermelonKit || {}));
