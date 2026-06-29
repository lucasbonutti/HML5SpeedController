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

function installGmMocks() {
  const store = new Map();
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
    const inject = () => {
      const target = document.head || document.documentElement || document.body;
      if (!target) {
        return null;
      }
      const style = document.createElement("style");
      style.textContent = css;
      target.appendChild(style);
      return style;
    };
    const style = inject();
    if (style) {
      return style;
    }
    document.addEventListener("DOMContentLoaded", inject, { once: true });
    return null;
  };
}

const systemChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  headless: true,
  executablePath: fs.existsSync(systemChrome) ? systemChrome : undefined,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => {
    const message = error.stack || error.message;
    if (/HML5|VSC|GM_|userscript|vsc-controller/i.test(message)) {
      pageErrors.push(message);
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/HML5|VSC|GM_|userscript|vsc-controller/i.test(text)) {
      consoleErrors.push(text);
    }
  });

  await page.evaluateOnNewDocument(installGmMocks);
  await page.evaluateOnNewDocument(userscript);
  await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForSelector("video", { timeout: 20000 });
  await page.waitForFunction(
    () =>
      Boolean(window.HML5_controller?.initialized) &&
      Boolean(document.querySelector("video")?.vsc?.div),
    { timeout: 30000 },
  );

  await page.evaluate(() => {
    window.VSC.sendUserscriptCommand({
      type: "VSC_SET_SPEED",
      payload: { speed: 1.5 },
    });
  });
  await page.waitForFunction(
    () => Math.abs(document.querySelector("video").playbackRate - 1.5) < 0.001,
    { timeout: 10000 },
  );

  const state = await page.evaluate(() => {
    const video = document.querySelector("video");
    return {
      title: document.title,
      speed: video?.playbackRate,
      hasController: Boolean(video?.vsc?.div),
      initialized: Boolean(window.HML5_controller?.initialized),
      menuName: window.__gmMenuCommands?.[0]?.name,
      controlledElements:
        window.VSC?.stateManager?.getControlledElements?.().length,
    };
  });

  assert.equal(state.initialized, true, "Userscript should initialize");
  assert.equal(
    state.hasController,
    true,
    "YouTube video should receive controller",
  );
  assert.equal(state.speed, 1.5, "VSC_SET_SPEED should control YouTube video");
  assert.equal(
    state.menuName,
    "HML5SpeedController: Toggle UI",
    "Userscript menu command should be registered",
  );
  assert.ok(
    state.controlledElements >= 1,
    "YouTube video should be tracked by the state manager",
  );
  assert.deepEqual(
    [...pageErrors, ...consoleErrors],
    [],
    "Unexpected userscript errors:\n" +
      [...pageErrors, ...consoleErrors].join("\n"),
  );

  console.log(
    "YouTube live smoke passed (" +
      state.title +
      ", speed " +
      state.speed +
      "x)",
  );
} finally {
  await browser.close();
}
