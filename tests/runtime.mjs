import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromProject = createRequire(path.join(root, "package.json"));
const puppeteer = requireFromProject("puppeteer");
const userscript = fs.readFileSync(
  path.join(root, "HML5SpeedController.user.js"),
  "utf8",
);

function installGmMocks(initial = {}) {
  const store = new Map(Object.entries(initial));
  const valueListeners = new Map();
  const menuCommands = [];
  window.__gmStore = store;
  window.__gmMenuCommands = menuCommands;
  window.GM_getValue = (key, fallback) =>
    store.has(key) ? structuredClone(store.get(key)) : fallback;
  window.GM_setValue = (key, value) => {
    const oldValue = store.get(key);
    store.set(key, structuredClone(value));
    for (const callback of valueListeners.get(key) || []) {
      callback(key, oldValue, value, false);
    }
  };
  window.GM_deleteValue = (key) => store.delete(key);
  window.GM_listValues = () => [...store.keys()];
  window.GM_addValueChangeListener = (key, callback) => {
    if (!valueListeners.has(key)) valueListeners.set(key, []);
    valueListeners.get(key).push(callback);
    return valueListeners.get(key).length;
  };
  window.GM_registerMenuCommand = (name, callback) => {
    menuCommands.push({ name, callback });
    return menuCommands.length;
  };
  window.GM_addStyle = (css) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
    return style;
  };
}

async function preparePage(
  browser,
  initialStore = {},
  body = '<main id="player"><video id="video" controls style="width:640px;height:360px"></video></main>',
) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setContent(
    `<!doctype html><html><head></head><body>${body}</body></html>`,
  );
  await page.evaluate(installGmMocks, initialStore);
  await page.evaluate(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      configurable: true,
      get() {
        return 4;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() {
        return 300;
      },
    });
  });
  await page.addScriptTag({ content: userscript });
  return { page, errors };
}

const systemChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  headless: true,
  executablePath: fs.existsSync(systemChrome) ? systemChrome : undefined,
  args: ["--no-sandbox"],
});
try {
  const dormant = await preparePage(
    browser,
    {},
    '<main id="content"><h1>No media here</h1></main>',
  );
  await dormant.page.waitForFunction(
    () =>
      window.HML5_controller?.config?._loaded &&
      window.VSC.mediaDetectionInitialized,
    { timeout: 5000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 1300));
  let dormantState = await dormant.page.evaluate(() => ({
    active: window.HML5_controller.initialized,
    hasActionHandler: Boolean(window.HML5_controller.actionHandler),
    hasEventManager: Boolean(window.HML5_controller.eventManager),
    controllers: document.querySelectorAll("vsc-controller").length,
    menuCount: window.__gmMenuCommands.length,
  }));
  assert.equal(
    dormantState.active,
    false,
    "Page without media should not activate the controller runtime",
  );
  assert.equal(
    dormantState.hasActionHandler,
    false,
    "Page without media should not create action handlers",
  );
  assert.equal(
    dormantState.hasEventManager,
    false,
    "Page without media should not install keyboard listeners",
  );
  assert.equal(
    dormantState.controllers,
    0,
    "Page without media should not receive controllers",
  );
  assert.equal(
    dormantState.menuCount,
    1,
    "Settings menu should remain available while media detection is dormant",
  );
  await dormant.page.evaluate(() => {
    const video = document.createElement("video");
    video.id = "late-video";
    video.controls = true;
    video.style.cssText = "width:320px;height:180px";
    document.body.appendChild(video);
  });
  await dormant.page.waitForFunction(
    () =>
      window.HML5_controller.initialized &&
      document.querySelector("#late-video")?.vsc?.div,
    { timeout: 8000 },
  );
  dormantState = await dormant.page.evaluate(() => ({
    active: window.HML5_controller.initialized,
    controllers: document.querySelectorAll("vsc-controller").length,
  }));
  assert.equal(
    dormantState.active,
    true,
    "Dynamically inserted media should activate the runtime",
  );
  assert.equal(
    dormantState.controllers,
    1,
    "Dynamically inserted media should receive a controller",
  );
  assert.deepEqual(
    dormant.errors,
    [],
    `Unexpected dormant-page errors:\n${dormant.errors.join("\n")}`,
  );
  await dormant.page.close();

  const { page, errors } = await preparePage(browser);
  await page.waitForFunction(
    () =>
      window.HML5_controller?.initialized &&
      document.querySelector("#video")?.vsc?.div,
    { timeout: 8000 },
  );

  let state = await page.evaluate(() => {
    const video = document.querySelector("#video");
    return {
      controllerCount: document.querySelectorAll("vsc-controller").length,
      speed: video.playbackRate,
      indicator: video.vsc.speedIndicator.textContent,
      menuCount: window.__gmMenuCommands.length,
      menuName: window.__gmMenuCommands[0]?.name,
      hasSettingsEntry: typeof window.VSC.openUserscriptSettings === "function",
    };
  });
  assert.equal(
    state.controllerCount,
    1,
    "Initial video should receive one controller",
  );
  assert.equal(state.speed, 1, "Initial speed should be 1x");
  assert.equal(state.indicator, "1.00", "Indicator should show two decimals");
  assert.equal(
    state.menuCount,
    1,
    "Exactly one userscript manager command should be registered",
  );
  assert.equal(
    state.menuName,
    "HML5SpeedController: Toggle UI",
    "The single manager command should clearly describe its toggle behavior",
  );
  assert.equal(state.hasSettingsEntry, true, "Settings API should be exposed");

  await page.evaluate(() => window.__gmMenuCommands[0].callback());
  await page.waitForFunction(() =>
    Boolean(document.querySelector("vsc-userscript-panel")),
  );
  await page.evaluate(() => window.__gmMenuCommands[0].callback());
  await page.waitForFunction(
    () => !document.querySelector("vsc-userscript-panel"),
  );

  await page.evaluate(() => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "KeyD",
        key: "d",
        keyCode: 68,
      }),
    );
  });
  await page.waitForFunction(
    () => document.querySelector("#video").playbackRate === 1.1,
  );

  await page.evaluate(() => {
    window.VSC.sendUserscriptCommand({
      type: "VSC_SET_SPEED",
      payload: { speed: 2 },
    });
  });
  await page.waitForFunction(
    () => document.querySelector("#video").playbackRate === 2,
  );

  await page.evaluate(() => {
    window.VSC.sendUserscriptCommand({ type: "VSC_TOGGLE_DISPLAY" });
  });
  await page.waitForFunction(() =>
    document.querySelector("#video").vsc.div.classList.contains("vsc-hidden"),
  );
  await page.evaluate(() => {
    window.VSC.sendUserscriptCommand({ type: "VSC_TOGGLE_DISPLAY" });
  });
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#video")
        .vsc.div.classList.contains("vsc-hidden"),
  );

  await page.evaluate(() => {
    const video = document.querySelector("#video");
    video.vsc.div.shadowRoot
      .querySelector('button[data-action="faster"]')
      .click();
  });
  await page.waitForFunction(
    () => document.querySelector("#video").playbackRate === 2.1,
  );

  await page.evaluate(() => window.VSC.openUserscriptSettings());
  await page.waitForSelector("vsc-userscript-panel");
  state = await page.evaluate(() => {
    const shadow = document.querySelector("vsc-userscript-panel").shadowRoot;
    return {
      controlsVisible: !shadow.querySelector('[data-panel="controls"]').hidden,
      shortcutRows: shadow.querySelectorAll(".shortcut-row").length,
      siteRuleRows: shadow.querySelectorAll(".site-rule-row").length,
    };
  });
  assert.equal(
    state.controlsVisible,
    true,
    "Control tab should open by default",
  );
  assert.equal(
    state.shortcutRows,
    9,
    "All nine predefined shortcuts should render",
  );
  assert.equal(state.siteRuleRows, 4, "Default site rules should render");

  await page.evaluate(() => {
    document
      .querySelector("vsc-userscript-panel")
      .shadowRoot.querySelector(".enabled-toggle")
      .click();
  });
  await page.waitForFunction(
    () => document.querySelectorAll("vsc-controller").length === 0,
  );
  await page.evaluate(() => {
    document
      .querySelector("vsc-userscript-panel")
      .shadowRoot.querySelector(".enabled-toggle")
      .click();
  });
  await page.waitForFunction(() => document.querySelector("#video")?.vsc?.div, {
    timeout: 8000,
  });

  await page.evaluate(() => {
    const shadow = document.querySelector("vsc-userscript-panel").shadowRoot;
    shadow.querySelector('nav button[data-tab="settings"]').click();
    shadow.querySelector('[name="rememberSpeed"]').checked = true;
    shadow.querySelector('[name="customCSS"]').value =
      "vsc-controller { outline: 1px solid rgb(1, 2, 3); }";
    shadow.querySelector(".save").click();
  });
  await page.waitForFunction(
    () => window.__gmStore.get("rememberSpeed") === true,
  );
  assert.equal(
    await page.evaluate(
      () => window.HML5_controller.config.settings.rememberSpeed,
    ),
    true,
    "Saved settings should update the active runtime",
  );
  assert.equal(
    await page.evaluate(() => Boolean(window.HML5_controller._customSheet)),
    true,
    "Custom CSS should be adopted live",
  );

  await page.evaluate(() => {
    const audio = document.createElement("audio");
    audio.id = "audio";
    audio.controls = true;
    document.body.appendChild(audio);
    const dynamicVideo = document.createElement("video");
    dynamicVideo.id = "dynamic-video";
    dynamicVideo.controls = true;
    dynamicVideo.style.cssText = "width:320px;height:180px";
    document.body.appendChild(dynamicVideo);
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#audio")?.vsc &&
      document.querySelector("#dynamic-video")?.vsc,
    { timeout: 8000 },
  );
  assert.equal(
    await page.evaluate(
      () => window.VSC.stateManager.getControlledElements().length,
    ),
    3,
    "Dynamic video and audio should be controlled",
  );

  await page.evaluate(() => {
    window.VSC.sendUserscriptCommand({
      type: "VSC_SET_SPEED",
      payload: { speed: 1.75 },
    });
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("video,audio")].every(
      (media) => media.playbackRate === 1.75,
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 1150));
  assert.equal(
    await page.evaluate(() => window.__gmStore.get("lastSpeed")),
    1.75,
    "Remembered speed should persist through userscript storage",
  );
  assert.deepEqual(
    errors,
    [],
    `Unexpected runtime errors:\n${errors.join("\n")}`,
  );
  await page.close();

  const disabled = await preparePage(browser, {
    siteRules: [{ pattern: "about:blank", enabled: false, speed: null }],
  });
  await disabled.page.waitForFunction(
    () => Boolean(window.HML5_controller?.config),
    { timeout: 5000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  const disabledState = await disabled.page.evaluate(() => ({
    aborted: window.HML5_controller.config.settings._abort === true,
    controllers: document.querySelectorAll("vsc-controller").length,
    settingsAvailable: typeof window.VSC.openUserscriptSettings === "function",
  }));
  assert.equal(
    disabledState.aborted,
    true,
    "Matching disabled site rule should abort runtime",
  );
  assert.equal(
    disabledState.controllers,
    0,
    "Disabled page should not receive controllers",
  );
  assert.equal(
    disabledState.settingsAvailable,
    true,
    "Settings must remain reachable when disabled",
  );
  assert.deepEqual(
    disabled.errors,
    [],
    `Unexpected disabled-page errors:\n${disabled.errors.join("\n")}`,
  );
  await disabled.page.close();

  const legacy = await preparePage(browser, {
    schemaVersion: 1,
    keyBindings: [{ action: "slower", key: 83, value: 0.2, predefined: true }],
  });
  await legacy.page.waitForFunction(
    () => Boolean(window.HML5_controller?.config?._loaded),
    {
      timeout: 5000,
    },
  );
  const migratedState = await legacy.page.evaluate(() => ({
    schemaVersion: window.__gmStore.get("schemaVersion"),
    bindings: window.__gmStore.get("keyBindings"),
  }));
  assert.equal(
    migratedState.schemaVersion,
    2,
    "Legacy shortcut schema should migrate",
  );
  assert.equal(
    migratedState.bindings.length,
    9,
    "Migration should restore missing predefined actions",
  );
  assert.equal(
    migratedState.bindings[0].code,
    "KeyS",
    "Legacy S binding should migrate to event.code",
  );
  assert.deepEqual(
    legacy.errors,
    [],
    `Unexpected migration-page errors:\n${legacy.errors.join("\n")}`,
  );
  await legacy.page.close();

  console.log(
    "Runtime smoke test passed (controller, actions, settings, storage, dynamic media, site rules, migration)",
  );
} finally {
  await browser.close();
}
