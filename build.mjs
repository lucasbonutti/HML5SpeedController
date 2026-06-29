import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "src");
const output = path.join(here, "HML5SpeedController.user.js");
const packageJson = JSON.parse(
  await fs.readFile(path.join(here, "package.json"), "utf8"),
);
const version = packageJson.version;

const moduleEntries = [
  {
    marker: "src/utils/key-maps.js",
    file: "src/utils/key-maps.js",
  },
  {
    marker: "src/styles/controller-css-defaults.js",
    file: "src/styles/controller-css-defaults.js",
  },
  {
    marker: "src/utils/constants.js",
    file: "src/utils/constants.js",
  },
  {
    marker: "src/utils/logger.js",
    file: "src/utils/logger.js",
  },
  {
    marker: "src/utils/debug-helper.js",
    file: "src/utils/debug-helper.js",
  },
  {
    marker: "src/utils/dom-utils.js",
    file: "src/utils/dom-utils.js",
  },
  {
    marker: "src/utils/event-manager.js",
    file: "src/utils/event-manager.js",
  },
  {
    marker: "src/utils/site-pattern.js",
    file: "src/utils/site-pattern.js",
  },
  {
    marker: "userscript storage adapter",
    file: "src/userscript/storage-adapter.js",
  },
  {
    marker: "src/core/settings.js",
    file: "src/core/settings.js",
  },
  {
    marker: "src/core/state-manager.js",
    file: "src/core/state-manager.js",
  },
  {
    marker: "src/observers/media-observer.js",
    file: "src/observers/media-observer.js",
  },
  {
    marker: "src/observers/mutation-observer.js",
    file: "src/observers/mutation-observer.js",
  },
  {
    marker: "src/core/action-handler.js",
    file: "src/core/action-handler.js",
  },
  {
    marker: "src/core/video-controller.js",
    file: "src/core/video-controller.js",
  },
  {
    marker: "src/ui/controls.js",
    file: "src/ui/controls.js",
  },
  {
    marker: "src/ui/drag-handler.js",
    file: "src/ui/drag-handler.js",
  },
  {
    marker: "src/ui/shadow-dom.js",
    file: "src/ui/shadow-dom.js",
  },
  {
    marker: "src/ui/vsc-controller-element.js",
    file: "src/ui/vsc-controller-element.js",
  },
  {
    marker: "src/site-handlers/base-handler.js",
    file: "src/site-handlers/base-handler.js",
  },
  {
    marker: "src/site-handlers/netflix-handler.js",
    file: "src/site-handlers/netflix-handler.js",
  },
  {
    marker: "src/site-handlers/youtube-handler.js",
    file: "src/site-handlers/youtube-handler.js",
  },
  {
    marker: "src/site-handlers/facebook-handler.js",
    file: "src/site-handlers/facebook-handler.js",
  },
  {
    marker: "src/site-handlers/amazon-handler.js",
    file: "src/site-handlers/amazon-handler.js",
  },
  {
    marker: "src/site-handlers/apple-handler.js",
    file: "src/site-handlers/apple-handler.js",
  },
  {
    marker: "src/site-handlers/dailymotion-handler.js",
    file: "src/site-handlers/dailymotion-handler.js",
  },
  {
    marker: "src/site-handlers/index.js",
    file: "src/site-handlers/index.js",
  },
  {
    marker: "Netflix page API userscript bridge",
    file: "src/userscript/netflix-page-api.js",
  },
  {
    marker: "userscript runtime compatibility fixes",
    file: "src/userscript/runtime-fixes.js",
  },
  {
    marker: "userscript runtime entry",
    file: "src/userscript/runtime-entry.js",
  },
  {
    marker: "userscript controls and settings",
    file: "src/userscript/userscript-ui.js",
  },
];

function indentSource(source) {
  return source
    .trimEnd()
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");
}

const header = (
  await fs.readFile(path.join(src, "userscript-header.txt"), "utf8")
)
  .replaceAll("__VERSION__", version)
  .trimEnd();
const prelude = (
  await fs.readFile(path.join(src, "userscript/prelude.js"), "utf8")
).replace(
  /const VSC_USER_SCRIPT_VERSION = ['"][^'"]+['"];/,
  `const VSC_USER_SCRIPT_VERSION = '${version}';`,
);

const bodySections = [indentSource(prelude)];
for (const entry of moduleEntries) {
  const source = await fs.readFile(path.join(here, entry.file), "utf8");
  bodySections.push(
    `  /* ===== ${entry.marker} ===== */\n${indentSource(source)}`,
  );
}

const runtime = [
  "(function hml5SpeedControllerUserscript() {",
  ...bodySections,
  "})();",
].join("\n\n");

await fs.writeFile(output, [header, runtime].join("\n"), "utf8");
const stat = await fs.stat(output);
console.log(
  `Built ${path.relative(process.cwd(), output)} (${Math.round(stat.size / 1024)} KiB)`,
);
