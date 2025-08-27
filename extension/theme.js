// filepath: theme.js
// MV3-safe theme bootstrap used by all extension HTML pages

(function () {
  const root = document.documentElement;
  const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");

  function apply(mode) {
    const effective =
      mode === "system"
        ? (mq && mq.matches ? "dark" : "light")
        : (mode || "system");

    // Drive CSS custom properties via [data-theme] on <html>
    root.setAttribute("data-theme", effective);

    // Let UA widgets (scrollbars, inputs, etc.) pick the right palette
    document.body && document.body.setAttribute("data-color-scheme", effective);
  }

  async function init() {
    try {
      const { themePref = "system" } = await chrome.storage.local.get("themePref");
      apply(themePref);

      // React to OS changes when in "system"
      if (mq && mq.addEventListener) {
        mq.addEventListener("change", () => {
          chrome.storage.local.get("themePref").then(({ themePref = "system" }) => {
            if (themePref === "system") apply("system");
          });
        });
      }

      // React to popup changes instantly
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.themePref) {
          apply(changes.themePref.newValue || "system");
        }
      });
    } catch {
      // fall back: respect OS
      apply("system");
    }
  }

  // Run as soon as the script loads
  init();
})();