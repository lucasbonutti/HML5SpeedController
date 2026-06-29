# HML5SpeedController

This directory contains a standalone Tampermonkey/Violentmonkey userscript for
controlling HTML5 audio/video speed. The generated artifact has no remote
dependencies and is suitable for publishing on GreasyFork.

## Install locally

1. Install Tampermonkey or Violentmonkey.
2. Open `HML5SpeedController.user.js` in the browser and confirm installation.
3. Reload an existing media page.

The on-video controller and default keyboard shortcuts work across common HTML5
media pages. Open the userscript manager menu and choose
**HML5SpeedController: Toggle UI**
to show or hide the controls/settings panel. The panel contains playback
controls, preferences, shortcut recording, site rules, custom CSS,
import/export, and reset.

## Build, format, and validate

```sh
npm run build
npm run format:check
npm test
```

`build.mjs` combines the userscript metadata with the local runtime bundle and
injects the version from `package.json`. The committed
`HML5SpeedController.user.js` is intentionally kept in the repository because it
is the file to install locally or upload to GreasyFork.

Use `npm run format` before committing broad source or documentation edits.

## Release checklist

- Bump the version in `package.json`.
- Run `npm test`.
- Smoke-test the generated artifact in current Tampermonkey and Violentmonkey.
- Upload `HML5SpeedController.user.js` to GreasyFork.
