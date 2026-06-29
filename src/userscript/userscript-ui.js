/** Userscript-native controls and settings panel. */
(function installUserscriptUI() {
  const Constants = window.VSC.Constants;
  const Storage = window.VSC.StorageManager;
  const ACTIONS = [
    ["slower", "Decrease speed"],
    ["faster", "Increase speed"],
    ["rewind", "Rewind"],
    ["advance", "Advance"],
    ["reset", "Reset speed"],
    ["fast", "Preferred speed"],
    ["muted", "Mute"],
    ["softer", "Decrease volume"],
    ["louder", "Increase volume"],
    ["pause", "Pause"],
    ["mark", "Set marker"],
    ["jump", "Jump to marker"],
    ["display", "Show/hide controller"],
  ];
  const NO_VALUE_ACTIONS = new Set(Constants.CUSTOM_ACTIONS_NO_VALUES);
  const COMMAND_MARKER = "__vscUserscriptCommand";
  let panelHost = null;

  function isTopFrame() {
    try {
      return window.top === window.self;
    } catch {
      return false;
    }
  }

  function dispatchCommand(message) {
    document.documentElement?.dispatchEvent(
      new CustomEvent("VSC_MESSAGE", { detail: message }),
    );
  }

  function relayToChildren(message) {
    for (let i = 0; i < window.frames.length; i++) {
      try {
        window.frames[i].postMessage({ [COMMAND_MARKER]: true, message }, "*");
      } catch {
        // A detached or browser-internal frame can reject postMessage.
      }
    }
  }

  function sendCommand(message) {
    dispatchCommand(message);
    relayToChildren(message);
  }

  window.addEventListener("message", (event) => {
    if (
      !event.data ||
      event.data[COMMAND_MARKER] !== true ||
      !event.data.message
    ) {
      return;
    }
    dispatchCommand(event.data.message);
    relayToChildren(event.data.message);
  });

  function registerMenus() {
    if (!isTopFrame() || typeof GM_registerMenuCommand !== "function") {
      return;
    }
    GM_registerMenuCommand("HML5SpeedController: Toggle UI", togglePanel);
  }

  function actionOptions(selected) {
    return ACTIONS.map(
      ([value, label]) =>
        `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`,
    ).join("");
  }

  function displayKey(binding) {
    if (!binding?.code) {
      return "Unbound";
    }
    const modifiers = binding.modifiers || {};
    const parts = [];
    if (modifiers.ctrl) parts.push("Ctrl");
    if (modifiers.alt) parts.push("Alt");
    if (modifiers.shift) parts.push("Shift");
    if (modifiers.meta) parts.push("Meta");
    const raw =
      binding.displayKey ||
      Constants.displayKeyFromCode(binding.code) ||
      binding.code;
    parts.push(raw.length === 1 ? raw.toUpperCase() : raw);
    return parts.join(" + ");
  }

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function shortcutRow(
    binding = { action: "faster", value: 0.1, predefined: false },
  ) {
    const row = document.createElement("div");
    row.className = "shortcut-row";
    row.dataset.predefined = binding.predefined ? "true" : "false";
    row.innerHTML = `
    <select class="shortcut-action" ${binding.predefined ? "disabled" : ""}>
      ${actionOptions(binding.action)}
    </select>
    <button type="button" class="key-recorder" title="Click, then press a shortcut">${escapeHTML(displayKey(binding))}</button>
    <input class="shortcut-value" type="number" min="0" step="0.01" value="${Number(binding.value) || 0}">
    ${binding.predefined ? "<span></span>" : '<button type="button" class="remove-row" title="Remove">×</button>'}
  `;
    row._binding = {
      ...binding,
      modifiers: binding.modifiers ? { ...binding.modifiers } : undefined,
    };
    updateShortcutValueVisibility(row);
    return row;
  }

  function updateShortcutValueVisibility(row) {
    const action = row.querySelector(".shortcut-action").value;
    row.querySelector(".shortcut-value").hidden = NO_VALUE_ACTIONS.has(action);
  }

  function siteRuleRow(rule = { pattern: "", enabled: true, speed: null }) {
    const row = document.createElement("div");
    row.className = "site-rule-row";
    row.innerHTML = `
    <input class="rule-pattern" type="text" placeholder="youtube.com or /regex/i" value="${escapeHTML(rule.pattern || "")}">
    <label class="check compact"><input class="rule-disabled" type="checkbox" ${rule.enabled === false ? "checked" : ""}> Disable</label>
    <input class="rule-speed" type="number" min="0.07" max="16" step="0.01" placeholder="Global" value="${rule.speed ?? ""}">
    <button type="button" class="remove-row" title="Remove">×</button>
  `;
    return row;
  }

  const PANEL_CSS = `
  :host { all: initial; color-scheme: light dark; }
  *, *::before, *::after { box-sizing: border-box; }
  .backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgb(0 0 0 / .48); display: grid; place-items: center; padding: 20px; font: 14px/1.45 system-ui, -apple-system, sans-serif; color: #202124; }
  .panel { width: min(900px, 96vw); max-height: 92vh; overflow: hidden; background: #fff; border-radius: 14px; box-shadow: 0 24px 80px rgb(0 0 0 / .35); display: grid; grid-template-rows: auto auto minmax(0,1fr) auto; }
  header { display: flex; align-items: center; gap: 12px; padding: 16px 18px 10px; }
  h2 { font-size: 18px; margin: 0; flex: 1; }
  .version { color: #777; font-size: 12px; }
  button, input, select, textarea { font: inherit; }
  button { cursor: pointer; }
  .icon { border: 0; background: transparent; font-size: 24px; line-height: 1; color: inherit; }
  nav { display: flex; gap: 4px; padding: 0 18px; border-bottom: 1px solid #ddd; }
  nav button { border: 0; border-bottom: 3px solid transparent; background: transparent; padding: 9px 12px; color: #555; }
  nav button.active { color: #1769e0; border-bottom-color: #1769e0; font-weight: 650; }
  main { overflow: auto; padding: 18px; }
  .tab[hidden], [hidden] { display: none !important; }
  section { border: 1px solid #ddd; border-radius: 10px; padding: 14px; margin: 0 0 14px; }
  section h3 { font-size: 15px; margin: 0 0 12px; }
  .control-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .control-grid button, .preset-grid button, .secondary, .primary { border: 1px solid #ccd4df; border-radius: 8px; background: #f7f9fc; color: #202124; padding: 9px 12px; }
  .control-grid button:hover, .preset-grid button:hover, .secondary:hover { background: #e9f1ff; }
  .preset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 10px; }
  .power { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .power button.on { background: #e3f4e8; border-color: #7ac98d; color: #176a2b; }
  .power button.off { background: #fdeaea; border-color: #dc8b8b; color: #9c2020; }
  .preference { display: grid; grid-template-columns: minmax(220px, 1fr) auto; gap: 16px; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee; }
  .preference:last-child { border-bottom: 0; }
  .preference small, .hint { color: #68717d; display: block; }
  .check { display: inline-flex; align-items: center; gap: 6px; }
  .compact { font-size: 12px; white-space: nowrap; }
  .shortcut-row { display: grid; grid-template-columns: minmax(160px,1fr) minmax(130px,auto) 100px 30px; gap: 8px; margin-bottom: 7px; align-items: center; }
  .site-rule-row { display: grid; grid-template-columns: minmax(240px,1fr) 90px 100px 30px; gap: 8px; margin-bottom: 7px; align-items: center; }
  input, select, textarea, .key-recorder { width: 100%; min-height: 34px; border: 1px solid #bbc3ce; border-radius: 6px; background: #fff; color: #202124; padding: 6px 8px; }
  .key-recorder.recording { border-color: #1769e0; box-shadow: 0 0 0 2px rgb(23 105 224 / .15); color: #1769e0; }
  .remove-row { border: 0; background: transparent; color: #b3261e; font-size: 22px; }
  .field { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(180px, 320px); gap: 16px; align-items: start; margin-bottom: 12px; }
  textarea { min-height: 180px; resize: vertical; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  footer { display: flex; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid #ddd; }
  .status { flex: 1; min-height: 20px; color: #176a2b; }
  .status.error { color: #b3261e; }
  .primary { background: #1769e0; border-color: #1769e0; color: white; font-weight: 650; }
  .help code { background: #f0f2f5; border-radius: 4px; padding: 1px 4px; }
  @media (prefers-color-scheme: dark) {
    .backdrop { color: #e7e9ed; }
    .panel { background: #202124; }
    nav, footer, section { border-color: #43464c; }
    nav button { color: #b8bdc7; }
    input, select, textarea, .key-recorder { background: #292b2f; color: #eef0f4; border-color: #5b606a; }
    .control-grid button, .preset-grid button, .secondary { background: #292b2f; color: #eef0f4; border-color: #5b606a; }
    .preference { border-color: #393c42; }
    .help code { background: #34373c; }
  }
  @media (max-width: 650px) {
    .backdrop { padding: 0; }
    .panel { width: 100vw; max-height: 100vh; height: 100vh; border-radius: 0; }
    .shortcut-row { grid-template-columns: 1fr 1fr 76px 28px; }
    .site-rule-row { grid-template-columns: 1fr 82px 76px 28px; }
    .field { grid-template-columns: 1fr; gap: 5px; }
  }
`;

  function panelMarkup() {
    return `
    <style>${PANEL_CSS}</style>
    <div class="backdrop">
      <div class="panel" role="dialog" aria-modal="true" aria-label="HML5SpeedController">
        <header><h2>HML5SpeedController</h2><span class="version">v${VSC_USER_SCRIPT_VERSION}</span><button class="icon close" aria-label="Close">×</button></header>
        <nav>
          <button data-tab="controls" class="active">Controls</button>
          <button data-tab="settings">Settings</button>
          <button data-tab="advanced">Advanced</button>
          <button data-tab="help">Help</button>
        </nav>
        <main>
          <div class="tab" data-panel="controls">
            <section>
              <div class="power"><button type="button" class="secondary enabled-toggle">Enabled</button><span class="enabled-copy"></span></div>
              <div class="control-grid">
                <button type="button" class="slower">−0.1</button>
                <button type="button" class="preferred">1.8</button>
                <button type="button" class="faster">+0.1</button>
              </div>
              <div class="preset-grid">${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5].map((speed) => `<button type="button" data-speed="${speed}">${speed}</button>`).join("")}</div>
            </section>
            <button type="button" class="secondary toggle-display">Show/hide on-video controller</button>
          </div>
          <div class="tab" data-panel="settings" hidden>
            <section><h3>Shortcuts</h3><div class="shortcuts"></div><button type="button" class="secondary add-shortcut">Add New</button></section>
            <section><h3>Preferences</h3>
              <label class="preference"><span>Audio support<small>Show controls on audio elements.</small></span><input name="audioBoolean" type="checkbox"></label>
              <label class="preference"><span>Remember playback speed<small>Persist and apply the latest speed.</small></span><input name="rememberSpeed" type="checkbox"></label>
              <label class="preference"><span>Hide controller by default<small>Use the display shortcut to reveal it.</small></span><input name="startHidden" type="checkbox"></label>
              <label class="preference"><span>Exclusive keyboard shortcuts<small>Prevent websites from handling matched keys.</small></span><input name="exclusiveKeys" type="checkbox"></label>
            </section>
          </div>
          <div class="tab" data-panel="advanced" hidden>
            <section><h3>Appearance and diagnostics</h3>
              <label class="field"><span>Controller opacity<small class="hint">0 through 1</small></span><input name="controllerOpacity" type="number" min="0" max="1" step="0.05"></label>
              <label class="field"><span>Controller button size<small class="hint">Font size in pixels</small></span><input name="controllerButtonSize" type="number" min="6" max="72" step="1"></label>
              <label class="field"><span>Console log level</span><select name="logLevel"><option value="1">None</option><option value="2">Error</option><option value="3">Warning</option><option value="4">Info</option><option value="5">Debug</option><option value="6">Verbose</option></select></label>
            </section>
            <section><h3>Site rules</h3><p class="hint">The first matching domain, substring, or /regular expression/ wins. Disable VSC or set a page-load speed.</p><div class="site-rules"></div><button type="button" class="secondary add-site-rule">Add Site Rule</button></section>
            <section><h3>Custom controller CSS</h3><textarea name="customCSS" spellcheck="false" placeholder="vsc-controller { top: 50px !important; }"></textarea><small class="hint">Injected alongside the built-in site fixes. Maximum 8 KiB.</small></section>
          </div>
          <div class="tab help" data-panel="help" hidden>
            <section><h3>Defaults</h3><p><code>S</code>/<code>D</code> change speed, <code>R</code> resets, <code>G</code> toggles preferred speed, <code>Z</code>/<code>X</code> seek, <code>V</code> toggles the overlay, and <code>M</code>/<code>J</code> mark and jump.</p></section>
            <section><h3>Notes</h3><p>Settings and controls are available from your userscript manager menu. Site rules take effect on reload. Local files require your userscript manager to allow access to file URLs.</p><p>Speed changes made through a site's native UI are accepted when they immediately follow a click or shortcut. Automatic player resets are resisted, with bounded retry backoff.</p></section>
          </div>
        </main>
        <footer><span class="status"></span><button type="button" class="secondary import">Import</button><button type="button" class="secondary export">Export</button><button type="button" class="secondary reset">Reset</button><button type="button" class="primary save">Save</button><input class="import-file" type="file" accept="application/json,.json" hidden></footer>
      </div>
    </div>
  `;
  }

  async function loadPanel(shadow) {
    const settings = await Storage.getRaw(Constants.DEFAULT_SETTINGS);
    shadow._settings = settings;
    shadow.querySelector('[name="audioBoolean"]').checked = Boolean(
      settings.audioBoolean,
    );
    shadow.querySelector('[name="rememberSpeed"]').checked = Boolean(
      settings.rememberSpeed,
    );
    shadow.querySelector('[name="startHidden"]').checked = Boolean(
      settings.startHidden,
    );
    shadow.querySelector('[name="exclusiveKeys"]').checked = Boolean(
      settings.exclusiveKeys,
    );
    shadow.querySelector('[name="controllerOpacity"]').value =
      settings.controllerOpacity;
    shadow.querySelector('[name="controllerButtonSize"]').value =
      settings.controllerButtonSize;
    shadow.querySelector('[name="logLevel"]').value = settings.logLevel;
    shadow.querySelector('[name="customCSS"]').value = settings.customCSS || "";

    const shortcuts = shadow.querySelector(".shortcuts");
    shortcuts.replaceChildren(
      ...(settings.keyBindings || Constants.DEFAULT_SETTINGS.keyBindings).map(
        shortcutRow,
      ),
    );
    const rules = shadow.querySelector(".site-rules");
    rules.replaceChildren(...(settings.siteRules || []).map(siteRuleRow));

    const slower =
      settings.keyBindings?.find((b) => b.action === "slower")?.value ?? 0.1;
    const faster =
      settings.keyBindings?.find((b) => b.action === "faster")?.value ?? 0.1;
    const preferred =
      settings.keyBindings?.find((b) => b.action === "fast")?.value ?? 1.8;
    shadow.querySelector(".slower").textContent = `−${slower}`;
    shadow.querySelector(".slower").dataset.delta = String(-slower);
    shadow.querySelector(".faster").textContent = `+${faster}`;
    shadow.querySelector(".faster").dataset.delta = String(faster);
    shadow.querySelector(".preferred").textContent = String(preferred);
    shadow.querySelector(".preferred").dataset.speed = String(preferred);
    updateEnabledUI(shadow, settings.enabled !== false);
  }

  function updateEnabledUI(shadow, enabled) {
    const button = shadow.querySelector(".enabled-toggle");
    button.textContent = enabled ? "Enabled" : "Disabled";
    button.classList.toggle("on", enabled);
    button.classList.toggle("off", !enabled);
    shadow.querySelector(".enabled-copy").textContent = enabled
      ? "Active on this page unless a site rule disables it."
      : "Controllers and shortcuts are currently disabled.";
  }

  function setStatus(shadow, text, error = false) {
    const status = shadow.querySelector(".status");
    status.textContent = text;
    status.classList.toggle("error", error);
  }

  function validatePattern(pattern) {
    if (!pattern.startsWith("/")) return;
    const parts = pattern.split("/");
    if (parts.length < 3)
      throw new Error(`Invalid site-rule regex: ${pattern}`);
    const last = parts.at(-1);
    const hasFlags = /^[gimsuy]*$/.test(last);
    const flags = hasFlags ? parts.pop() : "";
    const expression = parts.slice(1, hasFlags ? undefined : -1).join("/");
    if (!expression) throw new Error(`Empty site-rule regex: ${pattern}`);
    new RegExp(expression, flags);
  }

  function collectSettings(shadow) {
    const keyBindings = [...shadow.querySelectorAll(".shortcut-row")].map(
      (row) => {
        const binding = row._binding || {};
        const action = row.querySelector(".shortcut-action").value;
        const value = NO_VALUE_ACTIONS.has(action)
          ? 0
          : Number(row.querySelector(".shortcut-value").value);
        if (!Number.isFinite(value))
          throw new Error(`Invalid value for ${action}`);
        return {
          action,
          code: binding.code ?? null,
          key: binding.keyCode ?? binding.key ?? null,
          keyCode: binding.keyCode ?? binding.key ?? null,
          displayKey: binding.displayKey || "",
          value,
          predefined: row.dataset.predefined === "true",
          ...(binding.modifiers ? { modifiers: { ...binding.modifiers } } : {}),
        };
      },
    );

    const siteRules = [...shadow.querySelectorAll(".site-rule-row")]
      .map((row) => {
        const pattern = row.querySelector(".rule-pattern").value.trim();
        const rawSpeed = row.querySelector(".rule-speed").value.trim();
        const speed = rawSpeed === "" ? null : Number(rawSpeed);
        if (!pattern) return null;
        validatePattern(pattern);
        if (
          speed !== null &&
          (!Number.isFinite(speed) || speed < 0.07 || speed > 16)
        ) {
          throw new Error(
            `Speed for "${pattern}" must be between 0.07 and 16.`,
          );
        }
        return {
          pattern,
          enabled: !row.querySelector(".rule-disabled").checked,
          speed,
        };
      })
      .filter(Boolean);

    const opacity = Number(
      shadow.querySelector('[name="controllerOpacity"]').value,
    );
    const buttonSize = Number(
      shadow.querySelector('[name="controllerButtonSize"]').value,
    );
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new Error("Controller opacity must be between 0 and 1.");
    }
    if (!Number.isFinite(buttonSize) || buttonSize < 6 || buttonSize > 72) {
      throw new Error(
        "Controller button size must be between 6 and 72 pixels.",
      );
    }

    const customCSS = shadow.querySelector('[name="customCSS"]').value;
    if (new Blob([customCSS]).size > 8192) {
      throw new Error("Custom CSS exceeds the 8 KiB limit.");
    }
    if (customCSS.trim()) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(customCSS);
    }

    return {
      rememberSpeed: shadow.querySelector('[name="rememberSpeed"]').checked,
      exclusiveKeys: shadow.querySelector('[name="exclusiveKeys"]').checked,
      audioBoolean: shadow.querySelector('[name="audioBoolean"]').checked,
      startHidden: shadow.querySelector('[name="startHidden"]').checked,
      controllerOpacity: opacity,
      controllerButtonSize: buttonSize,
      logLevel: Number(shadow.querySelector('[name="logLevel"]').value),
      keyBindings,
      siteRules,
      customCSS,
      schemaVersion: 2,
    };
  }

  function recordShortcut(event, button, row) {
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape" || event.code === "Backspace") {
      row._binding = {
        ...row._binding,
        code: null,
        key: null,
        keyCode: null,
        displayKey: "",
        modifiers: undefined,
      };
      button.textContent = "Unbound";
      button.classList.remove("recording");
      button.blur();
      return;
    }
    if (
      Constants.BLACKLISTED_CODES.has(event.code) ||
      event.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }
    const modifiers = {
      ctrl: Boolean(event.ctrlKey),
      alt: Boolean(event.altKey),
      shift: Boolean(event.shiftKey),
      meta: Boolean(event.metaKey),
    };
    const hasModifier = Object.values(modifiers).some(Boolean);
    row._binding = {
      ...row._binding,
      code: event.code,
      key: event.keyCode,
      keyCode: event.keyCode,
      displayKey: event.code.startsWith("Numpad")
        ? Constants.displayKeyFromCode(event.code)
        : event.key || Constants.displayKeyFromCode(event.code),
      modifiers: hasModifier ? modifiers : undefined,
    };
    button.textContent = displayKey(row._binding);
    if (event.ctrlKey && event.altKey) {
      setStatus(
        button.getRootNode(),
        "Warning: Ctrl+Alt may conflict with AltGr input.",
      );
    } else if (event.metaKey) {
      setStatus(
        button.getRootNode(),
        "Warning: some Cmd/Meta shortcuts are intercepted by the OS.",
      );
    }
    button.classList.remove("recording");
    button.blur();
  }

  function bindPanel(shadow) {
    shadow.querySelector(".close").addEventListener("click", closePanel);
    shadow.querySelector(".backdrop").addEventListener("click", (event) => {
      if (event.target.classList.contains("backdrop")) closePanel();
    });
    shadow.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !event.target.classList.contains("key-recorder")
      )
        closePanel();
    });

    shadow.querySelectorAll("nav button").forEach((button) => {
      button.addEventListener("click", () => {
        shadow
          .querySelectorAll("nav button")
          .forEach((b) => b.classList.toggle("active", b === button));
        shadow.querySelectorAll(".tab").forEach((panel) => {
          panel.hidden = panel.dataset.panel !== button.dataset.tab;
        });
      });
    });

    shadow.querySelector(".slower").addEventListener("click", (event) =>
      sendCommand({
        type: Constants.MESSAGE_TYPES.ADJUST_SPEED,
        payload: { delta: Number(event.currentTarget.dataset.delta) },
      }),
    );
    shadow.querySelector(".faster").addEventListener("click", (event) =>
      sendCommand({
        type: Constants.MESSAGE_TYPES.ADJUST_SPEED,
        payload: { delta: Number(event.currentTarget.dataset.delta) },
      }),
    );
    shadow.querySelector(".preferred").addEventListener("click", (event) =>
      sendCommand({
        type: Constants.MESSAGE_TYPES.SET_SPEED,
        payload: { speed: Number(event.currentTarget.dataset.speed) },
      }),
    );
    shadow.querySelectorAll(".preset-grid button").forEach((button) =>
      button.addEventListener("click", () =>
        sendCommand({
          type: Constants.MESSAGE_TYPES.SET_SPEED,
          payload: { speed: Number(button.dataset.speed) },
        }),
      ),
    );
    shadow
      .querySelector(".toggle-display")
      .addEventListener("click", () =>
        sendCommand({ type: Constants.MESSAGE_TYPES.TOGGLE_DISPLAY }),
      );
    shadow
      .querySelector(".enabled-toggle")
      .addEventListener("click", async () => {
        const current = await Storage.getRaw({ enabled: true });
        const enabled = current.enabled === false;
        await Storage.set({ enabled });
        shadow._settings.enabled = enabled;
        updateEnabledUI(shadow, enabled);
        setStatus(shadow, enabled ? "Enabled." : "Disabled.");
      });

    shadow
      .querySelector(".add-shortcut")
      .addEventListener("click", () =>
        shadow.querySelector(".shortcuts").appendChild(shortcutRow()),
      );
    shadow
      .querySelector(".add-site-rule")
      .addEventListener("click", () =>
        shadow.querySelector(".site-rules").appendChild(siteRuleRow()),
      );

    shadow.addEventListener("click", (event) => {
      const remove = event.target.closest(".remove-row");
      if (remove) remove.closest(".shortcut-row, .site-rule-row").remove();
      const recorder = event.target.closest(".key-recorder");
      if (recorder) {
        recorder.classList.add("recording");
        recorder.textContent = "Press shortcut…";
        recorder.focus();
      }
    });
    shadow.addEventListener("focusout", (event) => {
      const recorder = event.target.closest(".key-recorder");
      if (recorder?.classList.contains("recording")) {
        recorder.classList.remove("recording");
        recorder.textContent = displayKey(
          recorder.closest(".shortcut-row")._binding,
        );
      }
    });
    shadow.addEventListener("change", (event) => {
      if (event.target.classList.contains("shortcut-action")) {
        updateShortcutValueVisibility(event.target.closest(".shortcut-row"));
      }
    });
    shadow.addEventListener("keydown", (event) => {
      const recorder = event.target.closest(".key-recorder");
      if (recorder?.classList.contains("recording")) {
        recordShortcut(event, recorder, recorder.closest(".shortcut-row"));
      }
    });

    shadow.querySelector(".save").addEventListener("click", async () => {
      try {
        const settings = collectSettings(shadow);
        await Storage.set(settings);
        shadow._settings = { ...shadow._settings, ...settings };
        setStatus(shadow, "Saved. Reload this page for structural changes.");
      } catch (error) {
        setStatus(shadow, error.message || String(error), true);
      }
    });

    shadow.querySelector(".export").addEventListener("click", async () => {
      const settings = await Storage.getRaw(Constants.DEFAULT_SETTINGS);
      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "HML5SpeedController-settings.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(shadow, "Settings exported.");
    });
    shadow
      .querySelector(".import")
      .addEventListener("click", () =>
        shadow.querySelector(".import-file").click(),
      );
    shadow
      .querySelector(".import-file")
      .addEventListener("change", async (event) => {
        try {
          const file = event.target.files?.[0];
          if (!file) return;
          const imported = JSON.parse(await file.text());
          if (
            !imported ||
            typeof imported !== "object" ||
            !Array.isArray(imported.keyBindings)
          ) {
            throw new Error(
              "This is not an HML5SpeedController settings file.",
            );
          }
          await Storage.clear();
          await Storage.set(imported);
          await loadPanel(shadow);
          setStatus(
            shadow,
            "Settings imported. Reload this page to apply all changes.",
          );
        } catch (error) {
          setStatus(shadow, `Import failed: ${error.message}`, true);
        } finally {
          event.target.value = "";
        }
      });
    shadow.querySelector(".reset").addEventListener("click", async () => {
      await Storage.clear();
      await Storage.set({ ...Constants.DEFAULT_SETTINGS, schemaVersion: 2 });
      await loadPanel(shadow);
      setStatus(
        shadow,
        "Defaults restored. Reload this page to apply all changes.",
      );
    });
  }

  async function openPanel() {
    if (!isTopFrame()) return;
    if (panelHost?.isConnected) {
      panelHost.shadowRoot.querySelector(".close").focus();
      return;
    }
    panelHost = document.createElement("vsc-userscript-panel");
    panelHost.style.cssText =
      "position:fixed!important;inset:0!important;z-index:2147483647!important;";
    const shadow = panelHost.attachShadow({ mode: "open" });
    shadow.innerHTML = panelMarkup();
    (document.body || document.documentElement).appendChild(panelHost);
    bindPanel(shadow);
    await loadPanel(shadow);
    shadow.querySelector(".close").focus();
  }

  function closePanel() {
    panelHost?.remove();
    panelHost = null;
  }

  async function togglePanel() {
    if (panelHost?.isConnected) {
      closePanel();
      return;
    }
    await openPanel();
  }

  window.VSC.openUserscriptSettings = openPanel;
  window.VSC.toggleUserscriptUI = togglePanel;
  window.VSC.sendUserscriptCommand = sendCommand;
  registerMenus();
})();
