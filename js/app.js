(function () {
  "use strict";

  function bootstrap() {
    var root = document.getElementById("watermelonClock");
    if (!root) return;

    var W = window.WatermelonKit;
    if (!W || typeof W.initWatermelonClock !== "function") return;
    W.initWatermelonClock(root);

    var soundOff =
      root.dataset.eatingSound === "false" || root.dataset.eatingSound === "0";
    var soundOn = root.hasAttribute("data-eating-sound") && !soundOff;

    if (!soundOn) return;
    if (typeof W.attachWatermelonEatingSound !== "function") return;

    var raw = root.dataset.soundSrc;
    var customSrc = typeof raw === "string" ? raw.trim() : "";
    var soundOpts = customSrc.length > 0 ? { src: customSrc } : {};

    W.attachWatermelonEatingSound(root, soundOpts);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
