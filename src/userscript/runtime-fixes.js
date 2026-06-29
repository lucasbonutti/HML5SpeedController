/** Small compatibility repairs around the local userscript runtime. */
(function installRuntimeCompatibilityFixes() {
  // EventManager historically calls VSC.inIframe while the implementation is
  // namespaced under DomUtils. Restoring the intended alias lets same-origin
  // frame shortcuts also observe the top document.
  window.VSC.inIframe = window.VSC.DomUtils.inIframe;

  // Chromium and Firefox expose requestIdleCallback, but a fallback keeps the
  // userscript functional in browsers or privacy modes that omit it.
  if (typeof window.requestIdleCallback !== "function") {
    window.requestIdleCallback = (callback, options = {}) => {
      const started = Date.now();
      return window.setTimeout(
        () =>
          callback({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - started)),
          }),
        Math.min(options.timeout || 1, 50),
      );
    };
    window.cancelIdleCallback = (id) => window.clearTimeout(id);
  }

  // The upstream observer tracks shadow roots but not their MutationObserver
  // instances, so teardown cannot disconnect them. Keep explicit instances in
  // the userscript to make enable/disable and reinitialization leak-free.
  const OriginalMutationObserver = window.VSC.VideoMutationObserver;
  class UserscriptMutationObserver extends OriginalMutationObserver {
    constructor(...args) {
      super(...args);
      this.shadowObserverInstances = new Map();
    }

    observeShadowRoot(shadowRoot) {
      if (this.shadowObserverInstances.has(shadowRoot)) {
        return;
      }
      const observer = new MutationObserver((mutations) => {
        requestIdleCallback(() => this.processMutations(mutations), {
          timeout: 500,
        });
      });
      observer.observe(shadowRoot, {
        attributeFilter: ["aria-hidden", "data-focus-method"],
        childList: true,
        subtree: true,
      });
      this.shadowObserverInstances.set(shadowRoot, observer);
      this.shadowObservers.add(shadowRoot);
      window.VSC.logger.debug("Shadow root observer added");
    }

    stop() {
      for (const observer of this.shadowObserverInstances.values()) {
        observer.disconnect();
      }
      this.shadowObserverInstances.clear();
      super.stop();
    }
  }
  window.VSC.VideoMutationObserver = UserscriptMutationObserver;
})();
