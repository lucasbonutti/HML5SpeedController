import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = path.join(root, "HML5SpeedController.user.js");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const code = fs.readFileSync(artifactPath, "utf8");

new vm.Script(code, { filename: artifactPath });

const requiredMetadata = [
  "// ==UserScript==",
  "// @name         HML5SpeedController",
  `// @version      ${packageJson.version}`,
  "// @match        http://*/*",
  "// @match        https://*/*",
  "// @match        file:///*",
  "// @grant        GM_getValue",
  "// @grant        GM_setValue",
  "// @grant        GM_addValueChangeListener",
  "// @grant        GM_registerMenuCommand",
  "// @run-at       document-start",
  "// @grant        unsafeWindow",
  "// ==/UserScript==",
];
for (const line of requiredMetadata) {
  assert.ok(code.includes(line), `Missing metadata: ${line}`);
}
assert.ok(
  code.includes(`const VSC_USER_SCRIPT_VERSION = '${packageJson.version}';`),
  "Runtime version must be injected from package.json",
);

assert.doesNotMatch(
  code,
  /^\s*(?:import|export)\s/m,
  "Artifact must be standalone",
);
const executableCode = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
assert.doesNotMatch(
  executableCode,
  /chrome\.storage|chrome\.tabs|chrome\.action/,
  "Browser-only extension APIs remain",
);
assert.doesNotMatch(
  code,
  /@require\b/,
  "GreasyFork artifact must not depend on remote code",
);
assert.equal(
  (executableCode.match(/GM_registerMenuCommand\s*\(/g) || []).length,
  1,
  "The manager menu must contain exactly one registered command",
);

const moduleMarkers = [
  "src/utils/key-maps.js",
  "src/styles/controller-css-defaults.js",
  "src/utils/constants.js",
  "src/core/settings.js",
  "src/core/state-manager.js",
  "src/observers/media-observer.js",
  "src/observers/mutation-observer.js",
  "src/core/action-handler.js",
  "src/core/video-controller.js",
  "src/ui/controls.js",
  "src/ui/drag-handler.js",
  "src/ui/shadow-dom.js",
  "src/site-handlers/netflix-handler.js",
  "src/site-handlers/youtube-handler.js",
  "src/site-handlers/facebook-handler.js",
  "src/site-handlers/amazon-handler.js",
  "src/site-handlers/apple-handler.js",
  "src/site-handlers/dailymotion-handler.js",
  "userscript storage adapter",
  "userscript controls and settings",
  "Netflix page API userscript bridge",
  "userscript runtime compatibility fixes",
];
for (const marker of moduleMarkers) {
  assert.ok(
    code.includes(`===== ${marker} =====`),
    `Missing bundled section: ${marker}`,
  );
}

const behaviorEvidence = [
  'case "rewind"',
  'case "advance"',
  'case "faster"',
  'case "slower"',
  'case "reset"',
  'case "display"',
  'case "fast"',
  'case "pause"',
  'case "muted"',
  'case "louder"',
  'case "softer"',
  'case "mark"',
  'case "jump"',
  "EventManager.MAX_FIGHT_COUNT = 5",
  "EventManager.USER_GESTURE_WINDOW_MS = 300",
  "MIN: 0.07",
  "MAX: 16",
  "GM_addValueChangeListener",
  "openUserscriptSettings",
  "HML5SpeedController: Toggle UI",
  "HML5SpeedController-settings.json",
  "Add Site Rule",
  "Custom controller CSS",
  "hml5speed-seek",
  "pageWindow.netflix.appContext.state.playerApp",
];
for (const evidence of behaviorEvidence) {
  assert.ok(code.includes(evidence), `Missing behavior evidence: ${evidence}`);
}

const staleMarkers = [
  "H" + "TLM",
  "igr" + "igorik",
  "Userscript" + " Port",
  "video-speed" + "-controller.user.js",
  "H" + "TLM5SpeedController.user.js",
  "VideoSpeed" + "Extension",
  "VSC_" + "controller",
];
const ignoredDirs = new Set(["node_modules", ".git"]);
function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}
for (const file of sourceFiles(root)) {
  const relativePath = path.relative(root, file);
  const contents = fs.readFileSync(file, "utf8");
  for (const marker of staleMarkers) {
    assert.ok(
      !contents.includes(marker),
      `Stale marker "${marker}" found in ${relativePath}`,
    );
  }
}

console.log(
  `Validated ${path.basename(artifactPath)} (${Math.round(code.length / 1024)} KiB)`,
);
