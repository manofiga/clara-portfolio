// @ts-check
(() => {
  // Interaction-only heartbeat with ≥15s throttle; plus a ONE-TIME bootstrap when tab is visible.
  const MIN_GAP_MS = 15000;
  let last = 0;
  let booted = false;

  function send(reason = "interaction") {
    if (document.hidden) return;
    const now = Date.now();
    if (now - last < MIN_GAP_MS && reason !== "visible-boot") return;
    last = now;

    try {
      if (chrome?.runtime?.id) {
        chrome.runtime.sendMessage({
          type: "HEARTBEAT",
          url: location.href,
          title: document.title,
          ts: now,
          reason
        });
      }
    } catch {}
  }

  // Interactions
  const onPointer = () => send("pointer");
  const onKey = (e) => {
    if (["Shift","Meta","Alt","Control"].includes(e.key)) return;
    send("key");
  };
  const onWheel  = () => send("wheel");
  const onScroll = () => send("scroll");

  window.addEventListener("pointerdown", onPointer, { passive: true });
  window.addEventListener("keydown",     onKey,     { passive: true });
  window.addEventListener("wheel",       onWheel,   { passive: true });
  window.addEventListener("scroll",      onScroll,  { passive: true });

  // When tab becomes visible, reset throttle and send ONE bootstrap ping
  function bootIfVisible() {
    if (!document.hidden && !booted) {
      booted = true;
      last = 0;                // allow immediate send
      send("visible-boot");    // single bootstrap ping
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      last = 0;     // allow next interaction immediately
      bootIfVisible();
    }
  });

  // If we loaded already visible, bootstrap once
  if (!document.hidden) {
    // tiny delay makes sure document.title/url are settled
    setTimeout(bootIfVisible, 300);
  }
})();