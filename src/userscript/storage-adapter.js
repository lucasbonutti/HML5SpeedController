/**
 * Userscript replacement for chrome.storage.sync and the MV3 isolated-world
 * bridge. Settings are stored as individual values so concurrent tabs do not
 * overwrite unrelated preferences.
 */
window.VSC = window.VSC || {};

(function installUserscriptStorage() {
  const Constants = window.VSC.Constants;
  const PREFIX = "vsc:";
  const listeners = new Set();
  const watchedKeys = new Set();
  let suppressLifecycle = false;

  const knownKeys = new Set([
    ...Object.keys(window.VSC.Constants.DEFAULT_SETTINGS),
    "controllerCSS",
  ]);

  function fallbackGet(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function gmGet(key, fallback) {
    try {
      return typeof GM_getValue === "function"
        ? GM_getValue(key, fallback)
        : fallbackGet(key, fallback);
    } catch {
      return fallbackGet(key, fallback);
    }
  }

  async function gmSet(key, value) {
    if (typeof GM_setValue === "function") {
      await Promise.resolve(GM_setValue(key, value));
      return;
    }
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  async function gmDelete(key) {
    if (typeof GM_deleteValue === "function") {
      await Promise.resolve(GM_deleteValue(key));
      return;
    }
    localStorage.removeItem(PREFIX + key);
  }

  function gmKeys() {
    try {
      if (typeof GM_listValues === "function") {
        return GM_listValues();
      }
    } catch {
      // Fall through to the localStorage development fallback.
    }
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) {
        keys.push(key.slice(PREFIX.length));
      }
    }
    return keys;
  }

  function dispatchChanges(changes) {
    if (!changes || Object.keys(changes).length === 0) {
      return;
    }

    for (const callback of listeners) {
      try {
        callback(changes);
      } catch (error) {
        console.error("[VSC] Storage change listener failed:", error);
      }
    }

    document.documentElement?.dispatchEvent(
      new CustomEvent("VSC_STORAGE_CHANGED", { detail: changes }),
    );

    if (!suppressLifecycle && changes.enabled) {
      const wasEnabled = changes.enabled.oldValue !== false;
      const isEnabled = changes.enabled.newValue !== false;
      if (wasEnabled && !isEnabled) {
        document.documentElement?.dispatchEvent(
          new CustomEvent("VSC_MESSAGE", {
            detail: { type: "VSC_TEARDOWN" },
          }),
        );
      } else if (!wasEnabled && isEnabled) {
        if (window.VSC.videoSpeedConfig?.settings) {
          window.VSC.videoSpeedConfig.settings._abort = false;
        }
        document.documentElement?.dispatchEvent(
          new CustomEvent("VSC_MESSAGE", { detail: { type: "VSC_REINIT" } }),
        );
      }
    }
  }

  function watchKey(key) {
    if (
      watchedKeys.has(key) ||
      typeof GM_addValueChangeListener !== "function"
    ) {
      return;
    }
    watchedKeys.add(key);
    try {
      GM_addValueChangeListener(key, (_name, oldValue, newValue, remote) => {
        // Local writes are emitted explicitly after persistence so this callback
        // is only needed for other tabs/frames.
        if (remote === false) {
          return;
        }
        dispatchChanges({ [key]: { oldValue, newValue } });
      });
    } catch (error) {
      console.warn(`[VSC] Could not watch setting "${key}":`, error);
    }
  }

  function readRaw(defaults = {}) {
    const result = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      result[key] = gmGet(key, fallback);
    }
    return result;
  }

  async function migrateKeyBindings(settings) {
    const bindings = settings.keyBindings;
    if (!Array.isArray(bindings) || bindings.length === 0) {
      return settings;
    }
    const requiresMigration = bindings.some(
      (binding) => binding.code === undefined,
    );
    if (!requiresMigration) {
      return settings.schemaVersion === 2
        ? settings
        : { ...settings, schemaVersion: 2 };
    }

    const migrated = bindings.map((binding) => {
      if (binding.code !== undefined) {
        return binding;
      }
      const legacyKey = binding.keyCode ?? binding.key;
      if (binding.predefined && Constants.PREDEFINED_CODE_MAP[legacyKey]) {
        const mapped = Constants.PREDEFINED_CODE_MAP[legacyKey];
        return {
          ...binding,
          code: mapped.code,
          keyCode: legacyKey,
          displayKey: mapped.displayKey,
        };
      }
      const code = Constants.KEYCODE_TO_CODE[legacyKey];
      return {
        ...binding,
        code: code || null,
        keyCode: legacyKey,
        displayKey: code ? Constants.displayKeyFromCode(code) : "",
      };
    });

    const existing = new Set(migrated.map((binding) => binding.action));
    for (const action of Constants.PREDEFINED_ACTIONS) {
      if (existing.has(action)) continue;
      const fallback = Constants.DEFAULT_SETTINGS.keyBindings.find(
        (binding) => binding.action === action,
      );
      migrated.push({
        ...fallback,
        modifiers: fallback.modifiers ? { ...fallback.modifiers } : undefined,
      });
    }

    const result = { ...settings, keyBindings: migrated, schemaVersion: 2 };
    // Persist only when bindings already existed in userscript storage. Fresh
    // installs continue to rely on defaults until the user changes a setting.
    if (gmGet("keyBindings", undefined) !== undefined) {
      await gmSet("keyBindings", migrated);
      await gmSet("schemaVersion", 2);
    }
    return result;
  }

  function shouldAbort(settings) {
    if (settings.enabled === false) {
      return true;
    }
    const legacyBlocked =
      !settings.siteRules &&
      isBlacklisted(settings.blacklist, window.location.href);
    const rule = matchSiteRule(settings.siteRules, window.location.href);
    return legacyBlocked || rule?.enabled === false;
  }

  class UserscriptStorageManager {
    static errorCallback = null;

    static onError(callback) {
      this.errorCallback = callback;
    }

    static async get(defaults = {}) {
      const settings = await migrateKeyBindings(readRaw(defaults));
      return shouldAbort(settings) ? null : settings;
    }

    static async getRaw(defaults = {}) {
      return migrateKeyBindings(readRaw(defaults));
    }

    static async set(data) {
      const changes = {};
      try {
        for (const [key, value] of Object.entries(data)) {
          knownKeys.add(key);
          watchKey(key);
          const oldValue = gmGet(key, undefined);
          await gmSet(key, value);
          if (!Object.is(oldValue, value)) {
            changes[key] = { oldValue, newValue: value };
          }
        }
      } catch (error) {
        this.errorCallback?.(error, data);
        throw error;
      }
      dispatchChanges(changes);
    }

    static async remove(keys) {
      const changes = {};
      try {
        for (const key of keys) {
          const oldValue = gmGet(key, undefined);
          await gmDelete(key);
          if (oldValue !== undefined) {
            changes[key] = { oldValue, newValue: undefined };
          }
        }
      } catch (error) {
        this.errorCallback?.(error, { removedKeys: keys });
        throw error;
      }
      dispatchChanges(changes);
    }

    static async clear() {
      const keys = [...new Set([...knownKeys, ...gmKeys()])];
      suppressLifecycle = true;
      try {
        await this.remove(keys);
      } finally {
        suppressLifecycle = false;
      }
    }

    static onChanged(callback) {
      listeners.add(callback);
      for (const key of knownKeys) {
        watchKey(key);
      }
      return () => listeners.delete(callback);
    }
  }

  window.VSC.StorageManager = UserscriptStorageManager;
  window.VSC.UserscriptStorage = {
    getRaw: (defaults = window.VSC.Constants.DEFAULT_SETTINGS) =>
      UserscriptStorageManager.getRaw(defaults),
    set: (data) => UserscriptStorageManager.set(data),
    clear: () => UserscriptStorageManager.clear(),
    shouldAbort,
  };

  if (typeof GM_addStyle === "function") {
    GM_addStyle(VSC_BASE_CSS);
  } else {
    const style = document.createElement("style");
    style.dataset.vscUserscriptBase = "";
    style.textContent = VSC_BASE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }
})();
