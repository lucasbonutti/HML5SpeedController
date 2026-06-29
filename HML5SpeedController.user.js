// ==UserScript==
// @name         HML5SpeedController
// @namespace    https://hml5-speed-controller.local
// @version      1.0.1
// @description  Speed up, slow down, advance and rewind HTML5 audio/video with shortcuts and an on-video controller.
// @author       lbs197
// @homepageURL  https://github.com/lucasbonutti/HML5SpeedController
// @supportURL   https://github.com/lucasbonutti/HML5SpeedController/issues
// @match        http://*/*
// @match        https://*/*
// @match        file:///*
// @exclude      https://hangouts.google.com/*
// @exclude      https://meet.google.com/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==
(function hml5SpeedControllerUserscript() {

  "use strict";
  const VSC_USER_SCRIPT_VERSION = '1.0.1';
  const VSC_BASE_CSS =
    '/*\n * inject.css — Loaded via userscript startup CSS (before any JS runs).\n *\n * Base vsc-controller rules live here for timing safety: userscript CSS is\n * available before the first controller element is created. Site-specific\n * overrides are in the user-editable "Controller CSS" setting\n * (src/styles/controller-css-defaults.js), injected as a <style> by inject.js.\n */\nvsc-controller {\n  /* Out of normal flow by default; site overrides change to relative */\n  position: absolute;\n  visibility: visible;\n  opacity: 1;\n  display: block;\n  width: auto !important;\n  height: auto !important;\n  white-space: normal;\n  user-select: none;\n}\n\n/* shift YT 3D controller down */\n/* e.g. https://www.youtube.com/watch?v=erftYPflJzQ */\n.ytp-webgl-spherical-control {\n  top: 60px !important;\n}\n\n.ytp-fullscreen .ytp-webgl-spherical-control {\n  top: 100px !important;\n}\n\n/* disable Vimeo video overlay */\ndiv.video-wrapper + div.target {\n  height: 0;\n}\n\n/* Fix black overlay on Kickstarter */\ndiv.video-player.has_played.vertically_center:before,\ndiv.legacy-video-player.has_played.vertically_center:before {\n  content: none !important;\n}\n';

  /* ===== src/utils/key-maps.js ===== */
  /**
   * Shared keyboard identity maps used by both:
   * - background.js (service worker context — migration)
   * - constants.js (page context — runtime matching + options page)
   *
   * Pure ES module exports — no window/DOM dependencies.
   */

  /**
   * Hardcoded mapping for the 9 predefined bindings. Zero ambiguity —
   * these are the exact physical keys this controller uses by default.
   */
  const PREDEFINED_CODE_MAP = Object.freeze({
    83: { code: "KeyS", displayKey: "s" }, // slower
    68: { code: "KeyD", displayKey: "d" }, // faster
    90: { code: "KeyZ", displayKey: "z" }, // rewind
    88: { code: "KeyX", displayKey: "x" }, // advance
    82: { code: "KeyR", displayKey: "r" }, // reset
    71: { code: "KeyG", displayKey: "g" }, // fast
    86: { code: "KeyV", displayKey: "v" }, // display
    77: { code: "KeyM", displayKey: "m" }, // mark
    74: { code: "KeyJ", displayKey: "j" }, // jump
  });

  /**
   * Static lookup table mapping legacy keyCode integers to event.code strings.
   * Based on US QWERTY layout — the same assumption the old keyCode-based system
   * and keyCodeAliases/String.fromCharCode already made.
   *
   * Used by the v1→v2 migration for custom (non-predefined) bindings.
   * Where a keyCode maps to multiple physical keys (e.g., 13→Enter vs NumpadEnter),
   * the primary (non-numpad) key is chosen.
   */
  const KEYCODE_TO_CODE = Object.freeze({
    // Control keys
    8: "Backspace",
    13: "Enter", // NumpadEnter also produces 13 — we pick main Enter
    27: "Escape",
    32: "Space",
    46: "Delete",

    // Arrow keys
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",

    // Digit row (top)
    48: "Digit0",
    49: "Digit1",
    50: "Digit2",
    51: "Digit3",
    52: "Digit4",
    53: "Digit5",
    54: "Digit6",
    55: "Digit7",
    56: "Digit8",
    57: "Digit9",

    // Letter keys
    65: "KeyA",
    66: "KeyB",
    67: "KeyC",
    68: "KeyD",
    69: "KeyE",
    70: "KeyF",
    71: "KeyG",
    72: "KeyH",
    73: "KeyI",
    74: "KeyJ",
    75: "KeyK",
    76: "KeyL",
    77: "KeyM",
    78: "KeyN",
    79: "KeyO",
    80: "KeyP",
    81: "KeyQ",
    82: "KeyR",
    83: "KeyS",
    84: "KeyT",
    85: "KeyU",
    86: "KeyV",
    87: "KeyW",
    88: "KeyX",
    89: "KeyY",
    90: "KeyZ",

    // Numpad
    96: "Numpad0",
    97: "Numpad1",
    98: "Numpad2",
    99: "Numpad3",
    100: "Numpad4",
    101: "Numpad5",
    102: "Numpad6",
    103: "Numpad7",
    104: "Numpad8",
    105: "Numpad9",
    106: "NumpadMultiply",
    107: "NumpadAdd",
    109: "NumpadSubtract",
    110: "NumpadDecimal",
    111: "NumpadDivide",

    // Function keys
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    124: "F13",
    125: "F14",
    126: "F15",
    127: "F16",
    128: "F17",
    129: "F18",
    130: "F19",
    131: "F20",
    132: "F21",
    133: "F22",
    134: "F23",
    135: "F24",

    // Lock keys
    144: "NumLock",
    145: "ScrollLock",

    // Punctuation / symbols (US QWERTY positions)
    186: "Semicolon",
    187: "Equal",
    188: "Comma",
    189: "Minus",
    190: "Period",
    191: "Slash",
    192: "Backquote",
    219: "BracketLeft",
    220: "Backslash",
    221: "BracketRight",
    222: "Quote",
  });

  /**
   * Derive a human-readable display label from an event.code string.
   * Used during migration to populate the displayKey field.
   * @param {string} code - event.code value (e.g., "KeyS", "Digit5", "F10")
   * @returns {string} Display-friendly label (e.g., "s", "5", "F10")
   */
  function displayKeyFromCode(code) {
    if (!code) {
      return "";
    }
    // Letter keys: "KeyA" → "a"
    if (code.startsWith("Key") && code.length === 4) {
      return code.charAt(3).toLowerCase();
    }
    // Digit row: "Digit5" → "5"
    if (code.startsWith("Digit") && code.length === 6) {
      return code.charAt(5);
    }
    // Numpad digits: "Numpad3" → "Num 3"
    if (/^Numpad\d$/.test(code)) {
      return `Num ${code.charAt(6)}`;
    }
    // Numpad operators
    const numpadOps = {
      NumpadEnter: "Num Enter",
      NumpadMultiply: "Num *",
      NumpadAdd: "Num +",
      NumpadSubtract: "Num -",
      NumpadDecimal: "Num .",
      NumpadDivide: "Num /",
    };
    if (numpadOps[code]) {
      return numpadOps[code];
    }
    // Punctuation: map code name to the actual character
    const punctuation = {
      Semicolon: ";",
      Equal: "=",
      Comma: ",",
      Minus: "-",
      Period: ".",
      Slash: "/",
      Backquote: "`",
      BracketLeft: "[",
      Backslash: "\\",
      BracketRight: "]",
      Quote: "'",
    };
    if (punctuation[code]) {
      return punctuation[code];
    }
    // Everything else (Space, Backspace, Enter, Escape, Arrow*, F1-F24, Delete, etc.)
    // is already human-readable as-is
    return code;
  }

  /** All predefined action names, in display order. */
  const PREDEFINED_ACTIONS = [
    "slower",
    "faster",
    "rewind",
    "advance",
    "reset",
    "fast",
    "display",
    "mark",
    "jump",
  ];

  /**
   * Complete default bindings for all predefined actions (v2 schema).
   * Single source of truth — used by DEFAULT_SETTINGS (constants.js),
   * migration Phase 4 (background.js), and restore_defaults (options.js).
   */
  const DEFAULT_BINDINGS = Object.freeze({
    slower: { code: "KeyS", key: 83, keyCode: 83, displayKey: "s", value: 0.1 },
    faster: { code: "KeyD", key: 68, keyCode: 68, displayKey: "d", value: 0.1 },
    rewind: { code: "KeyZ", key: 90, keyCode: 90, displayKey: "z", value: 10 },
    advance: { code: "KeyX", key: 88, keyCode: 88, displayKey: "x", value: 10 },
    reset: { code: "KeyR", key: 82, keyCode: 82, displayKey: "r", value: 1.0 },
    fast: { code: "KeyG", key: 71, keyCode: 71, displayKey: "g", value: 1.8 },
    display: { code: "KeyV", key: 86, keyCode: 86, displayKey: "v", value: 0 },
    mark: { code: "KeyM", key: 77, keyCode: 77, displayKey: "m", value: 0 },
    jump: { code: "KeyJ", key: 74, keyCode: 74, displayKey: "j", value: 0 },
  });

  /** event.code values that must not be recorded as shortcuts. */
  const BLACKLISTED_CODES = new Set([
    "Tab",
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
    "ContextMenu",
    "CapsLock",
    "NumLock",
    "ScrollLock",
  ]);

  /* ===== src/styles/controller-css-defaults.js ===== */
  /**
   * Default CSS for controller site-specific positioning overrides.
   *
   * Base vsc-controller rule lives in inject.css (manifest-loaded).
   * This module contains site-specific overrides that layer on top.
   *
   * Domain selectors use :root[style*='--vsc-domain: "DOMAIN"'] syntax.
   * At injection time, matching domains get the selector stripped (rule
   * applies unconditionally); non-matching get [data-vsc-never] (never
   * matches). No CSS variable is actually set on :root.
   */

  const DEFAULT_CONTROLLER_CSS = `/* === Domain-based rules (stable — hostname only) === */

  /* Facebook */
  :root[style*='--vsc-domain: "facebook.com"'] vsc-controller {
  position: relative;
  top: 40px;
  }

  /* Google Photos — inline preview */
  :root[style*='--vsc-domain: "photos.google.com"'] vsc-controller {
  position: relative;
  top: 35px;
  }

  /* Google Photos — full-screen view */
  :root[style*='--vsc-domain: "photos.google.com"'] #player .house-brand vsc-controller {
  top: 50px;
  }

  /* Netflix */
  :root[style*='--vsc-domain: "netflix.com"'] vsc-controller {
  position: relative;
  top: 85px;
  }

  /* Google Drive — shift native controls overlay down to expose video */
  :root[style*='--vsc-domain: "drive.google.com"'] section[role="tabpanel"][aria-label="Video Player"] {
  top: 80px;
  }

  /* ChatGPT */
  :root[style*='--vsc-domain: "chatgpt.com"'] vsc-controller {
  position: relative;
  top: 0px;
  left: 35px;
  }

  /* === DOM-contextual rules (may break if site changes HTML structure) === */

  /* YouTube — controller can be inside .html5-video-player (main site via
   youtube-handler) or a sibling of it (embeds, edge cases). Both selectors
   needed; :has(> ...) handles the sibling case DOM-order-independently. */
  .ytp-hide-info-bar > vsc-controller,
  :has(> .ytp-hide-info-bar) > vsc-controller {
  position: relative;
  top: 10px;
  }

  /* YouTube — shifts below paid promotion overlay when visible.
   Domain-wrapped so preprocessDomainCSS strips it on non-YouTube pages:
   [style*=...] forces global style invalidation on every style mutation,
   causing multi-second hangs on heavy pages (Gemini, etc). (#1501) */
  :root[style*='--vsc-domain: "youtube.com"'] .ytp-hide-info-bar:has(.ytp-paid-content-overlay-link:not([style*="display: none"])) > vsc-controller,
  :root[style*='--vsc-domain: "youtube.com"'] :has(> .ytp-hide-info-bar .ytp-paid-content-overlay-link:not([style*="display: none"])) > vsc-controller {
  top: 40px;
  }

  /* YouTube embedded player (on third-party sites) */
  .html5-video-player:not(.ytp-hide-info-bar) > vsc-controller,
  :has(> .html5-video-player:not(.ytp-hide-info-bar)) > vsc-controller,
  #player > vsc-controller {
  position: relative;
  top: 60px;
  }

  /* OpenAI — prevent black overlay */
  .Shared-Video-player > vsc-controller {
  height: 0 !important;
  }

  /* Amazon Prime Video — prevent black overlay */
  .dv-player-fullscreen vsc-controller {
  height: 0 !important;
  }

  /* Google Drive YouTube embed — no info bar, override embedded player offset.
   Extra :root bumps specificity above .html5-video-player:not(...) rule. */
  :root:root[style*='--vsc-domain: "youtube.googleapis.com"'] vsc-controller {
  position: relative;
  top: 0px;
  }`;

  /* ===== src/utils/constants.js ===== */
  /**
   * Constants and default values for HML5SpeedController
   */

  // Keyboard identity maps — shared with background.js (service worker context).
  // esbuild inlines these into each bundle at build time.
  window.VSC = window.VSC || {};

  window.VSC.Constants = {};

  if (!window.VSC.Constants.DEFAULT_SETTINGS) {
    // Define constants directly first for ES6 exports
    const regStrip = /^[\r\t\f\v ]+|[\r\t\f\v ]+$/gm;
    const regEndsWithFlags = /\/(?!.*(.).*\1)[gimsuy]*$/;

    // Assign to global namespace
    window.VSC.Constants.regStrip = regStrip;
    window.VSC.Constants.regEndsWithFlags = regEndsWithFlags;

    window.VSC.Constants.DEFAULT_CONTROLLER_CSS = DEFAULT_CONTROLLER_CSS;

    const DEFAULT_SETTINGS = {
      schemaVersion: 1,
      lastSpeed: 1.0, // default 1x
      enabled: true, // default enabled
      rememberSpeed: false, // default: false
      exclusiveKeys: false, // default: false
      audioBoolean: true, // default: true (enable audio controller support)
      startHidden: false, // default: false
      controllerOpacity: 0.3, // default: 0.3
      controllerButtonSize: 14,
      customCSS: "", // user's additional CSS injected alongside the built-in defaults
      keyBindings: PREDEFINED_ACTIONS.map((action) => ({
        action,
        ...DEFAULT_BINDINGS[action],
        predefined: true,
      })),
      siteRules: [
        { pattern: "www.instagram.com", enabled: false, speed: null },
        { pattern: "imgur.com", enabled: false, speed: null },
        { pattern: "teams.microsoft.com", enabled: false, speed: null },
        { pattern: "meet.google.com", enabled: false, speed: null },
      ],
      blacklist: `www.instagram.com
  imgur.com
  teams.microsoft.com
  meet.google.com`.replace(regStrip, ""),
      defaultLogLevel: 4,
      logLevel: 3,
    };

    window.VSC.Constants.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

    /**
     * Format speed value to 2 decimal places
     * @param {number} speed - Speed value
     * @returns {string} Formatted speed
     */
    const formatSpeed = (speed) => speed.toFixed(2);

    window.VSC.Constants.formatSpeed = formatSpeed;

    const LOG_LEVELS = {
      NONE: 1,
      ERROR: 2,
      WARNING: 3,
      INFO: 4,
      DEBUG: 5,
      VERBOSE: 6,
    };

    const MESSAGE_TYPES = {
      SET_SPEED: "VSC_SET_SPEED",
      ADJUST_SPEED: "VSC_ADJUST_SPEED",
      RESET_SPEED: "VSC_RESET_SPEED",
      TOGGLE_DISPLAY: "VSC_TOGGLE_DISPLAY",
      TEARDOWN: "VSC_TEARDOWN",
      REINIT: "VSC_REINIT",
    };

    const SPEED_LIMITS = {
      MIN: 0.07, // Video min rate per Chromium source
      MAX: 16, // Maximum playback speed in Chrome per Chromium source
    };

    const CONTROLLER_SIZE_LIMITS = {
      // Video elements: minimum size before rejecting controller entirely
      VIDEO_MIN_WIDTH: 40,
      VIDEO_MIN_HEIGHT: 40,

      // Audio elements: minimum size before starting controller hidden
      AUDIO_MIN_WIDTH: 20,
      AUDIO_MIN_HEIGHT: 20,
    };

    const CUSTOM_ACTIONS_NO_VALUES = [
      "pause",
      "muted",
      "mark",
      "jump",
      "display",
    ];

    // Assign to global namespace
    window.VSC.Constants.LOG_LEVELS = LOG_LEVELS;
    window.VSC.Constants.MESSAGE_TYPES = MESSAGE_TYPES;
    window.VSC.Constants.SPEED_LIMITS = SPEED_LIMITS;
    window.VSC.Constants.CONTROLLER_SIZE_LIMITS = CONTROLLER_SIZE_LIMITS;
    window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES = CUSTOM_ACTIONS_NO_VALUES;
    window.VSC.Constants.PREDEFINED_CODE_MAP = PREDEFINED_CODE_MAP;
    window.VSC.Constants.KEYCODE_TO_CODE = KEYCODE_TO_CODE;
    window.VSC.Constants.displayKeyFromCode = displayKeyFromCode;
    window.VSC.Constants.BLACKLISTED_CODES = BLACKLISTED_CODES;
    window.VSC.Constants.PREDEFINED_ACTIONS = PREDEFINED_ACTIONS;
  }

  /* ===== src/utils/logger.js ===== */
  /**
   * Logging utility for HML5SpeedController
   */

  window.VSC = window.VSC || {};

  if (!window.VSC.logger) {
    class Logger {
      constructor() {
        this.verbosity = 3; // Default warning level
        this.defaultLevel = 4; // Default info level
        this.contextStack = []; // Stack for nested contexts
        this._buffer = []; // Holds messages logged before verbosity is configured
        this._ready = false; // True once setVerbosity() has been called with user prefs
      }

      /**
       * Set logging verbosity level and flush any buffered messages.
       * Called once config.load() has the user's logLevel preference.
       * @param {number} level - Log level from LOG_LEVELS constants
       */
      setVerbosity(level) {
        this.verbosity = level;
        if (!this._ready) {
          this._ready = true;
          const pending = this._buffer;
          this._buffer = [];
          for (const entry of pending) {
            this._emit(entry.message, entry.level);
          }
        }
      }

      /**
       * Set default logging level
       * @param {number} level - Default level from LOG_LEVELS constants
       */
      setDefaultLevel(level) {
        this.defaultLevel = level;
      }

      /**
       * Generate video/controller context string from context stack
       * @returns {string} Context string like "[V1]" or ""
       * @private
       */
      generateContext() {
        if (this.contextStack.length > 0) {
          return `[${this.contextStack[this.contextStack.length - 1]}] `;
        }
        return "";
      }

      /**
       * Format video element identifier using controller ID
       * @param {HTMLMediaElement} video - Video element
       * @returns {string} Formatted ID like "V1" or "A1"
       * @private
       */
      formatVideoId(video) {
        if (!video) {
          return "V?";
        }

        const isAudio = video.tagName === "AUDIO";
        const prefix = isAudio ? "A" : "V";

        // Use controller ID if available (this is what we want!)
        if (video.vsc?.controllerId) {
          return `${prefix}${video.vsc.controllerId}`;
        }

        // Fallback for videos without controllers
        return `${prefix}?`;
      }

      /**
       * Push context onto stack (for nested operations)
       * @param {string|HTMLMediaElement} context - Context string or video element
       */
      pushContext(context) {
        if (typeof context === "string") {
          this.contextStack.push(context);
        } else if (
          context &&
          (context.tagName === "VIDEO" || context.tagName === "AUDIO")
        ) {
          this.contextStack.push(this.formatVideoId(context));
        }
      }

      /**
       * Pop context from stack
       */
      popContext() {
        this.contextStack.pop();
      }

      /**
       * Execute function with context
       * @param {string|HTMLMediaElement} context - Context string or video element
       * @param {Function} fn - Function to execute
       * @returns {*} Function result
       */
      withContext(context, fn) {
        this.pushContext(context);
        try {
          return fn();
        } finally {
          this.popContext();
        }
      }

      /**
       * Log a message with specified level
       * @param {string} message - Message to log
       * @param {number} level - Log level (optional, uses default if not specified)
       */
      log(message, level) {
        const logLevel = typeof level === "undefined" ? this.defaultLevel : level;

        if (!this._ready) {
          this._buffer.push({ message, level: logLevel });
          return;
        }

        this._emit(message, logLevel);
      }

      /**
       * Emit a log message to console (only called after verbosity is configured)
       * @param {string} message - Message to log
       * @param {number} logLevel - Resolved log level
       * @private
       */
      _emit(message, logLevel) {
        if (this.verbosity < logLevel) {
          return;
        }

        const LOG_LEVELS = window.VSC.Constants.LOG_LEVELS;
        const context = this.generateContext();
        const contextualMessage = `${context}${message}`;

        switch (logLevel) {
          case LOG_LEVELS.ERROR:
            console.log(`ERROR:${contextualMessage}`);
            break;
          case LOG_LEVELS.WARNING:
            console.log(`WARNING:${contextualMessage}`);
            break;
          case LOG_LEVELS.INFO:
            console.log(`INFO:${contextualMessage}`);
            break;
          case LOG_LEVELS.DEBUG:
            console.log(`DEBUG:${contextualMessage}`);
            break;
          case LOG_LEVELS.VERBOSE:
            console.log(`DEBUG (VERBOSE):${contextualMessage}`);
            console.trace();
            break;
          default:
            console.log(contextualMessage);
        }
      }

      /**
       * Log error message
       * @param {string} message - Error message
       */
      error(message) {
        this.log(message, window.VSC.Constants.LOG_LEVELS.ERROR);
      }

      /**
       * Log warning message
       * @param {string} message - Warning message
       */
      warn(message) {
        this.log(message, window.VSC.Constants.LOG_LEVELS.WARNING);
      }

      /**
       * Log info message
       * @param {string} message - Info message
       */
      info(message) {
        this.log(message, window.VSC.Constants.LOG_LEVELS.INFO);
      }

      /**
       * Log debug message
       * @param {string} message - Debug message
       */
      debug(message) {
        this.log(message, window.VSC.Constants.LOG_LEVELS.DEBUG);
      }

      /**
       * Log verbose debug message with stack trace
       * @param {string} message - Verbose debug message
       */
      verbose(message) {
        this.log(message, window.VSC.Constants.LOG_LEVELS.VERBOSE);
      }
    }

    // Create singleton instance
    window.VSC.logger = new Logger();
  }

  /* ===== src/utils/debug-helper.js ===== */
  /**
   * Debug helper for diagnosing HML5SpeedController issues
   * Add this to help troubleshoot controller visibility and popup communication
   */

  window.VSC = window.VSC || {};

  class DebugHelper {
    constructor() {
      this.isActive = false;
    }

    /**
     * Enable debug mode with enhanced logging
     */
    enable() {
      this.isActive = true;
      console.log("🐛 VSC Debug Mode Enabled");

      // Override logger to be more verbose
      if (window.VSC.logger && window.VSC.Constants.LOG_LEVELS) {
        window.VSC.logger.setVerbosity(window.VSC.Constants.LOG_LEVELS.DEBUG);
      }

      // Add global debug functions
      window.vscDebug = {
        checkMedia: () => this.checkMediaElements(),
        checkControllers: () => this.checkControllers(),
        testPopup: () => this.testPopupCommunication(),
        testBridge: () => this.testPopupMessageBridge(),
        forceShow: () => this.forceShowControllers(),
        forceShowAudio: () => this.forceShowAudioControllers(),
        getVisibility: (element) => this.getElementVisibility(element),
      };

      console.log(
        "🔧 Debug functions available: vscDebug.checkMedia(), vscDebug.checkControllers(), vscDebug.testPopup(), vscDebug.testBridge(), vscDebug.forceShow(), vscDebug.forceShowAudio()",
      );
    }

    /**
     * Check all media elements and their detection status
     */
    checkMediaElements() {
      console.group("🎵 Media Elements Analysis");

      // Check basic video/audio elements
      const videos = document.querySelectorAll("video");
      const audios = document.querySelectorAll("audio");

      console.log(
        `Found ${videos.length} video elements, ${audios.length} audio elements`,
      );

      [...videos, ...audios].forEach((media, index) => {
        console.group(`${media.tagName} #${index + 1}`);
        console.log("Element:", media);
        console.log("Connected to DOM:", media.isConnected);
        console.log("Has VSC controller:", !!media.vsc);
        console.log(
          "Current source:",
          media.currentSrc || media.src || "No source",
        );
        console.log("Ready state:", media.readyState);
        console.log("Paused:", media.paused);
        console.log("Duration:", media.duration);

        // Check computed styles
        const style = window.getComputedStyle(media);
        console.log("Computed styles:", {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          width: style.width,
          height: style.height,
        });

        // Check bounding rect
        const rect = media.getBoundingClientRect();
        console.log("Bounding rect:", {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          visible: rect.width > 0 && rect.height > 0,
        });

        // Check if would be detected by VSC
        if (
          window.VSC.MediaElementObserver &&
          window.HML5_controller?.mediaObserver
        ) {
          const observer = window.HML5_controller.mediaObserver;
          console.log("VSC would detect:", observer.isValidMediaElement(media));
          console.log(
            "VSC would start hidden:",
            observer.shouldStartHidden(media),
          );
        }

        console.groupEnd();
      });

      // Check for media in shadow DOMs
      this.checkShadowDOMMedia();

      console.groupEnd();
    }

    /**
     * Check shadow DOM for hidden media elements
     */
    checkShadowDOMMedia() {
      console.group("👻 Shadow DOM Media Check");

      let shadowMediaCount = 0;
      const checkElement = (element) => {
        if (element.shadowRoot) {
          const shadowMedia = element.shadowRoot.querySelectorAll("video, audio");
          if (shadowMedia.length > 0) {
            console.log(
              `Found ${shadowMedia.length} media elements in shadow DOM of:`,
              element,
            );
            shadowMediaCount += shadowMedia.length;
            shadowMedia.forEach((media, index) => {
              console.log(`  Shadow media #${index + 1}:`, media);
            });
          }
          // Recursively check shadow roots
          element.shadowRoot.querySelectorAll("*").forEach(checkElement);
        }
      };

      document.querySelectorAll("*").forEach(checkElement);
      console.log(`Total shadow DOM media elements: ${shadowMediaCount}`);

      console.groupEnd();
    }

    /**
     * Check all controllers and their visibility status
     */
    checkControllers() {
      console.group("🎮 Controllers Analysis");

      const controllers = document.querySelectorAll("vsc-controller");
      console.log(`Found ${controllers.length} VSC controllers`);

      controllers.forEach((controller, index) => {
        console.group(`Controller #${index + 1}`);
        console.log("Element:", controller);
        console.log("Classes:", controller.className);

        const style = window.getComputedStyle(controller);
        console.log("Computed styles:", {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          position: style.position,
          top: style.top,
          left: style.left,
          zIndex: style.zIndex,
        });

        // Check if hidden by VSC classes
        const isHidden = controller.classList.contains("vsc-hidden");
        const isManual = controller.classList.contains("vsc-manual");
        const hasNoSource = controller.classList.contains("vsc-nosource");
        const isAutohide = controller.classList.contains("vsc-autohide");
        const isShow = controller.classList.contains("vsc-show");

        console.log("VSC State:", {
          hidden: isHidden,
          manual: isManual,
          noSource: hasNoSource,
          autohide: isAutohide,
          show: isShow,
          effectivelyVisible:
            !isHidden && !isAutohide && style.display !== "none",
        });

        // Find associated video
        let associatedVideo = null;
        document.querySelectorAll("video, audio").forEach((media) => {
          if (media.vsc && media.vsc.div === controller) {
            associatedVideo = media;
          }
        });

        if (associatedVideo) {
          console.log("Associated media:", associatedVideo);
          console.log(
            "Media visibility would be:",
            this.getElementVisibility(associatedVideo),
          );
        } else {
          console.log("⚠️ No associated media found");
        }

        console.groupEnd();
      });

      console.groupEnd();
    }

    /**
     * Test popup communication
     */
    testPopupCommunication() {
      console.group("📡 Popup Communication Test");

      // Test if message bridge is working
      if (typeof chrome !== "undefined" && chrome.runtime) {
        console.log("✅ Browser runtime available");
      } else {
        console.log(
          "ℹ️ Browser runtime not available (expected in page context)",
        );
      }

      // Test direct VSC message handling
      console.log("Testing direct VSC message handling...");

      // Check if videos would respond
      const videos = document.querySelectorAll("video, audio");
      console.log(`Found ${videos.length} media elements to control`);

      videos.forEach((video, index) => {
        console.log(`Media #${index + 1}:`, {
          element: video,
          hasController: !!video.vsc,
          currentSpeed: video.playbackRate,
          canControl: !video.classList.contains("vsc-cancelled"),
        });
      });

      // Test simulated popup messages directly
      if (window.HML5_controller && window.HML5_controller.actionHandler) {
        console.log("✅ Action handler available, testing speed controls...");

        // Test speed adjustment
        const testSpeed = 1.5;
        console.log(`Testing speed change to ${testSpeed}x`);

        videos.forEach((video, index) => {
          if (video.vsc) {
            console.log(
              `Applying speed ${testSpeed} to media #${index + 1} via action handler`,
            );
            window.HML5_controller.actionHandler.adjustSpeed(video, testSpeed);
          } else {
            console.log(
              `Applying speed ${testSpeed} to media #${index + 1} directly`,
            );
            video.playbackRate = testSpeed;
          }
        });

        // Reset after 2 seconds
        setTimeout(() => {
          console.log("Resetting speed to 1.0x");
          videos.forEach((video) => {
            if (video.vsc) {
              window.HML5_controller.actionHandler.adjustSpeed(video, 1.0);
            } else {
              video.playbackRate = 1.0;
            }
          });
        }, 2000);
      } else {
        console.log("❌ Action handler not available");
      }

      console.groupEnd();
    }

    /**
     * Test the complete popup message bridge by simulating the message flow
     */
    testPopupMessageBridge() {
      console.group("📡 Testing Complete Popup Message Bridge");

      // Test if we can simulate the exact message flow from popup → content script → page context
      const testMessages = [
        { type: "VSC_SET_SPEED", payload: { speed: 1.25 } },
        { type: "VSC_ADJUST_SPEED", payload: { delta: 0.25 } },
        { type: "VSC_RESET_SPEED" },
      ];

      console.log("Testing message bridge by simulating popup messages...");

      testMessages.forEach((message, index) => {
        setTimeout(() => {
          console.log(
            `🔧 Debug: Simulating popup message ${index + 1}:`,
            message,
          );

          // Dispatch the same event that content script would dispatch
          window.dispatchEvent(
            new CustomEvent("VSC_MESSAGE", {
              detail: message,
            }),
          );
        }, index * 1500); // 1.5 second delays
      });

      console.log("Messages will be sent with 1.5 second intervals...");
      console.groupEnd();
    }

    /**
     * Force show all controllers for debugging
     */
    forceShowControllers() {
      console.log("🔧 Force showing all controllers");

      const controllers = document.querySelectorAll("vsc-controller");
      controllers.forEach((controller, index) => {
        // Remove all hiding classes and rely on vsc-show for visibility
        controller.classList.remove("vsc-hidden", "vsc-nosource", "vsc-autohide");
        controller.classList.add("vsc-manual", "vsc-show");

        console.log(`Controller #${index + 1} forced visible`);
      });

      return controllers.length;
    }

    /**
     * Force show audio controllers specifically
     */
    forceShowAudioControllers() {
      console.log("🔊 Force showing audio controllers");

      const audioElements = document.querySelectorAll("audio");
      let controllersShown = 0;

      audioElements.forEach((audio, index) => {
        if (audio.vsc && audio.vsc.div) {
          const controller = audio.vsc.div;

          // Remove all hiding classes and rely on vsc-show for visibility
          controller.classList.remove(
            "vsc-hidden",
            "vsc-nosource",
            "vsc-autohide",
          );
          controller.classList.add("vsc-manual", "vsc-show");

          console.log(`Audio controller #${index + 1} forced visible`);
          controllersShown++;
        } else {
          console.log(`Audio #${index + 1} has no controller attached`);
        }
      });

      return controllersShown;
    }

    /**
     * Get detailed visibility information for an element
     */
    getElementVisibility(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return {
        connected: element.isConnected,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        width: rect.width,
        height: rect.height,
        isVisible:
          element.isConnected &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0,
      };
    }

    /**
     * Monitor controller visibility changes
     */
    monitorControllerChanges() {
      console.log("👀 Starting controller visibility monitoring");

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === "attributes" &&
            (mutation.attributeName === "class" ||
              mutation.attributeName === "style")
          ) {
            const target = mutation.target;
            if (target.tagName === "VSC-CONTROLLER") {
              console.log("🔄 Controller visibility changed:", {
                element: target,
                classes: target.className,
                hidden: target.classList.contains("vsc-hidden"),
                manual: target.classList.contains("vsc-manual"),
                autohide: target.classList.contains("vsc-autohide"),
                show: target.classList.contains("vsc-show"),
              });
            }
          }
        });
      });

      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });

      return observer;
    }
  }

  // Create global debug helper instance
  window.VSC.DebugHelper = DebugHelper;
  window.vscDebugHelper = new DebugHelper();

  // Debug mode can be enabled manually by calling: window.vscDebugHelper.enable()

  /* ===== src/utils/dom-utils.js ===== */
  /**
   * DOM utility functions for HML5SpeedController
   */

  window.VSC = window.VSC || {};
  window.VSC.DomUtils = {};

  /**
   * Check if we're running in an iframe
   * @returns {boolean} True if in iframe
   */
  window.VSC.DomUtils.inIframe = function () {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  };

  /**
   * Get all elements in shadow DOMs recursively
   * @param {Element} parent - Parent element to search
   * @param {number} maxDepth - Maximum recursion depth to prevent infinite loops
   * @returns {Array<Element>} Flattened array of all elements
   */
  window.VSC.DomUtils.getShadow = function (parent, maxDepth = 10) {
    const result = [];
    const visited = new WeakSet(); // Prevent infinite loops

    function getChild(element, depth = 0) {
      // Prevent infinite recursion and excessive depth
      if (depth > maxDepth || visited.has(element)) {
        return;
      }

      visited.add(element);

      if (element.firstElementChild) {
        let child = element.firstElementChild;
        do {
          result.push(child);
          getChild(child, depth + 1);

          // Only traverse shadow roots if we haven't exceeded depth limit
          if (child.shadowRoot && depth < maxDepth - 2) {
            // Always handle shadow roots synchronously to maintain function contract
            result.push(
              ...window.VSC.DomUtils.getShadow(
                child.shadowRoot,
                maxDepth - depth,
              ),
            );
          }

          child = child.nextElementSibling;
        } while (child);
      }
    }

    getChild(parent);
    return result.flat(Infinity);
  };

  /**
   * Find nearest parent of same size as video parent
   * @param {Element} element - Starting element
   * @returns {Element} Parent element
   */
  window.VSC.DomUtils.findVideoParent = function (element) {
    let parentElement = element.parentElement;

    while (
      parentElement.parentNode &&
      parentElement.parentNode.offsetHeight === parentElement.offsetHeight &&
      parentElement.parentNode.offsetWidth === parentElement.offsetWidth
    ) {
      parentElement = parentElement.parentNode;
    }

    return parentElement;
  };

  /**
   * Initialize document when ready
   * @param {Document} document - Document to initialize
   * @param {Function} callback - Callback to run when ready
   */
  window.VSC.DomUtils.initializeWhenReady = function (document, callback) {
    window.VSC.logger.debug("Begin initializeWhenReady");

    const handleWindowLoad = () => {
      callback(window.document);
    };

    window.addEventListener("load", handleWindowLoad, { once: true });

    if (document) {
      if (document.readyState === "complete") {
        callback(document);
      } else {
        const handleReadyStateChange = () => {
          if (document.readyState === "complete") {
            document.removeEventListener(
              "readystatechange",
              handleReadyStateChange,
            );
            callback(document);
          }
        };
        document.addEventListener("readystatechange", handleReadyStateChange);
      }
    }

    window.VSC.logger.debug("End initializeWhenReady");
  };

  /**
   * Check if element or its children are video/audio elements
   * Recursively searches through nested shadow DOM structures
   * @param {Element} node - Node to check
   * @param {boolean} audioEnabled - Whether to check for audio elements
   * @returns {Array<Element>} Array of media elements found
   */
  window.VSC.DomUtils.findMediaElements = function (node, audioEnabled = false) {
    if (!node) {
      return [];
    }

    const mediaElements = [];
    const selector = audioEnabled ? "video,audio" : "video";

    // Check the node itself
    if (node && node.matches && node.matches(selector)) {
      mediaElements.push(node);
    }

    // Check children
    if (node.querySelectorAll) {
      mediaElements.push(...Array.from(node.querySelectorAll(selector)));
    }

    // Recursively check shadow roots
    if (node.shadowRoot) {
      mediaElements.push(
        ...window.VSC.DomUtils.findShadowMedia(node.shadowRoot, selector),
      );
    }

    return mediaElements;
  };

  /**
   * Recursively find media elements in shadow DOM trees
   * @param {ShadowRoot|Document|Element} root - Root to search from
   * @param {string} selector - CSS selector for media elements
   * @returns {Array<Element>} Array of media elements found
   */
  window.VSC.DomUtils.findShadowMedia = function (root, selector) {
    const results = [];

    // If root is an element with shadowRoot, search in its shadow first
    if (root.shadowRoot) {
      results.push(
        ...window.VSC.DomUtils.findShadowMedia(root.shadowRoot, selector),
      );
    }

    // Add any matching elements in current root (if it's a shadowRoot/document)
    if (root.querySelectorAll) {
      results.push(...Array.from(root.querySelectorAll(selector)));
    }

    // Recursively check all elements with shadow roots
    if (root.querySelectorAll) {
      const allElements = Array.from(root.querySelectorAll("*"));
      allElements.forEach((element) => {
        if (element.shadowRoot) {
          results.push(
            ...window.VSC.DomUtils.findShadowMedia(element.shadowRoot, selector),
          );
        }
      });
    }

    return results;
  };

  // Global variables available for both browser and testing

  /* ===== src/utils/event-manager.js ===== */
  /**
   * Event management system for HML5SpeedController
   */

  window.VSC = window.VSC || {};

  class EventManager {
    constructor(config, actionHandler) {
      this.config = config;
      this.actionHandler = actionHandler;
      this.listeners = new Map();
      this.coolDown = false;

      // Event deduplication to prevent duplicate key processing
      this.lastKeyEventSignature = null;

      // Fight detection: track how many times a site resets our speed
      this.fightCount = 0;
      this.fightTimer = null;

      // User gesture tracking: timestamp of the last user interaction we did NOT
      // handle (click on page UI, unhandled key). A ratechange arriving within
      // USER_GESTURE_WINDOW_MS of this is treated as intentional and accepted
      // immediately rather than fought — handles native site speed controls.
      this.lastUserInteractionAt = 0;
    }

    /**
     * Set up all event listeners
     * @param {Document} document - Document to attach events to
     */
    setupEventListeners(document) {
      this.setupKeyboardShortcuts(document);
      this.setupRateChangeListener(document);
      this.setupUserGestureListener(document);
    }

    /**
     * Set up keyboard shortcuts
     * @param {Document} document - Document to attach events to
     */
    setupKeyboardShortcuts(document) {
      const docs = [document];

      try {
        if (window.VSC.inIframe()) {
          docs.push(window.top.document);
        }
      } catch {
        // Cross-origin iframe - ignore
      }

      docs.forEach((doc) => {
        const keydownHandler = (event) => this.handleKeydown(event);
        doc.addEventListener("keydown", keydownHandler, true);

        // Store reference for cleanup
        if (!this.listeners.has(doc)) {
          this.listeners.set(doc, []);
        }
        this.listeners.get(doc).push({
          type: "keydown",
          handler: keydownHandler,
          useCapture: true,
        });
      });
    }

    /**
     * Handle keydown events
     * @param {KeyboardEvent} event - Keyboard event
     * @private
     */
    handleKeydown(event) {
      window.VSC.logger.verbose(
        `Processing keydown event: code=${event.code}, key=${event.key}, keyCode=${event.keyCode}`,
      );

      // IME composition and dead key guard
      // 'Process' / keyCode 229 = IME composition active (CJK input)
      // 'Dead' = first keypress of a dead key sequence (e.g. ^ on French keyboard)
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.key === "Process" ||
        event.key === "Dead"
      ) {
        return;
      }

      // Event deduplication — include code+key to handle empty-code cases
      const eventSignature = `${event.code}_${event.key}_${event.timeStamp}_${event.type}`;
      if (this.lastKeyEventSignature === eventSignature) {
        return;
      }
      this.lastKeyEventSignature = eventSignature;

      // Ignore keydown event if typing in an input box
      if (this.isTypingContext(event.target)) {
        return false;
      }

      // Ignore keydown event if no media elements are present
      const mediaElements = window.VSC.stateManager
        ? window.VSC.stateManager.getControlledElements()
        : [];
      if (!mediaElements.length) {
        return false;
      }

      // Find matching key binding using the three-tier algorithm
      const keyBinding = this.findMatchingBinding(event);

      if (keyBinding) {
        this.actionHandler.runAction(keyBinding.action, keyBinding.value, event);

        if (this.config.settings.exclusiveKeys) {
          event.preventDefault();
          event.stopPropagation();
        }
      } else {
        // Unhandled key — could be a site shortcut (e.g. YouTube's < > speed keys).
        // Mark as user interaction so an immediately-following ratechange is accepted.
        this.lastUserInteractionAt = event.timeStamp;
        window.VSC.logger.verbose(
          `No key binding found for code=${event.code}, keyCode=${event.keyCode}`,
        );
      }

      return false;
    }

    /**
     * Three-tier binding match: chord → simple → legacy fallback.
     *
     * When event.code is empty/Unidentified (virtual keyboards, remote desktop,
     * accessibility devices), falls back to keyCode matching for all bindings.
     *
     * @param {KeyboardEvent} event
     * @returns {Object|undefined} Matching binding, or undefined
     * @private
     */
    findMatchingBinding(event) {
      const bindings = this.config.settings.keyBindings;
      const code = event.code;
      const keyCode = event.keyCode;
      const ctrl = !!event.ctrlKey;
      const alt = !!event.altKey;
      const meta = !!event.metaKey;
      const shift = !!event.shiftKey;
      const hasModifier = ctrl || alt || meta;

      // Runtime fallback: if event.code is empty or unidentified, match on keyCode
      if (!code || code === "Unidentified") {
        return bindings.find((b) => {
          const bKey = b.keyCode ?? b.key;
          if (bKey !== keyCode) {
            return false;
          }
          return b.modifiers
            ? EventManager.modifiersMatch(b.modifiers, ctrl, alt, meta, shift)
            : !hasModifier;
        });
      }

      // Tier 1: Chord match — bindings WITH modifiers, all must match exactly
      const chordMatch = bindings.find(
        (b) =>
          b.modifiers &&
          b.code === code &&
          EventManager.modifiersMatch(b.modifiers, ctrl, alt, meta, shift),
      );
      if (chordMatch) {
        return chordMatch;
      }

      // Tier 2: Simple match — bindings WITHOUT modifiers, no Ctrl/Alt/Meta active
      if (!hasModifier) {
        const simpleMatch = bindings.find((b) => !b.modifiers && b.code === code);
        if (simpleMatch) {
          return simpleMatch;
        }
      }

      // Tier 3: Legacy fallback — bindings missing code field, match on keyCode
      if (!hasModifier) {
        const legacyMatch = bindings.find((b) => {
          if (b.code !== null && b.code !== undefined) {
            return false;
          }
          return (b.keyCode ?? b.key) === keyCode;
        });
        if (legacyMatch) {
          return legacyMatch;
        }
      }

      return undefined;
    }

    /**
     * Check if user is typing in an input context
     * @param {Element} target - Event target
     * @returns {boolean} True if typing context
     * @private
     */
    isTypingContext(target) {
      return (
        target.nodeName === "INPUT" ||
        target.nodeName === "TEXTAREA" ||
        target.isContentEditable
      );
    }

    /**
     * Track user interactions that originate outside the VSC controller.
     * Clicks on YouTube's speed menu (or any site's native speed UI) land here.
     * Unhandled keyboard events (e.g. YouTube's < > shortcuts) land in handleKeydown.
     * Both update lastUserInteractionAt so handleRateChange can distinguish
     * intentional speed changes from automatic site-initiated resets.
     * @param {Document} document
     * @private
     */
    setupUserGestureListener(document) {
      const clickHandler = (event) => {
        // Skip clicks on our own controller (shadow host retargeted at boundary)
        if (event.target?.closest?.("vsc-controller")) {
          return;
        }
        this.lastUserInteractionAt = event.timeStamp;
      };
      document.addEventListener("click", clickHandler, true);

      if (!this.listeners.has(document)) {
        this.listeners.set(document, []);
      }
      this.listeners
        .get(document)
        .push({ type: "click", handler: clickHandler, useCapture: true });
    }

    /**
     * Set up rate change event listener
     * @param {Document} document - Document to attach events to
     */
    setupRateChangeListener(document) {
      const rateChangeHandler = (event) => this.handleRateChange(event);
      document.addEventListener("ratechange", rateChangeHandler, true);

      // Store reference for cleanup
      if (!this.listeners.has(document)) {
        this.listeners.set(document, []);
      }
      this.listeners.get(document).push({
        type: "ratechange",
        handler: rateChangeHandler,
        useCapture: true,
      });
    }

    /**
     * Handle rate change events
     * @param {Event} event - Rate change event
     * @private
     */
    handleRateChange(event) {
      if (this.coolDown) {
        window.VSC.logger.debug("Rate change event blocked by cooldown");

        // Get the video element to restore authoritative speed
        const video = event.composedPath ? event.composedPath()[0] : event.target;

        // Don't fight back during video initialization — the player's own setup
        // fires ratechange at readyState=0; overwriting it can break the player.
        if (video.readyState < 1) {
          window.VSC.logger.debug(
            "Skipping cooldown fight-back during video init (readyState < 1)",
          );
          return;
        }

        // RESTORE our authoritative value since external change already happened
        if (video.vsc && this.config.settings.lastSpeed !== null) {
          const authoritativeSpeed = this.config.settings.lastSpeed;
          if (Math.abs(video.playbackRate - authoritativeSpeed) > 0.01) {
            window.VSC.logger.info(
              `Restoring speed during cooldown from external ${video.playbackRate} to authoritative ${authoritativeSpeed}`,
            );
            window.VSC.siteHandlerManager.handleSpeedChange(
              video,
              authoritativeSpeed,
            );
          }
        }

        event.stopImmediatePropagation();
        return;
      }

      // Get the actual video element (handle shadow DOM)
      const video = event.composedPath ? event.composedPath()[0] : event.target;

      // Skip if no VSC controller attached
      if (!video.vsc) {
        window.VSC.logger.debug(
          "Skipping ratechange - no VSC controller attached",
        );
        return;
      }

      // Check if this is our own event
      if (event.detail && event.detail.origin === "videoSpeed") {
        // This is our change, don't process it again
        window.VSC.logger.debug("Ignoring controller-originated rate change");
        return;
      }

      // Ignore external ratechanges during video initialization
      if (video.readyState < 1) {
        window.VSC.logger.debug(
          "Ignoring external ratechange during video initialization (readyState < 1)",
        );
        return;
      }

      // Ignore spurious external ratechanges below our supported MIN
      const rawExternalRate =
        typeof video.playbackRate === "number" ? video.playbackRate : NaN;
      const min = window.VSC.Constants.SPEED_LIMITS.MIN;
      if (!isNaN(rawExternalRate) && rawExternalRate <= min) {
        window.VSC.logger.debug(
          `Ignoring external ratechange below MIN: raw=${rawExternalRate}, MIN=${min}`,
        );
        return;
      }

      // Fight detection: if site changed speed away from what we set, decide whether
      // to fight back or accept. User-initiated changes (detected via gesture window)
      // are accepted immediately — this allows native site controls (e.g. YouTube's
      // speed menu or < > shortcuts) to coexist with our fight-back logic.
      const authoritativeSpeed = this.config.settings.lastSpeed;

      if (
        authoritativeSpeed &&
        Math.abs(video.playbackRate - authoritativeSpeed) > 0.01
      ) {
        const timeSinceGesture = event.timeStamp - this.lastUserInteractionAt;
        const isUserGesture =
          timeSinceGesture < EventManager.USER_GESTURE_WINDOW_MS;

        if (isUserGesture) {
          // User interacted with the site's native controls — accept immediately.
          // Treat as internal so lastSpeed and storage are updated to match intent.
          window.VSC.logger.info(
            `Accepting site speed change as user-intentional (gesture ${timeSinceGesture}ms ago): ${video.playbackRate}`,
          );
          this.fightCount = 0;
          if (this.fightTimer) {
            clearTimeout(this.fightTimer);
            this.fightTimer = null;
          }
          this.lastUserInteractionAt = 0;
          if (this.actionHandler) {
            this.actionHandler.adjustSpeed(video, video.playbackRate);
          }
          return;
        }

        this.fightCount++;

        // Reset fight count after a quiet period
        if (this.fightTimer) {
          clearTimeout(this.fightTimer);
        }
        this.fightTimer = setTimeout(() => {
          this.fightCount = 0;
          this.fightTimer = null;
        }, EventManager.FIGHT_WINDOW_MS);

        if (this.fightCount >= EventManager.MAX_FIGHT_COUNT) {
          // Surrender — accept the site's speed
          window.VSC.logger.info(
            `Fight detection: surrendering after ${this.fightCount} resets. Accepting site speed ${video.playbackRate}`,
          );
          this.fightCount = 0;
          // Fall through to accept the external change below
        } else {
          // Fight back — restore our speed with exponential backoff
          const cooldown = Math.min(
            EventManager.BASE_COOLDOWN_MS * Math.pow(2, this.fightCount - 1),
            EventManager.MAX_COOLDOWN_MS,
          );
          window.VSC.logger.info(
            `Fight detection: attempt ${this.fightCount}/${EventManager.MAX_FIGHT_COUNT}, re-applying ${authoritativeSpeed} (cooldown ${cooldown}ms)`,
          );
          window.VSC.siteHandlerManager.handleSpeedChange(
            video,
            authoritativeSpeed,
          );
          this.refreshCoolDown(cooldown);
          event.stopImmediatePropagation();
          return;
        }
      }

      if (this.actionHandler) {
        this.actionHandler.adjustSpeed(video, video.playbackRate, {
          source: "external",
        });
      }
    }

    /**
     * Start cooldown period to prevent event spam
     */
    refreshCoolDown(duration = EventManager.BASE_COOLDOWN_MS) {
      window.VSC.logger.debug(`Begin refreshCoolDown (${duration}ms)`);

      if (this.coolDown) {
        clearTimeout(this.coolDown);
      }

      this.coolDown = setTimeout(() => {
        this.coolDown = false;
      }, duration);

      window.VSC.logger.debug("End refreshCoolDown");
    }

    /**
     * Clean up all event listeners
     */
    cleanup() {
      this.listeners.forEach((eventList, doc) => {
        eventList.forEach(({ type, handler, useCapture }) => {
          try {
            doc.removeEventListener(type, handler, useCapture);
          } catch (e) {
            window.VSC.logger.warn(
              `Failed to remove event listener: ${e.message}`,
            );
          }
        });
      });

      this.listeners.clear();

      if (this.coolDown) {
        clearTimeout(this.coolDown);
        this.coolDown = false;
      }

      if (this.fightTimer) {
        clearTimeout(this.fightTimer);
        this.fightTimer = null;
      }
      this.fightCount = 0;
    }
  }

  /**
   * Compare binding modifiers against event modifier state.
   * @returns {boolean} True if all four modifiers match exactly.
   */
  EventManager.modifiersMatch = function (mods, ctrl, alt, meta, shift) {
    return (
      mods.ctrl === ctrl &&
      mods.alt === alt &&
      mods.meta === meta &&
      mods.shift === shift
    );
  };

  // Time window (ms) after a user interaction in which an external ratechange is
  // treated as user-intentional (site native controls) rather than fought back.
  EventManager.USER_GESTURE_WINDOW_MS = 300;

  // Base cooldown duration (ms) for ratechange handling; doubles each fight-back retry
  EventManager.BASE_COOLDOWN_MS = 200;

  // Maximum cooldown duration (ms) during fight-back backoff
  EventManager.MAX_COOLDOWN_MS = 2000;

  // Fight detection: surrender after this many rapid site-initiated resets
  EventManager.MAX_FIGHT_COUNT = 5;

  // Fight detection: reset fight count after this quiet period (ms)
  EventManager.FIGHT_WINDOW_MS = EventManager.MAX_COOLDOWN_MS + 1000;

  // Create singleton instance
  window.VSC.EventManager = EventManager;

  /* ===== src/utils/site-pattern.js ===== */
  /**
   * Site pattern matching utilities.
   *
   * Shared matching engine used by siteRules (structured array) and the legacy
   * blacklist (newline-separated string).  Pure ES module — no DOM dependencies.
   */

  const regStrip = /^[\r\t\f\v ]+|[\r\t\f\v ]+$/gm;
  const regEndsWithFlags = /\/(?!.*(.).*\1)[gimsuy]*$/;
  const escapeRegExp = (str) => str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");

  /**
   * Compile a pattern string into a RegExp.
   *
   * Supports three forms:
   *   1. Regex notation:  /pattern/flags
   *   2. Domain literal:  youtube.com  →  /(^|\.|\/\/)youtube\.com(\/|:|$)/
   *   3. Substring:       any other string  →  escaped literal match
   *
   * @param {string} raw - Pattern string (trimmed)
   * @returns {RegExp|null} Compiled regex, or null if invalid
   */
  function compilePattern(raw) {
    const pattern = raw.replace(regStrip, "");
    if (pattern.length === 0) {
      return null;
    }

    if (pattern.startsWith("/")) {
      try {
        const parts = pattern.split("/");
        if (parts.length < 3) {
          return null;
        }

        const hasFlags = regEndsWithFlags.test(pattern);
        const flags = hasFlags ? parts.pop() : "";
        const regex = parts.slice(1, hasFlags ? undefined : -1).join("/");

        if (!regex) {
          return null;
        }
        return new RegExp(regex, flags);
      } catch {
        return null;
      }
    }

    const escaped = escapeRegExp(pattern);
    const looksLikeDomain = pattern.includes(".") && !pattern.includes("/");

    if (looksLikeDomain) {
      return new RegExp(`(^|\\.|//)${escaped}(\\/|:|$)`);
    }
    return new RegExp(escaped);
  }

  /**
   * Match a URL against an array of site rule objects.
   * Returns the first rule whose pattern matches, or null.
   *
   * @param {Array<{pattern: string}>} rules - Rule objects (must have a `pattern` field)
   * @param {string} href - URL to test
   * @returns {Object|null} First matching rule, or null
   */
  function matchSiteRule(rules, href) {
    if (!rules || !rules.length) {
      return null;
    }

    for (const rule of rules) {
      const regexp = compilePattern(rule.pattern || "");
      if (regexp && regexp.test(href)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Backward-compatible wrapper: check a legacy newline-separated blacklist string.
   *
   * @param {string} blacklist - Newline-separated pattern string
   * @param {string} href - URL to test
   * @returns {boolean} true if any pattern matches
   */
  // Expose on window.VSC for page-context consumers (settings.js).
  window.VSC = window.VSC || {};
  window.VSC.matchSiteRule = matchSiteRule;

  function isBlacklisted(blacklist, href) {
    if (!blacklist) {
      return false;
    }

    const rules = blacklist
      .split("\n")
      .map((line) => ({ pattern: line.replace(regStrip, "") }))
      .filter((r) => r.pattern.length > 0);

    return matchSiteRule(rules, href) !== null;
  }

  /* ===== userscript storage adapter ===== */
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

  /* ===== src/core/settings.js ===== */
  /**
   * Settings management for HML5SpeedController
   */

  window.VSC = window.VSC || {};

  if (!window.VSC.VideoSpeedConfig) {
    class VideoSpeedConfig {
      constructor() {
        this.settings = { ...window.VSC.Constants.DEFAULT_SETTINGS };
        this.pendingSave = null;
        this.saveTimer = null;
        this.SAVE_DELAY = 1000; // 1 second
        this._loaded = false;
        // Tracks the last speed value we wrote to storage, so the onChanged
        // listener can distinguish our own echo from a genuine external write.
        this._lastWrittenSpeed = null;

        // Keep in-memory settings fresh when other contexts write to storage.
        // This prevents the stale-read problem where e.g. the options page holds
        // an old lastSpeed while the content script has already updated it.
        this._setupStorageListener();
      }

      /**
       * Listen for storage changes from other contexts and update in-memory state.
       * @private
       */
      _setupStorageListener() {
        try {
          window.VSC.StorageManager.onChanged((changes) => {
            for (const [key, change] of Object.entries(changes)) {
              if (!(key in this.settings) || change.newValue === undefined) {
                continue;
              }

              // Self-echo guard: skip our own debounced speed write echoing back.
              // Without this, the echo reverts in-memory state and mis-cancels timers.
              if (key === "lastSpeed") {
                const isSelfEcho =
                  this._lastWrittenSpeed !== null &&
                  change.newValue === this._lastWrittenSpeed;
                this._lastWrittenSpeed = null; // always clear — stale token is worse than missing one
                if (isSelfEcho) {
                  continue;
                }
              }

              this.settings[key] = change.newValue;

              // External lastSpeed write while we have a pending debounce:
              // cancel our stale timer — the external value is more recent.
              if (key === "lastSpeed" && this.saveTimer) {
                clearTimeout(this.saveTimer);
                this.saveTimer = null;
                this.pendingSave = null;
              }

              window.VSC.logger.debug(
                `Settings updated from storage change: ${key}`,
              );
            }
          });
        } catch (e) {
          // StorageManager may not be fully available yet (e.g. during tests).
          // Non-fatal — the listener just won't be active.
          window.VSC.logger.debug(
            `Could not set up storage change listener: ${e.message}`,
          );
        }
      }

      /**
       * Load settings from userscript storage or pre-injected settings
       * @returns {Promise<Object>} Loaded settings
       */
      async load() {
        try {
          // Use StorageManager which handles both contexts automatically.
          // controllerCSS: null fetches the legacy key for one-time migration (not in DEFAULT_SETTINGS).
          const storage = await window.VSC.StorageManager.get({
            ...window.VSC.Constants.DEFAULT_SETTINGS,
            controllerCSS: null,
          });

          // null = bridge signaled abort (site disabled/blacklisted)
          if (storage === null) {
            this.settings._abort = true;
            return;
          }

          this._loaded = true;

          // Handle key bindings migration/initialization
          this.settings.keyBindings = (
            storage.keyBindings ||
            window.VSC.Constants.DEFAULT_SETTINGS.keyBindings
          ).map(VideoSpeedConfig.normalizeKeyBinding);

          if (!storage.keyBindings || storage.keyBindings.length === 0) {
            window.VSC.logger.info(
              "First initialization - setting up default key bindings",
            );
            this.settings.keyBindings = [
              ...window.VSC.Constants.DEFAULT_SETTINGS.keyBindings,
            ];
            await this.save({ keyBindings: this.settings.keyBindings });
          }

          // Migrate legacy blacklist → siteRules (one-shot)
          if (
            storage.blacklist !== null &&
            storage.blacklist !== undefined &&
            !storage.siteRules
          ) {
            const regStrip = /^[\r\t\f\v ]+|[\r\t\f\v ]+$/gm;
            storage.siteRules = storage.blacklist
              .split("\n")
              .map((l) => l.replace(regStrip, ""))
              .filter(Boolean)
              .map((pattern) => ({ pattern, enabled: false, speed: null }));
            await this.save({ siteRules: storage.siteRules });
            // Keep blacklist in storage for backward compat with legacy controller
            // versions that may be synced across devices. Harmless dead weight.
            window.VSC.logger.info("Migrated blacklist to siteRules");
          } else if (
            storage.blacklist !== null &&
            storage.blacklist !== undefined &&
            storage.siteRules
          ) {
            // Both exist — this is the normal state for all migrated users.
            // blacklist is intentionally kept in storage for sync compat with older
            // legacy settings on other devices (see bridge fix: blacklist is only
            // checked pre-migration when siteRules is absent).
            // blacklist remains only for compatibility with synced legacy settings.
          }

          // Apply siteRules
          this.settings.siteRules =
            storage.siteRules || window.VSC.Constants.DEFAULT_SETTINGS.siteRules;

          // Match current URL against site rules to derive per-site default speed.
          // matchSiteRule is exposed on window.VSC by inject-entry.js; guard for
          // test environments where it may not be available.
          if (window.VSC.matchSiteRule) {
            const matched = window.VSC.matchSiteRule(
              this.settings.siteRules,
              window.location.href,
            );
            if (
              matched &&
              matched.speed !== null &&
              matched.speed !== undefined
            ) {
              this.settings.siteDefaultSpeed = matched.speed;
              window.VSC.logger.info(
                `Site rule matched: pattern="${matched.pattern}", speed=${matched.speed}`,
              );
            }
          }

          // Apply loaded settings
          this.settings.rememberSpeed = Boolean(storage.rememberSpeed);

          // lastSpeed = null means "no user choice yet this session."
          // getTargetSpeed() falls through to siteDefaultSpeed or 1.0.
          //
          // Priority on fresh load:
          //   1. siteDefaultSpeed (per-site rule) — always wins if configured
          //   2. lastSpeed from storage (rememberSpeed=true, no per-site rule)
          //   3. null → baseline 1.0
          if (this.settings.siteDefaultSpeed) {
            this.settings.lastSpeed = null;
          } else if (this.settings.rememberSpeed) {
            this.settings.lastSpeed = Number(storage.lastSpeed) || null;
          } else {
            this.settings.lastSpeed = null;
          }
          this.settings.exclusiveKeys = Boolean(storage.exclusiveKeys);
          this.settings.audioBoolean = Boolean(storage.audioBoolean);
          this.settings.startHidden = Boolean(storage.startHidden);
          this.settings.controllerOpacity = Number(storage.controllerOpacity);
          this.settings.controllerButtonSize = Number(
            storage.controllerButtonSize,
          );
          // One-time migration: drop legacy controllerCSS key, reset to new model.
          if (storage.controllerCSS !== null) {
            window.VSC.StorageManager.remove(["controllerCSS"]);
          }
          this.settings.customCSS = storage.customCSS ?? "";
          this.settings.logLevel = Number(
            storage.logLevel || window.VSC.Constants.DEFAULT_SETTINGS.logLevel,
          );

          // Update logger verbosity
          window.VSC.logger.setVerbosity(this.settings.logLevel);

          window.VSC.logger.info("Settings loaded successfully");
          return this.settings;
        } catch (error) {
          window.VSC.logger.error(`Failed to load settings: ${error.message}`);
          return window.VSC.Constants.DEFAULT_SETTINGS;
        }
      }

      /**
       * Save settings to userscript storage
       *
       * IMPORTANT: Only the keys present in newSettings are written to storage.
       * This avoids the "stale full-blob write" race condition where two contexts
       * (e.g. options page + content script) each hold their own in-memory copy
       * and overwrite each other's changes.  chrome.storage.sync.set({key: val})
       * atomically merges — it updates only the supplied keys and leaves the
       * rest untouched.
       *
       * In-memory settings are updated immediately regardless of persistence
       * outcome — the current session should always reflect the user's intent.
       * Returns false only when the storage write observably fails (options page
       * context with direct chrome.storage access). In page context, the
       * postMessage bridge is fire-and-forget so failures are invisible here.
       *
       * @param {Object} newSettings - Settings to save (only these keys are written)
       * @returns {Promise<boolean>} true if persisted (or debounced), false on storage failure
       */
      async save(newSettings = {}) {
        const keys = Object.keys(newSettings);
        if (keys.length === 0) {
          return true;
        }

        // Guard: refuse to write before load() has read from storage.
        // Without this, a save() during initialization writes DEFAULT_SETTINGS
        // to storage, silently clobbering the user's real persisted values.
        if (!this._loaded) {
          window.VSC.logger.error(
            "save() called before load() — refusing to overwrite user data with defaults",
          );
          return false;
        }

        // Update in-memory settings immediately
        this.settings = { ...this.settings, ...newSettings };

        // Check if this is a speed-only update that should be debounced
        if (keys.length === 1 && keys[0] === "lastSpeed") {
          this.pendingSave = newSettings.lastSpeed;

          if (this.saveTimer) {
            clearTimeout(this.saveTimer);
          }

          this.saveTimer = setTimeout(async () => {
            const speedToSave = this.pendingSave;
            this.pendingSave = null;
            this.saveTimer = null;

            this._lastWrittenSpeed = speedToSave;
            try {
              await window.VSC.StorageManager.set({ lastSpeed: speedToSave });
              window.VSC.logger.info(
                "Debounced speed setting saved successfully",
              );
            } catch (error) {
              this._lastWrittenSpeed = null;
              window.VSC.logger.error(
                `Failed to persist speed: ${error.message}`,
              );
            }
          }, this.SAVE_DELAY);

          return true; // in-memory updated, persistence is deferred
        }

        try {
          await window.VSC.StorageManager.set(newSettings);
        } catch (error) {
          window.VSC.logger.error(`Failed to save settings: ${error.message}`);
          return false;
        }

        if (newSettings.logLevel !== undefined) {
          window.VSC.logger.setVerbosity(this.settings.logLevel);
        }

        window.VSC.logger.info("Settings saved successfully");
        return true;
      }

      /**
       * Get a specific key binding
       * @param {string} action - Action name
       * @param {string} property - Property to get (default: 'value')
       * @returns {*} Key binding property value
       */
      getKeyBinding(action, property = "value") {
        try {
          const binding = this.settings.keyBindings.find(
            (item) => item.action === action,
          );
          return binding ? binding[property] : false;
        } catch (e) {
          window.VSC.logger.error(
            `Failed to get key binding for ${action}: ${e.message}`,
          );
          return false;
        }
      }

      /**
       * Set a key binding value with validation
       * @param {string} action - Action name
       * @param {*} value - Value to set
       */
      setKeyBinding(action, value) {
        try {
          const binding = this.settings.keyBindings.find(
            (item) => item.action === action,
          );
          if (!binding) {
            window.VSC.logger.warn(`No key binding found for action: ${action}`);
            return;
          }

          // Validate speed-related values to prevent corruption
          if (["reset", "fast", "slower", "faster"].includes(action)) {
            if (typeof value !== "number" || isNaN(value)) {
              window.VSC.logger.warn(
                `Invalid numeric value for ${action}: ${value}`,
              );
              return;
            }
          }

          binding.value = value;
          window.VSC.logger.debug(`Updated key binding ${action} to ${value}`);
        } catch (e) {
          window.VSC.logger.error(
            `Failed to set key binding for ${action}: ${e.message}`,
          );
        }
      }

      /**
       * Normalize a key binding's modifiers to strict booleans.
       * Strips the modifiers object entirely when all values are falsy.
       * Defensive against corrupt storage data (e.g., modifiers: { shift: 1 }).
       * @param {Object} binding
       * @returns {Object} Sanitized binding (shallow copy)
       * @private
       */
      static normalizeKeyBinding(binding) {
        if (!binding || !binding.modifiers) {
          return binding;
        }
        const m = binding.modifiers;
        const normalized = {
          shift: Boolean(m.shift),
          ctrl: Boolean(m.ctrl),
          alt: Boolean(m.alt),
          meta: Boolean(m.meta),
        };
        const result = { ...binding };
        if (
          normalized.shift ||
          normalized.ctrl ||
          normalized.alt ||
          normalized.meta
        ) {
          result.modifiers = normalized;
        } else {
          delete result.modifiers;
        }
        return result;
      }
    }

    // Create singleton instance
    window.VSC.videoSpeedConfig = new VideoSpeedConfig();

    // Export constructor for testing
    window.VSC.VideoSpeedConfig = VideoSpeedConfig;
  }

  /* ===== src/core/state-manager.js ===== */
  /**
   * HML5SpeedController State Manager
   * Tracks media elements for popup and keyboard commands.
   */

  window.VSC = window.VSC || {};

  class VSCStateManager {
    constructor() {
      // Map of controllerId → controller instance
      this.controllers = new Map();

      window.VSC.logger?.debug("VSCStateManager initialized");
    }

    /**
     * Register a new controller
     * @param {VideoController} controller - Controller instance to register
     */
    registerController(controller) {
      if (!controller || !controller.controllerId) {
        window.VSC.logger?.warn("Invalid controller registration attempt");
        return;
      }

      // Store controller info for compatibility with tests
      const controllerInfo = {
        controller: controller,
        element: controller.video,
        tagName: controller.video?.tagName,
        videoSrc: controller.video?.src || controller.video?.currentSrc,
        created: Date.now(),
      };

      this.controllers.set(controller.controllerId, controllerInfo);
      window.VSC.logger?.debug(
        `Controller registered: ${controller.controllerId}`,
      );
    }

    /**
     * Unregister a controller
     * @param {string} controllerId - ID of controller to unregister
     */
    unregisterController(controllerId) {
      if (this.controllers.has(controllerId)) {
        this.controllers.delete(controllerId);
        window.VSC.logger?.debug(`Controller unregistered: ${controllerId}`);
      }
    }

    /**
     * Get all registered media elements
     * @returns {Array<HTMLMediaElement>} Array of media elements
     */
    getAllMediaElements() {
      const elements = [];

      // Clean up disconnected controllers while iterating
      for (const [id, info] of this.controllers) {
        const video = info.controller?.video || info.element;
        if (video && video.isConnected) {
          elements.push(video);
        } else {
          // Remove disconnected controller
          this.controllers.delete(id);
        }
      }

      return elements;
    }

    /**
     * Get a media element by controller ID
     * @param {string} controllerId - Controller ID
     * @returns {HTMLMediaElement|null} Media element or null
     */
    getMediaByControllerId(controllerId) {
      const info = this.controllers.get(controllerId);
      return info?.controller?.video || info?.element || null;
    }

    /**
     * Get the first available media element
     * @returns {HTMLMediaElement|null} First media element or null
     */
    getFirstMedia() {
      const elements = this.getAllMediaElements();
      return elements[0] || null;
    }

    /**
     * Check if any controllers are registered
     * @returns {boolean} True if controllers exist
     */
    hasControllers() {
      return this.controllers.size > 0;
    }

    /**
     * Compatibility method - same as unregisterController
     * @param {string} controllerId - ID of controller to remove
     */
    removeController(controllerId) {
      this.unregisterController(controllerId);
    }

    /**
     * Compatibility method - same as getAllMediaElements
     * @returns {Array<HTMLMediaElement>} Array of media elements
     */
    getControlledElements() {
      return this.getAllMediaElements();
    }
  }

  // Create singleton instance
  window.VSC.StateManager = VSCStateManager;
  window.VSC.stateManager = new VSCStateManager();

  window.VSC.logger?.info("State Manager module loaded");

  /* ===== src/observers/media-observer.js ===== */
  /**
   * Media element observer for finding and tracking video/audio elements
   */

  window.VSC = window.VSC || {};

  class MediaElementObserver {
    constructor(config, siteHandler) {
      this.config = config;
      this.siteHandler = siteHandler;
    }

    /**
     * Scan document for existing media elements
     * @param {Document} document - Document to scan
     * @returns {Array<HTMLMediaElement>} Found media elements
     */
    scanForMedia(document) {
      const mediaElements = [];
      const audioEnabled = this.config.settings.audioBoolean;
      const mediaTagSelector = audioEnabled ? "video,audio" : "video";

      // Find regular media elements
      const regularMedia = Array.from(
        document.querySelectorAll(mediaTagSelector),
      );
      mediaElements.push(...regularMedia);

      // Find media elements in shadow DOMs recursively
      function findShadowMedia(root, selector) {
        const results = [];
        // Add any matching elements in current shadow root
        results.push(...root.querySelectorAll(selector));
        // Recursively check all elements with shadow roots
        root.querySelectorAll("*").forEach((element) => {
          if (element.shadowRoot) {
            results.push(...findShadowMedia(element.shadowRoot, selector));
          }
        });
        return results;
      }

      const shadowMedia = findShadowMedia(document, mediaTagSelector);
      mediaElements.push(...shadowMedia);

      // Find site-specific media elements
      const siteSpecificMedia = this.siteHandler.detectSpecialVideos(document);
      mediaElements.push(...siteSpecificMedia);

      // Filter out ignored videos
      const filteredMedia = mediaElements.filter((media) => {
        return !this.siteHandler.shouldIgnoreVideo(media);
      });

      window.VSC.logger.info(
        `Found ${filteredMedia.length} media elements (${mediaElements.length} total, ${mediaElements.length - filteredMedia.length} filtered out)`,
      );
      return filteredMedia;
    }

    /**
     * Lightweight scan that avoids expensive shadow DOM traversal
     * Used during initial load to avoid blocking page performance
     * @param {Document} document - Document to scan
     * @returns {Array<HTMLMediaElement>} Found media elements
     */
    scanForMediaLight(document) {
      const mediaElements = [];
      const audioEnabled = this.config.settings.audioBoolean;
      const mediaTagSelector = audioEnabled ? "video,audio" : "video";

      try {
        // Only do basic DOM query, no shadow DOM traversal
        const regularMedia = Array.from(
          document.querySelectorAll(mediaTagSelector),
        );
        mediaElements.push(...regularMedia);

        // Find site-specific media elements (usually lightweight)
        const siteSpecificMedia = this.siteHandler.detectSpecialVideos(document);
        mediaElements.push(...siteSpecificMedia);

        // Filter out ignored videos
        const filteredMedia = mediaElements.filter((media) => {
          return !this.siteHandler.shouldIgnoreVideo(media);
        });

        window.VSC.logger.info(
          `Light scan found ${filteredMedia.length} media elements (${mediaElements.length} total, ${mediaElements.length - filteredMedia.length} filtered out)`,
        );
        return filteredMedia;
      } catch (error) {
        window.VSC.logger.error(`Light media scan failed: ${error.message}`);
        return [];
      }
    }

    /**
     * Scan iframes for media elements
     * @param {Document} document - Document to scan
     * @returns {Array<HTMLMediaElement>} Found media elements in iframes
     */
    scanIframes(document) {
      const mediaElements = [];
      const frameTags = document.getElementsByTagName("iframe");

      Array.prototype.forEach.call(frameTags, (frame) => {
        // Ignore frames we don't have permission to access (different origin)
        try {
          const childDocument = frame.contentDocument;
          if (childDocument) {
            const iframeMedia = this.scanForMedia(childDocument);
            mediaElements.push(...iframeMedia);
            window.VSC.logger.debug(
              `Found ${iframeMedia.length} media elements in iframe`,
            );
          }
        } catch (e) {
          window.VSC.logger.debug(
            `Cannot access iframe content (cross-origin): ${e.message}`,
          );
        }
      });

      return mediaElements;
    }

    /**
     * Get media elements using site-specific container selectors
     * @param {Document} document - Document to scan
     * @returns {Array<HTMLMediaElement>} Found media elements
     */
    scanSiteSpecificContainers(document) {
      const mediaElements = [];
      const containerSelectors = this.siteHandler.getVideoContainerSelectors();
      const audioEnabled = this.config.settings.audioBoolean;

      containerSelectors.forEach((selector) => {
        try {
          const containers = document.querySelectorAll(selector);
          containers.forEach((container) => {
            const containerMedia = window.VSC.DomUtils.findMediaElements(
              container,
              audioEnabled,
            );
            mediaElements.push(...containerMedia);
          });
        } catch (e) {
          window.VSC.logger.warn(`Invalid selector "${selector}": ${e.message}`);
        }
      });

      return mediaElements;
    }

    /**
     * Comprehensive scan for all media elements
     * @param {Document} document - Document to scan
     * @returns {Array<HTMLMediaElement>} All found media elements
     */
    scanAll(document) {
      const allMedia = [];

      // Regular scan
      const regularMedia = this.scanForMedia(document);
      allMedia.push(...regularMedia);

      // Site-specific container scan
      const containerMedia = this.scanSiteSpecificContainers(document);
      allMedia.push(...containerMedia);

      // Iframe scan
      const iframeMedia = this.scanIframes(document);
      allMedia.push(...iframeMedia);

      // Remove duplicates
      const uniqueMedia = [...new Set(allMedia)];

      window.VSC.logger.info(
        `Total unique media elements found: ${uniqueMedia.length}`,
      );
      return uniqueMedia;
    }

    /**
     * Check if media element is valid for controller attachment
     * @param {HTMLMediaElement} media - Media element to check
     * @returns {boolean} True if valid
     */
    isValidMediaElement(media) {
      // Skip videos that are not in the DOM
      if (!media.isConnected) {
        window.VSC.logger.debug("Video not in DOM");
        return false;
      }

      // Skip audio elements when audio support is disabled
      if (media.tagName === "AUDIO" && !this.config.settings.audioBoolean) {
        window.VSC.logger.debug("Audio element rejected - audioBoolean disabled");
        return false;
      }

      // Let site handler have final say on whether to ignore this video
      if (this.siteHandler.shouldIgnoreVideo(media)) {
        window.VSC.logger.debug("Video ignored by site handler");
        return false;
      }

      // Accept all connected media elements that pass site handler validation
      // Visibility and size will be handled by controller initialization
      return true;
    }

    /**
     * Check if media element should start with hidden controller
     * @param {HTMLMediaElement} media - Media element to check
     * @returns {boolean} True if controller should start hidden
     */
    shouldStartHidden(media) {
      // For audio elements, only hide controller if audio support is disabled
      // Audio players are often intentionally invisible but still functional
      if (media.tagName === "AUDIO") {
        if (!this.config.settings.audioBoolean) {
          window.VSC.logger.debug(
            "Audio controller hidden - audio support disabled",
          );
          return true;
        }

        // Audio elements can be functional even when invisible
        // Only hide if the audio element is explicitly disabled or has no functionality
        if (media.disabled || media.style.pointerEvents === "none") {
          window.VSC.logger.debug(
            "Audio controller hidden - element disabled or no pointer events",
          );
          return true;
        }

        // Keep audio controllers visible even for hidden audio elements
        window.VSC.logger.debug(
          "Audio controller will start visible (audio elements can be invisible but functional)",
        );
        return false;
      }

      // For video elements, check visibility - only hide controllers for truly invisible media elements
      const style = window.getComputedStyle(media);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        window.VSC.logger.debug(
          "Video not visible, controller will start hidden",
        );
        return true;
      }

      // All visible media elements get visible controllers regardless of size
      return false;
    }

    /**
     * Find the best parent element for controller positioning
     * @param {HTMLMediaElement} media - Media element
     * @returns {HTMLElement} Parent element for positioning
     */
    findControllerParent(media) {
      const positioning = this.siteHandler.getControllerPosition(
        media.parentElement,
        media,
      );
      return positioning.targetParent || media.parentElement;
    }
  }

  // Create singleton instance
  window.VSC.MediaElementObserver = MediaElementObserver;

  /* ===== src/observers/mutation-observer.js ===== */
  /**
   * DOM mutation observer for detecting video elements
   */

  window.VSC = window.VSC || {};

  class VideoMutationObserver {
    constructor(config, onVideoFound, onVideoRemoved, mediaObserver) {
      this.config = config;
      this.onVideoFound = onVideoFound;
      this.onVideoRemoved = onVideoRemoved;
      this.mediaObserver = mediaObserver;
      this.observer = null;
      this.shadowObservers = new Set();
    }

    /**
     * Start observing DOM mutations
     * @param {Document} document - Document to observe
     */
    start(document) {
      this.observer = new MutationObserver((mutations) => {
        // Process mutations when the browser is genuinely idle — no forced timeout.
        // Sites do async post-load init that's sensitive to DOM insertions; a
        // forced timeout can fire during that window.
        requestIdleCallback(() => {
          this.processMutations(mutations);
        });
      });

      const observerOptions = {
        attributeFilter: ["aria-hidden", "data-focus-method", "style", "class"],
        childList: true,
        subtree: true,
      };

      this.observer.observe(document, observerOptions);
      window.VSC.logger.debug("Video mutation observer started");
    }

    /**
     * Process mutation events
     * @param {Array<MutationRecord>} mutations - Mutation records
     * @private
     */
    processMutations(mutations) {
      mutations.forEach((mutation) => {
        switch (mutation.type) {
          case "childList":
            this.processChildListMutation(mutation);
            break;
          case "attributes":
            this.processAttributeMutation(mutation);
            break;
        }
      });
    }

    /**
     * Process child list mutations (added/removed nodes)
     * @param {MutationRecord} mutation - Mutation record
     * @private
     */
    processChildListMutation(mutation) {
      // Handle added nodes
      mutation.addedNodes.forEach((node) => {
        // Only process element nodes (nodeType 1)
        if (!node || node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }

        if (node === document.documentElement) {
          // Document was replaced (e.g., watch.sling.com uses document.write)
          window.VSC.logger.debug("Document was replaced, reinitializing");
          this.onDocumentReplaced();
          return;
        }

        this.checkForVideoAndShadowRoot(
          node,
          node.parentNode || mutation.target,
          true,
        );
      });

      // Handle removed nodes
      mutation.removedNodes.forEach((node) => {
        // Only process element nodes (nodeType 1)
        if (!node || node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }
        this.checkForVideoAndShadowRoot(
          node,
          node.parentNode || mutation.target,
          false,
        );
      });
    }

    /**
     * Process attribute mutations
     * @param {MutationRecord} mutation - Mutation record
     * @private
     */
    processAttributeMutation(mutation) {
      // Handle style and class changes that might affect video visibility
      if (
        mutation.attributeName === "style" ||
        mutation.attributeName === "class"
      ) {
        this.handleVisibilityChanges(mutation.target);
      }

      // Handle special cases like Apple TV+ player
      if (
        (mutation.target.attributes["aria-hidden"] &&
          mutation.target.attributes["aria-hidden"].value === "false") ||
        mutation.target.nodeName === "APPLE-TV-PLUS-PLAYER"
      ) {
        const flattenedNodes = window.VSC.DomUtils.getShadow(document.body);
        const videoNodes = flattenedNodes.filter((x) => x.tagName === "VIDEO");

        for (const node of videoNodes) {
          // Only add vsc the first time for the apple-tv case
          if (node.vsc && mutation.target.nodeName === "APPLE-TV-PLUS-PLAYER") {
            continue;
          }

          if (node.vsc) {
            node.vsc.remove();
          }

          this.checkForVideoAndShadowRoot(
            node,
            node.parentNode || mutation.target,
            true,
          );
        }
      }
    }

    /**
     * Handle visibility changes on elements that might contain videos
     * @param {Element} element - Element that had style/class changes
     * @private
     */
    handleVisibilityChanges(element) {
      // If the element itself is a video
      if (
        element.tagName === "VIDEO" ||
        (element.tagName === "AUDIO" && this.config.settings.audioBoolean)
      ) {
        this.recheckVideoElement(element);
        return;
      }

      // Check if element contains videos
      const audioEnabled = this.config.settings.audioBoolean;
      const mediaTagSelector = audioEnabled ? "video,audio" : "video";
      const videos = element.querySelectorAll
        ? element.querySelectorAll(mediaTagSelector)
        : [];

      videos.forEach((video) => {
        this.recheckVideoElement(video);
      });
    }

    /**
     * Re-check if a video element should have a controller attached
     * @param {HTMLMediaElement} video - Video element to recheck
     * @private
     */
    recheckVideoElement(video) {
      if (!this.mediaObserver) {
        return;
      }

      if (video.vsc) {
        // Video already has controller, check if it should be removed or just hidden
        if (!this.mediaObserver.isValidMediaElement(video)) {
          window.VSC.logger.debug("Video became invalid, removing controller");
          video.vsc.remove();
          video.vsc = null;
        } else {
          // Video is still valid, update visibility based on current state
          video.vsc.updateVisibility();
        }
      } else {
        // Video doesn't have controller, check if it should get one
        if (this.mediaObserver.isValidMediaElement(video)) {
          window.VSC.logger.debug("Video became valid, attaching controller");
          this.onVideoFound(video, video.parentElement || video.parentNode);
        }
      }
    }

    /**
     * Check if node is or contains video elements
     * @param {Node} node - Node to check
     * @param {Node} parent - Parent node
     * @param {boolean} added - True if node was added, false if removed
     * @private
     */
    checkForVideoAndShadowRoot(node, parent, added) {
      // Only proceed with removal if node is missing from DOM
      if (!added && document.body?.contains(node)) {
        return;
      }

      if (
        node.nodeName === "VIDEO" ||
        (node.nodeName === "AUDIO" && this.config.settings.audioBoolean)
      ) {
        if (added) {
          this.onVideoFound(node, parent);
        } else {
          if (node.vsc) {
            this.onVideoRemoved(node);
          }
        }
      } else {
        this.processNodeChildren(node, parent, added);
      }
    }

    /**
     * Process children of a node recursively
     * @param {Node} node - Node to process
     * @param {Node} parent - Parent node
     * @param {boolean} added - True if node was added
     * @private
     */
    processNodeChildren(node, parent, added) {
      let children = [];

      // Handle shadow DOM
      if (node.shadowRoot) {
        this.observeShadowRoot(node.shadowRoot);
        children = Array.from(node.shadowRoot.children);
      }

      // Handle regular children
      if (node.children) {
        children = [...children, ...Array.from(node.children)];
      }

      // Process all children
      for (const child of children) {
        this.checkForVideoAndShadowRoot(child, child.parentNode || parent, added);
      }
    }

    /**
     * Set up observer for shadow root
     * @param {ShadowRoot} shadowRoot - Shadow root to observe
     * @private
     */
    observeShadowRoot(shadowRoot) {
      if (this.shadowObservers.has(shadowRoot)) {
        return; // Already observing
      }

      const shadowObserver = new MutationObserver((mutations) => {
        requestIdleCallback(
          () => {
            this.processMutations(mutations);
          },
          { timeout: 500 },
        );
      });

      const observerOptions = {
        attributeFilter: ["aria-hidden", "data-focus-method"],
        childList: true,
        subtree: true,
      };

      shadowObserver.observe(shadowRoot, observerOptions);
      this.shadowObservers.add(shadowRoot);

      window.VSC.logger.debug("Shadow root observer added");
    }

    /**
     * Handle document replacement
     * @private
     */
    onDocumentReplaced() {
      // This callback should trigger reinitialization
      window.VSC.logger.warn(
        "Document replacement detected - full reinitialization needed",
      );
    }

    /**
     * Stop observing and clean up
     */
    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      // Clean up shadow observers
      this.shadowObservers.forEach((_shadowRoot) => {
        // Note: We can't access the observer directly, but disconnecting the main
        // observer should handle most cases. Shadow observers will be garbage collected.
      });
      this.shadowObservers.clear();

      window.VSC.logger.debug("Video mutation observer stopped");
    }
  }

  // Create singleton instance
  window.VSC.VideoMutationObserver = VideoMutationObserver;

  /* ===== src/core/action-handler.js ===== */
  /**
   * Action handling system for HML5SpeedController
   *
   */

  window.VSC = window.VSC || {};

  class ActionHandler {
    constructor(config, eventManager) {
      this.config = config;
      this.eventManager = eventManager;
    }

    /**
     * Execute an action on media elements
     * @param {string} action - Action to perform
     * @param {*} value - Action value
     * @param {Event} e - Event object (optional)
     */
    runAction(action, value, e) {
      // Use state manager for complete media discovery (includes shadow DOM)
      const mediaTags = window.VSC.stateManager
        ? window.VSC.stateManager.getControlledElements()
        : []; // No fallback - state manager should always be available

      // Get the controller that was used if called from a button press event
      let targetController = null;
      if (e) {
        targetController = e.target.getRootNode().host;
      }

      mediaTags.forEach((v) => {
        const controller = v.vsc?.div;

        if (!controller) {
          return;
        }

        // Don't change video speed if the video has a different controller
        // Only apply this check for button clicks (when targetController is set)
        if (e && targetController && !(targetController === controller)) {
          return;
        }

        if (!v.classList.contains("vsc-cancelled")) {
          this.executeAction(action, value, v, e);
        }
      });
    }

    /**
     * Execute specific action on a video element
     * @param {string} action - Action to perform
     * @param {*} value - Action value
     * @param {HTMLMediaElement} video - Video element
     * @param {Event} e - Event object (optional)
     * @private
     */
    executeAction(action, value, video, e) {
      switch (action) {
        case "rewind":
          window.VSC.logger.debug("Rewind");
          this.seek(video, -value);
          break;

        case "advance":
          window.VSC.logger.debug("Fast forward");
          this.seek(video, value);
          break;

        case "faster": {
          window.VSC.logger.debug("Increase speed");
          this.adjustSpeed(video, value, { relative: true });
          break;
        }

        case "slower": {
          window.VSC.logger.debug("Decrease speed");
          this.adjustSpeed(video, -value, { relative: true });
          break;
        }

        case "reset":
          window.VSC.logger.debug("Reset speed");
          this.resetSpeed(video, value, this.config.getKeyBinding("fast"));
          break;

        case "display": {
          window.VSC.logger.debug("Display action triggered");
          const controller = video.vsc.div;

          if (!controller) {
            window.VSC.logger.error("No controller found for video");
            return;
          }

          // Clear any pending flash timer before toggling
          if (controller.flashTimer !== undefined) {
            clearTimeout(controller.flashTimer);
            controller.flashTimer = undefined;
          }

          controller.classList.toggle("vsc-hidden");
          // vsc-manual means "user has expressed intent about this controller's
          // visibility." Set on first toggle, never cleared for the lifetime of
          // the controller. This protects against YouTube autohide overriding
          // the user's show intent, and prevents flash from overriding hide intent.
          controller.classList.add("vsc-manual");

          if (controller.classList.contains("vsc-hidden")) {
            // User is hiding — also remove any pending flash override
            controller.classList.remove("vsc-show");
          }
          break;
        }

        case "blink":
          window.VSC.logger.debug("Showing controller momentarily");
          this.flashController(video.vsc.div, value);
          break;

        case "drag":
          window.VSC.DragHandler.handleDrag(video, e);
          break;

        case "fast":
          window.VSC.logger.debug("Preferred speed");
          this.resetSpeed(video, value, this.config.getKeyBinding("reset"));
          break;

        case "pause":
          this.pause(video);
          break;

        case "muted":
          this.muted(video);
          break;

        case "louder":
          this.volumeUp(video, value);
          break;

        case "softer":
          this.volumeDown(video, value);
          break;

        case "mark":
          this.setMark(video);
          break;

        case "jump":
          this.jumpToMark(video);
          break;

        case "SET_SPEED":
          window.VSC.logger.info("Setting speed to:", value);
          this.adjustSpeed(video, value, { source: "internal" });
          break;

        case "ADJUST_SPEED":
          window.VSC.logger.info("Adjusting speed by:", value);
          this.adjustSpeed(video, value, {
            relative: true,
            source: "internal",
          });
          break;

        case "RESET_SPEED": {
          window.VSC.logger.info("Resetting speed");
          const preferredSpeed = this.config.getKeyBinding("fast") || 1.0;
          this.adjustSpeed(video, preferredSpeed, { source: "internal" });
          break;
        }

        default:
          window.VSC.logger.warn(`Unknown action: ${action}`);
      }
    }

    /**
     * Seek video by specified seconds
     * @param {HTMLMediaElement} video - Video element
     * @param {number} seekSeconds - Seconds to seek
     */
    seek(video, seekSeconds) {
      // Use site-specific seeking (handlers return true if they handle it)
      window.VSC.siteHandlerManager.handleSeek(video, seekSeconds);
    }

    /**
     * Toggle pause/play
     * @param {HTMLMediaElement} video - Video element
     */
    pause(video) {
      if (video.paused) {
        window.VSC.logger.debug("Resuming video");
        video.play();
      } else {
        window.VSC.logger.debug("Pausing video");
        video.pause();
      }
    }

    /**
     * Reset speed with memory toggle functionality.
     *
     * Behavior:
     *   - Not at target → remember current speed, jump to target.
     *   - At target with memory → restore remembered speed, clear memory.
     *   - At target without memory → cross-toggle to the other action's speed
     *     (e.g. reset at 1.0x jumps to preferred speed, preferred at 1.8x jumps to reset speed).
     *
     * @param {HTMLMediaElement} video - Video element
     * @param {number} target - Target speed for this action
     * @param {number} [crossTarget] - Target speed of the paired action (for cross-toggle)
     */
    resetSpeed(video, target, crossTarget) {
      if (!video.vsc) {
        window.VSC.logger.warn("resetSpeed called on video without controller");
        return;
      }

      const currentSpeed = video.playbackRate;

      if (currentSpeed === target) {
        if (video.vsc.speedBeforeReset !== null) {
          // Restore remembered speed
          window.VSC.logger.info(
            `Restoring remembered speed: ${video.vsc.speedBeforeReset}`,
          );
          const rememberedSpeed = video.vsc.speedBeforeReset;
          video.vsc.speedBeforeReset = null;
          this.adjustSpeed(video, rememberedSpeed);
        } else if (crossTarget && crossTarget !== target) {
          // Cross-toggle: jump to the paired action's target
          window.VSC.logger.info(`Cross-toggle from ${target} to ${crossTarget}`);
          video.vsc.speedBeforeReset = currentSpeed;
          this.adjustSpeed(video, crossTarget);
        }
      } else {
        // Remember current speed and jump to target
        window.VSC.logger.info(
          `Remembering speed ${currentSpeed} and resetting to ${target}`,
        );
        video.vsc.speedBeforeReset = currentSpeed;
        this.adjustSpeed(video, target);
      }
    }

    /**
     * Toggle mute
     * @param {HTMLMediaElement} video - Video element
     */
    muted(video) {
      video.muted = video.muted !== true;
    }

    /**
     * Increase volume
     * @param {HTMLMediaElement} video - Video element
     * @param {number} value - Amount to increase
     */
    volumeUp(video, value) {
      video.volume = Math.min(1, (video.volume + value).toFixed(2));
    }

    /**
     * Decrease volume
     * @param {HTMLMediaElement} video - Video element
     * @param {number} value - Amount to decrease
     */
    volumeDown(video, value) {
      video.volume = Math.max(0, (video.volume - value).toFixed(2));
    }

    /**
     * Set time marker
     * @param {HTMLMediaElement} video - Video element
     */
    setMark(video) {
      window.VSC.logger.debug("Adding marker");
      video.vsc.mark = video.currentTime;
    }

    /**
     * Jump to time marker, or jump back to previous position if already at marker
     * @param {HTMLMediaElement} video - Video element
     */
    jumpToMark(video) {
      if (
        video.vsc.mark === null ||
        video.vsc.mark === undefined ||
        typeof video.vsc.mark !== "number"
      ) {
        return;
      }

      const currentTime = video.currentTime;

      if (
        video.vsc.positionBeforeJump !== null &&
        Math.abs(currentTime - video.vsc.mark) < 0.05
      ) {
        // At the marker — toggle back to where we came from
        window.VSC.logger.debug("Jumping back to pre-marker position");
        video.currentTime = video.vsc.positionBeforeJump;
        video.vsc.positionBeforeJump = null;
      } else {
        // Jump to marker, remembering current position
        window.VSC.logger.debug("Jumping to marker");
        video.vsc.positionBeforeJump = currentTime;
        video.currentTime = video.vsc.mark;
      }
    }

    /**
     * Flash controller briefly for visual feedback.
     * Single entry point for all temporary visibility — replaces both
     * blinkController and EventManager.showController.
     * @param {HTMLElement} controller - Controller element
     * @param {number} duration - Duration in ms (default 2000)
     */
    flashController(controller, duration) {
      // startHidden is a hard preference — never flash, regardless of V toggle.
      if (this.config.settings.startHidden) {
        window.VSC.logger.debug(
          "flashController skipped: startHidden is a hard preference",
        );
        return;
      }

      // User explicitly hid this controller (V key) — respect that choice.
      if (
        controller.classList.contains("vsc-manual") &&
        controller.classList.contains("vsc-hidden")
      ) {
        window.VSC.logger.debug(
          "flashController skipped: user manually hid controller",
        );
        return;
      }

      const isAudioController = this.isAudioController(controller);

      // Always clear any existing timer first (timer invariant: one per controller)
      if (controller.flashTimer !== undefined) {
        clearTimeout(controller.flashTimer);
        controller.flashTimer = undefined;
      }

      // Add vsc-show class to temporarily show controller
      // This overrides vsc-hidden and vsc-autohide via CSS source order
      controller.classList.add("vsc-show");
      window.VSC.logger.debug(
        "Showing controller temporarily with vsc-show class",
      );

      // For audio controllers, don't set timeout to hide again
      if (!isAudioController) {
        controller.flashTimer = setTimeout(() => {
          controller.classList.remove("vsc-show");
          controller.flashTimer = undefined;
          window.VSC.logger.debug("Removing vsc-show class after flash timeout");
        }, duration || 2000);
      } else {
        window.VSC.logger.debug(
          "Audio controller flash - keeping vsc-show class",
        );
      }
    }

    /**
     * Check if controller is associated with an audio element
     * @param {HTMLElement} controller - Controller element
     * @returns {boolean} True if associated with audio element
     * @private
     */
    isAudioController(controller) {
      // Find associated media element using state manager
      const mediaElements = window.VSC.stateManager
        ? window.VSC.stateManager.getControlledElements()
        : [];
      for (const media of mediaElements) {
        if (media.vsc && media.vsc.div === controller) {
          return media.tagName === "AUDIO";
        }
      }
      return false;
    }

    /**
     * Adjust video playback speed (absolute or relative)
     * Simplified to use proven working logic from setSpeed method
     *
     * @param {HTMLMediaElement} video - Target video element
     * @param {number} value - Speed value (absolute) or delta (relative)
     * @param {Object} options - Configuration options
     * @param {boolean} options.relative - If true, value is a delta; if false, absolute speed
     * @param {string} options.source - 'internal' (user action) or 'external' (site/other)
     */
    adjustSpeed(video, value, options = {}) {
      return window.VSC.logger.withContext(video, () => {
        // Validate input
        if (!video || !video.vsc) {
          window.VSC.logger.warn(
            "adjustSpeed called on video without controller",
          );
          return;
        }

        if (typeof value !== "number" || isNaN(value)) {
          window.VSC.logger.warn("adjustSpeed called with invalid value:", value);
          return;
        }

        return this._adjustSpeedInternal(video, value, options);
      });
    }

    /**
     * Internal adjustSpeed implementation (context already set)
     * @private
     */
    _adjustSpeedInternal(video, value, options) {
      const { relative = false, source = "internal" } = options;

      // Calculate target speed
      let targetSpeed;
      if (relative) {
        // For relative changes, add to current speed
        const currentSpeed = video.playbackRate < 0.1 ? 0.0 : video.playbackRate;
        targetSpeed = currentSpeed + value;

        // Snap to 1.0x when crossing the 1.0 boundary
        if (
          (currentSpeed > 1.0 && targetSpeed < 1.0) ||
          (currentSpeed < 1.0 && targetSpeed > 1.0)
        ) {
          targetSpeed = 1.0;
        }

        window.VSC.logger.debug(
          `Relative speed calculation: currentSpeed=${currentSpeed} + ${value} = ${targetSpeed}`,
        );
      } else {
        // For absolute changes, use value directly
        targetSpeed = value;
        window.VSC.logger.debug(`Absolute speed set: ${targetSpeed}`);
      }

      // Clamp to valid range
      targetSpeed = Math.min(
        Math.max(targetSpeed, window.VSC.Constants.SPEED_LIMITS.MIN),
        window.VSC.Constants.SPEED_LIMITS.MAX,
      );

      // Round to 2 decimal places to avoid floating point issues
      targetSpeed = Number(targetSpeed.toFixed(2));

      // Fight detection is enforced upstream in event-manager.js.
      // External changes that reach here have already been approved (fight surrendered or speed matched).
      this.setSpeed(video, targetSpeed, source);
    }

    /**
     * Get user's preferred speed, respecting rememberSpeed setting.
     * @returns {number} Preferred speed (lastSpeed when remembering, 1.0 otherwise)
     */
    getPreferredSpeed() {
      if (this.config.settings.rememberSpeed) {
        return this.config.settings.lastSpeed || 1.0;
      }
      return 1.0;
    }

    /**
     * Set video playback speed with complete state management
     * Unified implementation with all functionality - no fragmented logic
     * @param {HTMLMediaElement} video - Video element
     * @param {number} speed - Target speed
     * @param {string} source - Change source: 'internal' (user/controller) or 'external' (site)
     */
    setSpeed(video, speed, source = "internal") {
      const speedValue = speed.toFixed(2);
      const numericSpeed = Number(speedValue);

      // 1. Update lastSpeed BEFORE touching playbackRate. The playbackRate
      //    assignment (step 3) fires a synchronous native ratechange event.
      //    The cooldown handler reads lastSpeed as the "authoritative" speed
      //    to restore during fight-back. If lastSpeed is stale, the handler
      //    undoes the very change we're making.
      //    'init' source: skip — don't arm fight-back with the initialization
      //    default; let the first real user/site action establish authority.
      if (source !== "external" && source !== "init") {
        this.config.settings.lastSpeed = numericSpeed;
      }

      // 2. Start cooldown — the playbackRate assignment below triggers a
      //    native ratechange event synchronously. Without cooldown active,
      //    handleRateChange would misclassify it as an external site change.
      if (this.eventManager) {
        this.eventManager.refreshCoolDown();
      }

      // 3. Set the actual playback rate via site handler (native ratechange fires here, blocked by cooldown)
      window.VSC.siteHandlerManager.handleSpeedChange(video, numericSpeed);

      // 4. Dispatch synthetic event with source tracking
      video.dispatchEvent(
        new CustomEvent("ratechange", {
          bubbles: true,
          composed: true,
          detail: {
            origin: "videoSpeed",
            speed: speedValue,
            source: source,
          },
        }),
      );

      // 5. Update UI indicator
      const speedIndicator = video.vsc?.speedIndicator;
      if (!speedIndicator) {
        window.VSC.logger.warn(
          "Cannot update speed indicator: video controller UI not fully initialized",
        );
        return;
      }
      speedIndicator.textContent = numericSpeed.toFixed(2);

      // 6. Persist to storage only if rememberSpeed is enabled
      if (source !== "external" && this.config.settings.rememberSpeed) {
        this.config.save({ lastSpeed: numericSpeed });
      }

      // 7. Flash controller briefly for visual feedback
      if (video.vsc?.div) {
        this.flashController(video.vsc.div);
      }
    }
  }

  // Create singleton instance
  window.VSC.ActionHandler = ActionHandler;

  /* ===== src/core/video-controller.js ===== */
  /**
   * Video Controller class for managing individual video elements
   *
   */

  window.VSC = window.VSC || {};

  class VideoController {
    constructor(
      target,
      parent,
      config,
      actionHandler,
      shouldStartHidden = false,
    ) {
      // Return existing controller if already attached
      if (target.vsc) {
        return target.vsc;
      }

      this.video = target;
      this.parent = target.parentElement || parent;
      this.config = config;
      this.actionHandler = actionHandler;
      this.controlsManager = new window.VSC.ControlsManager(
        actionHandler,
        config,
      );
      this.shouldStartHidden = shouldStartHidden;

      // Generate unique controller ID for badge tracking
      this.controllerId = this.generateControllerId(target);

      // Transient reset memory (not persisted, instance-specific)
      this.speedBeforeReset = null;
      this.positionBeforeJump = null;

      // Attach controller to video element first (needed for adjustSpeed)
      target.vsc = this;

      // Register with state manager immediately after controller is attached
      if (window.VSC.stateManager) {
        window.VSC.stateManager.registerController(this);
      } else {
        window.VSC.logger.error(
          "StateManager not available during VideoController initialization",
        );
      }

      // Initialize speed
      this.initializeSpeed();

      // Create UI
      this.div = this.initializeControls();

      // Set up event handlers
      this.setupEventHandlers();

      // Set up mutation observer for src changes
      this.setupMutationObserver();

      window.VSC.logger.info("VideoController initialized for video element");
    }

    /**
     * Initialize video speed based on settings.
     *
     * Uses source:'init' so setSpeed skips the lastSpeed update — during init
     * we don't want to arm fight-back with a stale/default value that could
     * conflict with the player's own initialization sequence.
     * @private
     */
    initializeSpeed() {
      const targetSpeed = this.getTargetSpeed();

      window.VSC.logger.debug(`Setting initial playbackRate to: ${targetSpeed}`);

      if (!this.actionHandler || targetSpeed === this.video.playbackRate) {
        return;
      }

      // Defer until metadata is loaded — setting playbackRate before the player
      // has initialized can race with the site's own init sequence.
      if (this.video.readyState < 1) {
        window.VSC.logger.debug("Deferring initializeSpeed until loadedmetadata");
        const handler = () => {
          this.video.removeEventListener("loadedmetadata", handler);
          if (targetSpeed !== this.video.playbackRate) {
            this.actionHandler.adjustSpeed(this.video, targetSpeed, {
              source: "init",
            });
          }
        };
        this.video.addEventListener("loadedmetadata", handler);
      } else {
        this.actionHandler.adjustSpeed(this.video, targetSpeed, {
          source: "init",
        });
      }
    }

    /**
     * Get target speed for video initialization and event restoration.
     *
     * lastSpeed semantics: null = "no user choice this session", any number
     * (including 1.0) = "user deliberately set this." setSpeed() writes a
     * real number on every user action; load() initializes to null when a
     * per-site rule exists or rememberSpeed is off.
     *
     * Fresh load priority:
     *   1. siteDefaultSpeed (per-site rule) — always wins if configured
     *   2. lastSpeed from storage (rememberSpeed=true, no per-site rule)
     *   3. 1.0 fallback
     * Mid-session: user's last setSpeed() call wins until next page load.
     *
     * @returns {number} Target speed
     * @private
     */
    getTargetSpeed() {
      const baseline = this.config.settings.siteDefaultSpeed ?? 1.0;
      const last = this.config.settings.lastSpeed;

      if (last !== null) {
        window.VSC.logger.debug(`Using lastSpeed ${last} (baseline=${baseline})`);
        return last;
      }

      window.VSC.logger.debug(`Using baseline ${baseline} (lastSpeed=${last})`);
      return baseline;
    }

    /**
     * Initialize video controller UI
     * @returns {HTMLElement} Controller wrapper element
     * @private
     */
    initializeControls() {
      window.VSC.logger.debug("initializeControls Begin");

      const document = this.video.ownerDocument;
      const speed = window.VSC.Constants.formatSpeed(this.video.playbackRate);

      window.VSC.logger.debug(`Speed variable set to: ${speed}`);

      // Create custom element wrapper to avoid CSS conflicts
      const wrapper = document.createElement("vsc-controller");

      // Apply all CSS classes at once to prevent race condition flash
      const cssClasses = ["vsc-controller"];

      // Only hide controller if video has no source AND is not ready/functional
      // This prevents hiding controllers for live streams or dynamically loaded videos
      if (
        !this.video.currentSrc &&
        !this.video.src &&
        this.video.readyState < 2
      ) {
        cssClasses.push("vsc-nosource");
      }

      if (this.config.settings.startHidden || this.shouldStartHidden) {
        cssClasses.push("vsc-hidden");
        window.VSC.logger.debug("Starting controller hidden");
      }
      // When startHidden=false, use natural visibility (no special class needed)

      // Apply all classes at once to prevent visible flash
      wrapper.className = cssClasses.join(" ");

      // IMPORTANT: Wrapper gets z-index ONLY — no position, no top, no left.
      // Position is controlled by inject.css (default: absolute; site overrides: relative).
      // Adding inline position here would defeat CSS site overrides via specificity.
      wrapper.style.cssText = "z-index: 9999999 !important;";

      // Create shadow DOM with placeholder position (set after insertion)
      const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, {
        top: "0px",
        left: "0px",
        speed: speed,
        opacity: this.config.settings.controllerOpacity,
        buttonSize: this.config.settings.controllerButtonSize,
      });

      // Set up control events
      this.controlsManager.setupControlEvents(shadow, this.video);

      // Store speed indicator reference
      this.speedIndicator = window.VSC.ShadowDOMManager.getSpeedIndicator(shadow);

      // Insert into DOM FIRST — position calculation needs the wrapper in the DOM
      this.insertIntoDOM(document, wrapper);

      // THEN compute position based on actual DOM state.
      // If a CSS override sets the wrapper to position:relative (e.g. YouTube, Netflix),
      // the inner controller stays at (0,0) and the CSS nudge handles placement.
      // Otherwise (wrapper is absolute), compute coordinates for generic sites.
      const computedPosition = getComputedStyle(wrapper).position;
      if (computedPosition !== "relative") {
        const position = window.VSC.ShadowDOMManager.calculatePosition(
          this.video,
        );
        const innerController = window.VSC.ShadowDOMManager.getController(shadow);
        innerController.style.top = position.top;
        innerController.style.left = position.left;
      }

      window.VSC.logger.debug("initializeControls End");
      return wrapper;
    }

    /**
     * Insert controller into DOM with site-specific positioning
     * @param {Document} document - Document object
     * @param {HTMLElement} wrapper - Wrapper element to insert
     * @private
     */
    insertIntoDOM(document, wrapper) {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(wrapper);

      // Get site-specific positioning information
      const positioning = window.VSC.siteHandlerManager.getControllerPosition(
        this.parent,
        this.video,
      );

      switch (positioning.insertionMethod) {
        case "beforeParent":
          positioning.insertionPoint.parentElement.insertBefore(
            fragment,
            positioning.insertionPoint,
          );
          break;

        case "afterParent":
          positioning.insertionPoint.parentElement.insertBefore(
            fragment,
            positioning.insertionPoint.nextSibling,
          );
          break;

        case "firstChild":
        default:
          positioning.insertionPoint.insertBefore(
            fragment,
            positioning.insertionPoint.firstChild,
          );
          break;
      }

      window.VSC.logger.debug(
        `Controller inserted using ${positioning.insertionMethod} method`,
      );
    }

    /**
     * Set up event handlers for media events
     * @private
     */
    setupEventHandlers() {
      const mediaEventAction = (event) => {
        const targetSpeed = this.getTargetSpeed(event.target);

        // Lifecycle restore, not a user choice — don't persist to lastSpeed.
        window.VSC.logger.info(
          `Media event ${event.type}: restoring speed to ${targetSpeed}`,
        );
        this.actionHandler.adjustSpeed(event.target, targetSpeed, {
          source: "init",
        });
      };

      // Bind event handlers
      this.handlePlay = mediaEventAction.bind(this);
      // Don't restore speed on seeked if the video hasn't loaded data yet —
      // the player may still be initializing.
      this.handleSeek = (event) => {
        if (event.target.readyState < 2) {
          return;
        }
        mediaEventAction.call(this, event);
      };

      // Add essential event listeners for speed restoration
      this.video.addEventListener("play", this.handlePlay);
      this.video.addEventListener("seeked", this.handleSeek);

      window.VSC.logger.debug(
        "Added essential media event handlers: play, seeked",
      );
    }

    /**
     * Set up mutation observer for src attribute changes
     * @private
     */
    setupMutationObserver() {
      this.targetObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === "attributes" &&
            (mutation.attributeName === "src" ||
              mutation.attributeName === "currentSrc")
          ) {
            window.VSC.logger.debug("Mutation of A/V element detected");
            const controller = this.div;
            if (!mutation.target.src && !mutation.target.currentSrc) {
              controller.classList.add("vsc-nosource");
            } else {
              controller.classList.remove("vsc-nosource");
            }
          }
        });
      });

      this.targetObserver.observe(this.video, {
        attributeFilter: ["src", "currentSrc"],
      });
    }

    /**
     * Remove controller and clean up
     */
    remove() {
      window.VSC.logger.debug("Removing VideoController");

      // Remove DOM element
      if (this.div && this.div.parentNode) {
        this.div.remove();
      }

      // Remove event listeners
      if (this.handlePlay) {
        this.video.removeEventListener("play", this.handlePlay);
      }
      if (this.handleSeek) {
        this.video.removeEventListener("seeked", this.handleSeek);
      }

      // Disconnect mutation observer
      if (this.targetObserver) {
        this.targetObserver.disconnect();
      }

      // Remove from state manager
      if (window.VSC.stateManager) {
        window.VSC.stateManager.removeController(this.controllerId);
      }

      // Remove reference from video element
      delete this.video.vsc;

      window.VSC.logger.debug("VideoController removed successfully");
    }

    /**
     * Generate unique controller ID for badge tracking
     * @param {HTMLElement} target - Video/audio element
     * @returns {string} Unique controller ID
     * @private
     */
    generateControllerId(target) {
      const timestamp = Date.now();
      const src = target.currentSrc || target.src || "no-src";
      const tagName = target.tagName.toLowerCase();

      // Create a simple hash from src for uniqueness
      const srcHash = src.split("").reduce((hash, char) => {
        hash = (hash << 5) - hash + char.charCodeAt(0);
        return hash & hash; // Convert to 32-bit integer
      }, 0);

      const random = Math.floor(Math.random() * 1000);
      return `${tagName}-${Math.abs(srcHash)}-${timestamp}-${random}`;
    }

    /**
     * Check if the video element is currently visible
     * @returns {boolean} True if video is visible
     */
    isVideoVisible() {
      // Check if video is still connected to DOM
      if (!this.video.isConnected) {
        return false;
      }

      // Check computed style for visibility
      const style = window.getComputedStyle(this.video);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }

      // Check if video has reasonable dimensions
      const rect = this.video.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      return true;
    }

    /**
     * Update controller visibility based on video visibility
     * Called when video visibility changes
     */
    updateVisibility() {
      const isVisible = this.isVideoVisible();
      const isCurrentlyHidden = this.div.classList.contains("vsc-hidden");

      // Special handling for audio elements - don't hide controllers for functional audio
      if (this.video.tagName === "AUDIO") {
        // For audio, only hide if manually hidden or if audio support is disabled
        if (!this.config.settings.audioBoolean && !isCurrentlyHidden) {
          this.div.classList.add("vsc-hidden");
          window.VSC.logger.debug(
            "Hiding audio controller - audio support disabled",
          );
        } else if (
          this.config.settings.audioBoolean &&
          isCurrentlyHidden &&
          !this.div.classList.contains("vsc-manual")
        ) {
          // Show audio controller if audio support is enabled and not manually hidden
          this.div.classList.remove("vsc-hidden");
          window.VSC.logger.debug(
            "Showing audio controller - audio support enabled",
          );
        }
        return;
      }

      // Original logic for video elements
      if (
        isVisible &&
        isCurrentlyHidden &&
        !this.div.classList.contains("vsc-manual") &&
        !this.config.settings.startHidden
      ) {
        // Video became visible and controller is hidden (but not manually hidden and not set to start hidden)
        this.div.classList.remove("vsc-hidden");
        window.VSC.logger.debug("Showing controller - video became visible");
      } else if (!isVisible && !isCurrentlyHidden) {
        // Video became invisible and controller is visible
        this.div.classList.add("vsc-hidden");
        window.VSC.logger.debug("Hiding controller - video became invisible");
      }
    }
  }

  // Create singleton instance
  window.VSC.VideoController = VideoController;

  // Global variables available for both browser and testing

  /* ===== src/ui/controls.js ===== */
  /**
   * Control button interactions and event handling
   */

  window.VSC = window.VSC || {};

  class ControlsManager {
    constructor(actionHandler, config) {
      this.actionHandler = actionHandler;
      this.config = config;
    }

    /**
     * Set up control button event listeners
     * @param {ShadowRoot} shadow - Shadow root containing controls
     * @param {HTMLVideoElement} video - Associated video element
     */
    setupControlEvents(shadow, video) {
      this.setupDragHandler(shadow);
      this.setupButtonHandlers(shadow);
      this.setupWheelHandler(shadow, video);
      this.setupClickPrevention(shadow);
    }

    /**
     * Set up drag and double-click-to-reset handlers for speed indicator
     * Uses pointer events for unified mouse + touch support
     * @param {ShadowRoot} shadow - Shadow root
     * @private
     */
    setupDragHandler(shadow) {
      const draggable = shadow.querySelector(".draggable");

      // Pointer-based drag (unified mouse + touch)
      draggable.addEventListener(
        "pointerdown",
        (e) => {
          this.actionHandler.runAction(e.target.dataset["action"], false, e);
          e.stopPropagation();
          e.preventDefault();
        },
        true,
      );

      // Double-click / double-tap to reset speed
      draggable.addEventListener(
        "dblclick",
        (e) => {
          const resetTarget = this.config.getKeyBinding("reset") || 1.0;
          this.actionHandler.runAction("reset", resetTarget, e);
          e.stopPropagation();
          e.preventDefault();
        },
        true,
      );
    }

    /**
     * Set up button click handlers
     * @param {ShadowRoot} shadow - Shadow root
     * @private
     */
    setupButtonHandlers(shadow) {
      shadow.querySelectorAll("button").forEach((button) => {
        // Click handler
        button.addEventListener(
          "click",
          (e) => {
            this.actionHandler.runAction(
              e.target.dataset["action"],
              this.config.getKeyBinding(e.target.dataset["action"]),
              e,
            );
            e.stopPropagation();
          },
          true,
        );

        // Touch handler to prevent conflicts
        button.addEventListener(
          "touchstart",
          (e) => {
            e.stopPropagation();
          },
          true,
        );
      });
    }

    /**
     * Set up mouse wheel handler for speed control with touchpad filtering
     *
     * Cross-browser wheel event behavior:
     * - Chrome/Safari/Edge: ALL devices use DOM_DELTA_PIXEL (mouse wheels ~100px, touchpads ~1-15px)
     * - Firefox: Mouse wheels use DOM_DELTA_LINE, touchpads use DOM_DELTA_PIXEL
     *
     * Detection strategy: Use magnitude threshold in DOM_DELTA_PIXEL mode to distinguish
     * mouse wheels (±100px typical) from touchpads (±1-15px typical). Threshold of 50px
     * provides safety margin based on empirical browser testing.
     *
     * @param {ShadowRoot} shadow - Shadow root
     * @param {HTMLVideoElement} video - Video element
     * @private
     */
    setupWheelHandler(shadow, video) {
      const controller = shadow.querySelector("#controller");

      // Hover dwell gate: only allow wheel events after the cursor has rested on the
      // controller for HOVER_DWELL_MS. This prevents accidental speed changes when
      // scrolling through feed-based sites (Twitter, Reddit) where the cursor briefly
      // passes over the controller. See #1352.
      const HOVER_DWELL_MS = 300;
      let hoverStart = 0;

      controller.addEventListener("mouseenter", (e) => {
        hoverStart = e.timeStamp;
      });

      controller.addEventListener("mouseleave", () => {
        hoverStart = 0;
      });

      controller.addEventListener(
        "wheel",
        (event) => {
          // Reject wheel events before hover dwell threshold is met
          if (event.timeStamp - hoverStart < HOVER_DWELL_MS) {
            window.VSC.logger.debug(
              "Wheel ignored: hover dwell threshold not met",
            );
            return;
          }

          // Detect and filter touchpad events to prevent interference during page scrolling
          if (event.deltaMode === event.DOM_DELTA_PIXEL) {
            // Chrome/Safari/Edge: Use magnitude to distinguish mouse wheel (>50px) from touchpad (<50px)
            const TOUCHPAD_THRESHOLD = 50;
            if (Math.abs(event.deltaY) < TOUCHPAD_THRESHOLD) {
              window.VSC.logger.debug(
                `Touchpad scroll detected (deltaY: ${event.deltaY}) - ignoring`,
              );
              return;
            }
          }
          // Firefox: DOM_DELTA_LINE events are typically legitimate mouse wheels, allow them

          event.preventDefault();

          const delta = Math.sign(event.deltaY);
          const step = 0.1;
          const speedDelta = delta < 0 ? step : -step;

          this.actionHandler.adjustSpeed(video, speedDelta, { relative: true });

          window.VSC.logger.debug(
            `Wheel control: adjusting speed by ${speedDelta} (deltaMode: ${event.deltaMode}, deltaY: ${event.deltaY})`,
          );
        },
        { passive: false },
      );
    }

    /**
     * Set up click prevention for controller container
     * @param {ShadowRoot} shadow - Shadow root
     * @private
     */
    setupClickPrevention(shadow) {
      const controller = shadow.querySelector("#controller");

      // Prevent clicks from bubbling up to page
      controller.addEventListener("click", (e) => e.stopPropagation(), false);
      controller.addEventListener("mousedown", (e) => e.stopPropagation(), false);
    }
  }

  // Create singleton instance
  window.VSC.ControlsManager = ControlsManager;

  /* ===== src/ui/drag-handler.js ===== */
  /**
   * Drag functionality for video controller
   * Uses pointer events for unified mouse + touch support
   */

  window.VSC = window.VSC || {};

  class DragHandler {
    /**
     * Handle dragging of video controller via pointer events
     * @param {HTMLVideoElement} video - Video element
     * @param {PointerEvent|MouseEvent} e - Pointer/mouse event
     */
    static handleDrag(video, e) {
      const controller = video.vsc.div;
      const shadowController = controller.shadowRoot.querySelector("#controller");

      video.classList.add("vcs-dragging");
      shadowController.classList.add("dragging");

      const initialXY = [e.clientX, e.clientY];
      const initialControllerXY = [
        parseInt(shadowController.style.left) || 0,
        parseInt(shadowController.style.top) || 0,
      ];

      const draggable = e.target;

      // Capture pointer so all move/up events route here regardless of position
      if (e.pointerId !== undefined) {
        draggable.setPointerCapture(e.pointerId);
      }

      const onMove = (ev) => {
        const dx = ev.clientX - initialXY[0];
        const dy = ev.clientY - initialXY[1];
        shadowController.style.left = `${initialControllerXY[0] + dx}px`;
        shadowController.style.top = `${initialControllerXY[1] + dy}px`;
      };

      const onEnd = () => {
        draggable.removeEventListener("pointermove", onMove);
        draggable.removeEventListener("pointerup", onEnd);
        draggable.removeEventListener("pointercancel", onEnd);
        // Mouse fallbacks
        draggable.removeEventListener("mousemove", onMove);
        draggable.removeEventListener("mouseup", onEnd);

        shadowController.classList.remove("dragging");
        video.classList.remove("vcs-dragging");

        window.VSC.logger.debug("Drag operation completed");
      };

      if (e.pointerId !== undefined) {
        draggable.addEventListener("pointermove", onMove);
        draggable.addEventListener("pointerup", onEnd);
        draggable.addEventListener("pointercancel", onEnd);
      } else {
        // Fallback for environments without pointer events
        draggable.addEventListener("mousemove", onMove);
        draggable.addEventListener("mouseup", onEnd);
      }

      window.VSC.logger.debug("Drag operation started");
    }
  }

  // Create singleton instance
  window.VSC.DragHandler = DragHandler;

  /* ===== src/ui/shadow-dom.js ===== */
  /**
   * Shadow DOM creation and management
   */

  window.VSC = window.VSC || {};

  class ShadowDOMManager {
    /**
     * Create shadow DOM for video controller
     * @param {HTMLElement} wrapper - Wrapper element
     * @param {Object} options - Configuration options
     * @returns {ShadowRoot} Created shadow root
     */
    static createShadowDOM(wrapper, options = {}) {
      const {
        top = "0px",
        left = "0px",
        speed = "1.00",
        opacity = 0.3,
        buttonSize = 14,
      } = options;

      const shadow = wrapper.attachShadow({ mode: "open" });

      // Create style element with embedded CSS for immediate styling
      const style = document.createElement("style");
      style.textContent = `
      * {
        line-height: 1.8em;
        font-family: sans-serif;
        font-size: 13px;
      }
      
      :host(:hover) #controls {
        display: inline-block;
      }
      
      /* Hide shadow DOM content for different hiding scenarios */
      :host(.vsc-hidden) #controller,
      :host(.vsc-nosource) #controller {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }

      /* YouTube autohide — fade with player controls.
         :host-context() matches when any ancestor of <vsc-controller> has the
         class, so no JS MutationObserver forwarding is needed. */
      :host-context(.ytp-autohide) #controller {
        visibility: hidden !important;
        opacity: 0 !important;
        transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Temporarily show controller (speed change flash, highest priority).
         vsc-manual:not(vsc-hidden) intentionally has NO CSS rule — user toggling
         back to "show" should restore default behavior (follow autohide), not
         permanently override it. vsc-manual is only read by JS flash guards. */

      /* Show shadow DOM content when host has vsc-show class (highest priority) */
      :host(.vsc-show) #controller {
        display: block !important;
        visibility: visible !important;
        opacity: ${opacity} !important;
      }
      
      #controller {
        position: absolute;
        top: 0;
        left: 0;
        background: black;
        color: white;
        border-radius: 6px;
        padding: 4px;
        margin: 10px 10px 10px 15px;
        cursor: default;
        z-index: 9999999;
        white-space: nowrap;
      }
      
      #controller:hover {
        opacity: 0.7;
      }
      
      #controller:hover>.draggable {
        margin-right: 0.8em;
      }
      
      #controls {
        display: none;
        vertical-align: middle;
      }
      
      #controller.dragging {
        cursor: -webkit-grabbing;
        opacity: 0.7;
      }
      
      #controller.dragging #controls {
        display: inline-block;
      }
      
      .draggable {
        cursor: -webkit-grab;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.8em;
        height: 1.4em;
        text-align: center;
        vertical-align: middle;
        box-sizing: border-box;
        touch-action: none;
      }
      
      .draggable:active {
        cursor: -webkit-grabbing;
      }
      
      button {
        opacity: 1;
        cursor: pointer;
        color: black;
        background: white;
        font-weight: normal;
        border-radius: 5px;
        padding: 1px 5px 3px 5px;
        font-size: inherit;
        line-height: inherit;
        border: 0px solid white;
        font-family: "Lucida Console", Monaco, monospace;
        margin: 0px 2px 2px 2px;
        transition: background 0.2s, color 0.2s;
      }
      
      button:focus {
        outline: 0;
      }
      
      button:hover {
        opacity: 1;
        background: #2196f3;
        color: #ffffff;
      }
      
      button:active {
        background: #2196f3;
        color: #ffffff;
        font-weight: bold;
      }
      
      button.rw {
        opacity: 0.65;
      }
    `;
      shadow.appendChild(style);

      // Create controller div
      const controller = document.createElement("div");
      controller.id = "controller";
      controller.style.cssText = `top:${top}; left:${left}; opacity:${opacity};`;

      // Create draggable speed indicator
      const draggable = document.createElement("span");
      draggable.setAttribute("data-action", "drag");
      draggable.className = "draggable";
      draggable.style.cssText = `font-size: ${buttonSize}px;`;
      draggable.textContent = speed;
      controller.appendChild(draggable);

      // Create controls span
      const controls = document.createElement("span");
      controls.id = "controls";
      controls.style.cssText = `font-size: ${buttonSize}px; line-height: ${buttonSize}px;`;

      // Create buttons
      const buttons = [
        { action: "rewind", text: "«", class: "rw" },
        { action: "slower", text: "−", class: "" },
        { action: "faster", text: "+", class: "" },
        { action: "advance", text: "»", class: "rw" },
      ];

      buttons.forEach((btnConfig) => {
        const button = document.createElement("button");
        button.setAttribute("data-action", btnConfig.action);
        if (btnConfig.class) {
          button.className = btnConfig.class;
        }
        button.textContent = btnConfig.text;
        controls.appendChild(button);
      });

      controller.appendChild(controls);
      shadow.appendChild(controller);

      window.VSC.logger.debug("Shadow DOM created for video controller");
      return shadow;
    }

    /**
     * Get controller element from shadow DOM
     * @param {ShadowRoot} shadow - Shadow root
     * @returns {HTMLElement} Controller element
     */
    static getController(shadow) {
      return shadow.querySelector("#controller");
    }

    /**
     * Get controls container from shadow DOM
     * @param {ShadowRoot} shadow - Shadow root
     * @returns {HTMLElement} Controls element
     */
    static getControls(shadow) {
      return shadow.querySelector("#controls");
    }

    /**
     * Get draggable speed indicator from shadow DOM
     * @param {ShadowRoot} shadow - Shadow root
     * @returns {HTMLElement} Speed indicator element
     */
    static getSpeedIndicator(shadow) {
      return shadow.querySelector(".draggable");
    }

    /**
     * Get all buttons from shadow DOM
     * @param {ShadowRoot} shadow - Shadow root
     * @returns {NodeList} Button elements
     */
    static getButtons(shadow) {
      return shadow.querySelectorAll("button");
    }

    /**
     * Update speed display in shadow DOM
     * @param {ShadowRoot} shadow - Shadow root
     * @param {number} speed - New speed value
     */
    static updateSpeedDisplay(shadow, speed) {
      const speedIndicator = this.getSpeedIndicator(shadow);
      if (speedIndicator) {
        speedIndicator.textContent = window.VSC.Constants.formatSpeed(speed);
      }
    }

    /**
     * Calculate position for controller based on video element
     * @param {HTMLVideoElement} video - Video element
     * @returns {Object} Position object with top and left properties
     */
    static calculatePosition(video) {
      const rect = video.getBoundingClientRect();

      // getBoundingClientRect is relative to the viewport; style coordinates
      // are relative to offsetParent, so we adjust for that here. offsetParent
      // can be null if the video has `display: none` or is not yet in the DOM.
      const offsetRect = video.offsetParent?.getBoundingClientRect();
      const top = `${Math.max(rect.top - (offsetRect?.top || 0), 0)}px`;
      const left = `${Math.max(rect.left - (offsetRect?.left || 0), 0)}px`;

      return { top, left };
    }
  }

  // Create singleton instance
  window.VSC.ShadowDOMManager = ShadowDOMManager;

  /* ===== src/ui/vsc-controller-element.js ===== */
  /**
   * The <vsc-controller> element is used as an unregistered custom element.
   * Browsers allow any hyphenated tag name via document.createElement() without
   * calling customElements.define(). This avoids conflicts with third-party
   * custom-elements-es5-adapter polyfills that monkey-patch customElements.define()
   * and break native ES6 class constructors (see #1458).
   *
   * No registration is needed — CSS selectors, querySelector, shadow DOM, and
   * tagName all work on unregistered hyphenated elements.
   */

  /* ===== src/site-handlers/base-handler.js ===== */
  /**
   * Base class for site-specific handlers
   */

  window.VSC = window.VSC || {};

  class BaseSiteHandler {
    constructor() {
      this.hostname = location.hostname;
    }

    /**
     * Check if this handler applies to the current site
     * @returns {boolean} True if handler applies
     */
    static matches() {
      return false; // Override in subclasses
    }

    /**
     * Get the site-specific positioning for the controller
     * @param {HTMLElement} parent - Parent element
     * @param {HTMLElement} video - Video element
     * @returns {Object} Positioning information
     */
    getControllerPosition(parent, _video) {
      return {
        insertionPoint: parent,
        insertionMethod: "firstChild", // 'firstChild', 'beforeParent', 'afterParent'
        targetParent: parent,
      };
    }

    /**
     * Handle site-specific speed change.
     * Called whenever the controller sets playback speed (user action, fight-back, etc.).
     * Override to sync with a site's custom player API.
     * @param {HTMLMediaElement} video - Video element
     * @param {number} speed - Target speed
     */
    handleSpeedChange(video, speed) {
      video.playbackRate = speed;
    }

    /**
     * Handle site-specific seeking functionality
     * @param {HTMLMediaElement} video - Video element
     * @param {number} seekSeconds - Seconds to seek
     * @returns {boolean} True if handled, false for default behavior
     */
    handleSeek(video, seekSeconds) {
      // Default implementation - use standard seeking with bounds checking (standard logic)
      if (video.currentTime !== undefined && video.duration) {
        const newTime = Math.max(
          0,
          Math.min(video.duration, video.currentTime + seekSeconds),
        );
        video.currentTime = newTime;
      } else {
        // Fallback for videos without duration
        video.currentTime += seekSeconds;
      }
      return true;
    }

    /**
     * Handle site-specific initialization
     * @param {Document} document - Document object
     */
    initialize(_document) {
      window.VSC.logger.debug(
        `Initializing ${this.constructor.name} for ${this.hostname}`,
      );
    }

    /**
     * Handle site-specific cleanup
     */
    cleanup() {
      window.VSC.logger.debug(`Cleaning up ${this.constructor.name}`);
    }

    /**
     * Check if video element should be ignored
     * @param {HTMLMediaElement} video - Video element
     * @returns {boolean} True if video should be ignored
     */
    shouldIgnoreVideo(_video) {
      return false;
    }

    /**
     * Get site-specific CSS selectors for video containers
     * @returns {Array<string>} CSS selectors
     */
    getVideoContainerSelectors() {
      return [];
    }

    /**
     * Handle special video detection logic
     * @param {Document} document - Document object
     * @returns {Array<HTMLMediaElement>} Additional videos found
     */
    detectSpecialVideos(_document) {
      return [];
    }
  }

  // Create singleton instance
  window.VSC.BaseSiteHandler = BaseSiteHandler;

  /* ===== src/site-handlers/netflix-handler.js ===== */
  /**
   * Netflix-specific handler
   */

  window.VSC = window.VSC || {};

  class NetflixHandler extends window.VSC.BaseSiteHandler {
    /**
     * Check if this handler applies to Netflix
     * @returns {boolean} True if on Netflix
     */
    static matches() {
      return location.hostname === "www.netflix.com";
    }

    /**
     * Get Netflix-specific controller positioning
     * @param {HTMLElement} parent - Parent element
     * @param {HTMLElement} video - Video element
     * @returns {Object} Positioning information
     */
    getControllerPosition(parent, _video) {
      // Insert before parent to bypass Netflix's overlay
      return {
        insertionPoint: parent.parentElement,
        insertionMethod: "beforeParent",
        targetParent: parent.parentElement,
      };
    }

    /**
     * Handle Netflix-specific seeking using their API
     * @param {HTMLMediaElement} video - Video element
     * @param {number} seekSeconds - Seconds to seek
     * @returns {boolean} True if handled
     */
    handleSeek(video, seekSeconds) {
      try {
        // Use Netflix's postMessage API for seeking
        window.postMessage(
          {
            action: "hml5speed-seek",
            seekMs: seekSeconds * 1000,
          },
          "https://www.netflix.com",
        );

        window.VSC.logger.debug(`Netflix seek: ${seekSeconds} seconds`);
        return true;
      } catch (error) {
        window.VSC.logger.error(`Netflix seek failed: ${error.message}`);
        // Fallback to default seeking
        video.currentTime += seekSeconds;
        return true;
      }
    }

    /**
     * Initialize Netflix-specific functionality
     * @param {Document} document - Document object
     */
    initialize(document) {
      super.initialize(document);

      // Netflix-specific script injection is handled by content script (injector.js)
      // since userscript APIs are not available in injected page context
      window.VSC.logger.debug(
        "Netflix handler initialized - script injection handled by content script",
      );
    }

    /**
     * Check if video should be ignored on Netflix
     * @param {HTMLMediaElement} video - Video element
     * @returns {boolean} True if video should be ignored
     */
    shouldIgnoreVideo(video) {
      // Ignore preview videos or thumbnails
      return (
        video.classList.contains("preview-video") ||
        video.parentElement?.classList.contains("billboard-row")
      );
    }

    /**
     * Get Netflix-specific video container selectors
     * @returns {Array<string>} CSS selectors
     */
    getVideoContainerSelectors() {
      return [".watch-video", ".nfp-container", "#netflix-player"];
    }
  }

  // Create singleton instance
  window.VSC.NetflixHandler = NetflixHandler;

  /* ===== src/site-handlers/youtube-handler.js ===== */
  /**
   * YouTube-specific handler
   */

  window.VSC = window.VSC || {};

  class YouTubeHandler extends window.VSC.BaseSiteHandler {
    /**
     * Check if this handler applies to YouTube
     * @returns {boolean} True if on YouTube
     */
    static matches() {
      return location.hostname === "www.youtube.com";
    }

    /**
     * Get YouTube-specific controller positioning
     * @param {HTMLElement} parent - Parent element
     * @param {HTMLElement} video - Video element
     * @returns {Object} Positioning information
     */
    getControllerPosition(parent, _video) {
      // YouTube requires special positioning to ensure controller is on top.
      // Default: insert into the .html5-video-player (one level up from video container).
      let targetParent = parent.parentElement;

      // Embedded YouTube has a #player-controls overlay that sits as a sibling of
      // .html5-video-player and creates a separate stacking context, intercepting
      // all pointer events. Our controller inside .html5-video-player can't z-index
      // above it. Fix: insert into #player (the common parent) so our controller
      // participates in the same stacking context as the overlay.
      // NOTE: Must scope the query to targetParent.parentElement to avoid falsely matching
      // a global #player-controls element on the desktop site, which promotes insertion
      // into the tightly-managed ytd-player > div#container and crashes Polymer.
      if (
        targetParent &&
        targetParent.parentElement &&
        targetParent.parentElement.querySelector("#player-controls")
      ) {
        targetParent = targetParent.parentElement;
      }

      return {
        insertionPoint: targetParent,
        insertionMethod: "firstChild",
        targetParent: targetParent,
      };
    }

    // YouTube autohide is handled purely via CSS using :host-context() in
    // shadow-dom.js — no MutationObserver needed. The shadow DOM rule
    // :host-context(.ytp-autohide) matches when any ancestor of the
    // <vsc-controller> host has the ytp-autohide class.

    /**
     * Check if video should be ignored on YouTube
     * @param {HTMLMediaElement} video - Video element
     * @returns {boolean} True if video should be ignored
     */
    shouldIgnoreVideo(video) {
      // Ignore thumbnail videos and ads
      return (
        video.classList.contains("video-thumbnail") ||
        video.parentElement?.classList.contains("ytp-ad-player-overlay")
      );
    }

    /**
     * Get YouTube-specific video container selectors
     * @returns {Array<string>} CSS selectors
     */
    getVideoContainerSelectors() {
      return [".html5-video-player", "#movie_player", ".ytp-player-content"];
    }

    /**
     * Handle special video detection for YouTube
     * @param {Document} document - Document object
     * @returns {Array<HTMLMediaElement>} Additional videos found
     */
    detectSpecialVideos(document) {
      const videos = [];

      // Look for videos in iframes (embedded players)
      try {
        const iframes = document.querySelectorAll('iframe[src*="youtube.com"]');
        iframes.forEach((iframe) => {
          try {
            const iframeDoc = iframe.contentDocument;
            if (iframeDoc) {
              const iframeVideos = iframeDoc.querySelectorAll("video");
              videos.push(...Array.from(iframeVideos));
            }
          } catch {
            // Cross-origin iframe, ignore
          }
        });
      } catch (e) {
        window.VSC.logger.debug(
          `Could not access YouTube iframe videos: ${e.message}`,
        );
      }

      return videos;
    }
  }

  // Create singleton instance
  window.VSC.YouTubeHandler = YouTubeHandler;

  /* ===== src/site-handlers/facebook-handler.js ===== */
  /**
   * Facebook-specific handler
   */

  window.VSC = window.VSC || {};

  class FacebookHandler extends window.VSC.BaseSiteHandler {
    /**
     * Check if this handler applies to Facebook
     * @returns {boolean} True if on Facebook
     */
    static matches() {
      return location.hostname === "www.facebook.com";
    }

    /**
     * Get Facebook-specific controller positioning
     * @param {HTMLElement} parent - Parent element
     * @param {HTMLElement} video - Video element
     * @returns {Object} Positioning information
     */
    getControllerPosition(parent, _video) {
      // Facebook requires deep DOM traversal due to complex nesting
      // This is a monstrosity but new FB design does not have semantic handles
      let targetParent;

      try {
        targetParent =
          parent.parentElement.parentElement.parentElement.parentElement
            .parentElement.parentElement.parentElement;
      } catch {
        window.VSC.logger.warn(
          "Facebook DOM structure changed, using fallback positioning",
        );
        targetParent = parent.parentElement;
      }

      return {
        insertionPoint: targetParent,
        insertionMethod: "firstChild",
        targetParent: targetParent,
      };
    }

    /**
     * Initialize Facebook-specific functionality
     * @param {Document} document - Document object
     */
    initialize(document) {
      super.initialize(document);

      // Facebook's dynamic content requires special handling
      this.setupFacebookObserver(document);
    }

    /**
     * Set up observer for Facebook's dynamic content loading
     * @param {Document} document - Document object
     * @private
     */
    setupFacebookObserver(document) {
      // Facebook loads content dynamically, so we need to watch for new videos
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const videos =
                  node.querySelectorAll && node.querySelectorAll("video");
                if (videos && videos.length > 0) {
                  window.VSC.logger.debug(
                    `Facebook: Found ${videos.length} new videos`,
                  );
                  // Signal that new videos were found
                  this.onNewVideosDetected(Array.from(videos));
                }
              }
            });
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      this.facebookObserver = observer;
      window.VSC.logger.debug("Facebook dynamic content observer set up");
    }

    /**
     * Handle new videos detected in Facebook's dynamic content
     * @param {Array<HTMLMediaElement>} videos - New video elements
     * @private
     */
    onNewVideosDetected(videos) {
      // This could be used to automatically attach controllers to new videos
      // For now, just log the detection
      window.VSC.logger.debug(`Facebook: ${videos.length} new videos detected`);
    }

    /**
     * Check if video should be ignored on Facebook
     * @param {HTMLMediaElement} video - Video element
     * @returns {boolean} True if video should be ignored
     */
    shouldIgnoreVideo(video) {
      // Ignore story videos and other non-main content
      return (
        video.closest("[data-story-id]") !== null ||
        video.closest(".story-bucket-container") !== null ||
        video.getAttribute("data-video-width") === "0"
      );
    }

    /**
     * Get Facebook-specific video container selectors
     * @returns {Array<string>} CSS selectors
     */
    getVideoContainerSelectors() {
      return [
        "[data-video-id]",
        ".video-container",
        ".fbStoryVideoContainer",
        '[role="main"] video',
      ];
    }

    /**
     * Cleanup Facebook-specific resources
     */
    cleanup() {
      super.cleanup();

      if (this.facebookObserver) {
        this.facebookObserver.disconnect();
        this.facebookObserver = null;
      }
    }
  }

  // Create singleton instance
  window.VSC.FacebookHandler = FacebookHandler;

  /* ===== src/site-handlers/amazon-handler.js ===== */
  /**
   * Amazon Prime Video handler
   */

  window.VSC = window.VSC || {};

  class AmazonHandler extends window.VSC.BaseSiteHandler {
    /**
     * Check if this handler applies to Amazon
     * @returns {boolean} True if on Amazon
     */
    static matches() {
      return (
        location.hostname === "www.amazon.com" ||
        location.hostname === "www.primevideo.com" ||
        location.hostname.includes("amazon.") ||
        location.hostname.includes("primevideo.")
      );
    }

    /**
     * Get Amazon-specific controller positioning
     * @param {HTMLElement} parent - Parent element
     * @param {HTMLElement} video - Video element
     * @returns {Object} Positioning information
     */
    getControllerPosition(parent, video) {
      // Only special-case Prime Video, not product-page videos (which use "vjs-tech")
      // Otherwise the overlay disappears in fullscreen mode
      if (!video.classList.contains("vjs-tech")) {
        return {
          insertionPoint: parent.parentElement,
          insertionMethod: "beforeParent",
          targetParent: parent.parentElement,
        };
      }

      // Default positioning for product videos
      return super.getControllerPosition(parent, video);
    }

    /**
     * Check if video should be ignored on Amazon
     * @param {HTMLMediaElement} video - Video element
     * @returns {boolean} True if video should be ignored
     */
    shouldIgnoreVideo(video) {
      // Don't reject videos that are still loading
      if (video.readyState < 2) {
        return false;
      }

      // Ignore product preview videos that are too small
      const rect = video.getBoundingClientRect();
      return rect.width < 200 || rect.height < 100;
    }

    /**
     * Get Amazon-specific video container selectors
     * @returns {Array<string>} CSS selectors
     */
    getVideoContainerSelectors() {
      return [
        ".dv-player-container",
        ".webPlayerContainer",
        '[data-testid="video-player"]',
      ];
    }
  }

  // Create singleton instance
  window.VSC.AmazonHandler = AmazonHandler;

  /* ===== src/site-handlers/apple-handler.js ===== */
  /**
   * Apple TV+ handler
   */

  window.VSC = window.VSC || {};

  class AppleHandler extends window.VSC.BaseSiteHandler {
    /**
     * Check if this handler applies to Apple TV+
     * @returns {boolean} True if on Apple TV+
     */
    static matches() {
      return location.hostname === "tv.apple.com";
    }

    /**
     * Get Apple TV+-specific controller positioning
     * @param {HTMLElement} parent - Parent element
     * @param {HTMLElement} video - Video element
     * @returns {Object} Positioning information
     */
    getControllerPosition(parent, _video) {
      // Insert before parent to bypass overlay
      return {
        insertionPoint: parent.parentNode,
        insertionMethod: "firstChild",
        targetParent: parent.parentNode,
      };
    }

    /**
     * Get Apple TV+-specific video container selectors
     * @returns {Array<string>} CSS selectors
     */
    getVideoContainerSelectors() {
      return [
        "apple-tv-plus-player",
        '[data-testid="player"]',
        ".video-container",
      ];
    }

    /**
     * Handle special video detection for Apple TV+
     * @param {Document} document - Document object
     * @returns {Array<HTMLMediaElement>} Additional videos found
     */
    detectSpecialVideos(document) {
      // Apple TV+ uses custom elements that may contain videos
      const applePlayer = document.querySelector("apple-tv-plus-player");
      if (applePlayer && applePlayer.shadowRoot) {
        const videos = applePlayer.shadowRoot.querySelectorAll("video");
        return Array.from(videos);
      }
      return [];
    }
  }

  // Create singleton instance
  window.VSC.AppleHandler = AppleHandler;

  /* ===== src/site-handlers/dailymotion-handler.js ===== */
  /**
   * Dailymotion-specific handler
   *
   * Dailymotion's player nests the <video> inside .video_view, but the native
   * controls (.vod_mouse_keyboard) are a sibling of .video_view under .player.
   * This creates a stacking-context trap: no z-index on the controller inside
   * .video_view can beat the sibling overlay.  Fix: insert the controller into
   * the grandparent (.player) so it participates in the same stacking context.
   */

  window.VSC = window.VSC || {};

  class DailymotionHandler extends window.VSC.BaseSiteHandler {
    static matches() {
      return location.hostname.includes("dailymotion.com");
    }

    getControllerPosition(parent, _video) {
      // parent = .video_view; go up to .player so the controller is a sibling
      // of .vod_mouse_keyboard and can z-index above it.
      const playerContainer = parent.parentElement;
      return {
        insertionPoint: playerContainer || parent,
        insertionMethod: "firstChild",
        targetParent: playerContainer || parent,
      };
    }
  }

  window.VSC.DailymotionHandler = DailymotionHandler;

  /* ===== src/site-handlers/index.js ===== */
  /**
   * Site handler factory and manager
   */

  window.VSC = window.VSC || {};

  class SiteHandlerManager {
    constructor() {
      this.currentHandler = null;
      this.availableHandlers = [
        window.VSC.NetflixHandler,
        window.VSC.YouTubeHandler,
        window.VSC.FacebookHandler,
        window.VSC.AmazonHandler,
        window.VSC.AppleHandler,
        window.VSC.DailymotionHandler,
      ];
    }

    /**
     * Get the appropriate handler for the current site
     * @returns {BaseSiteHandler} Site handler instance
     */
    getCurrentHandler() {
      if (!this.currentHandler) {
        this.currentHandler = this.detectHandler();
      }
      return this.currentHandler;
    }

    /**
     * Detect which handler to use for the current site
     * @returns {BaseSiteHandler} Site handler instance
     * @private
     */
    detectHandler() {
      for (const HandlerClass of this.availableHandlers) {
        if (HandlerClass.matches()) {
          window.VSC.logger.info(
            `Using ${HandlerClass.name} for ${location.hostname}`,
          );
          return new HandlerClass();
        }
      }

      window.VSC.logger.debug(`Using BaseSiteHandler for ${location.hostname}`);
      return new window.VSC.BaseSiteHandler();
    }

    /**
     * Initialize the current site handler
     * @param {Document} document - Document object
     */
    initialize(document) {
      const handler = this.getCurrentHandler();
      handler.initialize(document);
    }

    /**
     * Get controller positioning for current site
     * @param {HTMLElement} parent - Parent element
     * @param {HTMLElement} video - Video element
     * @returns {Object} Positioning information
     */
    getControllerPosition(parent, video) {
      const handler = this.getCurrentHandler();
      return handler.getControllerPosition(parent, video);
    }

    /**
     * Handle speed change for current site
     * @param {HTMLMediaElement} video - Video element
     * @param {number} speed - Target speed
     */
    handleSpeedChange(video, speed) {
      const handler = this.getCurrentHandler();
      handler.handleSpeedChange(video, speed);
    }

    /**
     * Handle seeking for current site
     * @param {HTMLMediaElement} video - Video element
     * @param {number} seekSeconds - Seconds to seek
     * @returns {boolean} True if handled
     */
    handleSeek(video, seekSeconds) {
      const handler = this.getCurrentHandler();
      return handler.handleSeek(video, seekSeconds);
    }

    /**
     * Check if a video should be ignored
     * @param {HTMLMediaElement} video - Video element
     * @returns {boolean} True if video should be ignored
     */
    shouldIgnoreVideo(video) {
      const handler = this.getCurrentHandler();
      if (handler.shouldIgnoreVideo(video)) {
        return true;
      }

      // Detect gif-like videos: muted looping videos with no native controls.
      // Sites like Telegram, X, Imgur serve animated stickers/GIFs as <video
      // autoplay loop muted> elements. Showing a speed overlay on these is
      // visually noisy and not useful.
      if (
        video.tagName === "VIDEO" &&
        video.loop &&
        video.muted &&
        !video.controls
      ) {
        window.VSC.logger.debug(
          "Video ignored: gif-video pattern (loop + muted + no controls)",
        );
        return true;
      }

      return false;
    }

    /**
     * Get video container selectors for current site
     * @returns {Array<string>} CSS selectors
     */
    getVideoContainerSelectors() {
      const handler = this.getCurrentHandler();
      return handler.getVideoContainerSelectors();
    }

    /**
     * Detect special videos for current site
     * @param {Document} document - Document object
     * @returns {Array<HTMLMediaElement>} Additional videos found
     */
    detectSpecialVideos(document) {
      const handler = this.getCurrentHandler();
      return handler.detectSpecialVideos(document);
    }

    /**
     * Cleanup current handler
     */
    cleanup() {
      if (this.currentHandler) {
        this.currentHandler.cleanup();
        this.currentHandler = null;
      }
    }

    /**
     * Force refresh of current handler (useful for SPA navigation)
     */
    refresh() {
      this.cleanup();
      this.currentHandler = null;
    }
  }

  // Create singleton instance
  window.VSC.siteHandlerManager = new SiteHandlerManager();

  /* ===== Netflix page API userscript bridge ===== */
  /**
   * Netflix keeps seeking state in a page-global player API. In the userscript
   * this code runs in MAIN world; userscript managers expose the same object via
   * unsafeWindow while privileged GM APIs keep the rest of the script sandboxed.
   */
  (function installNetflixPageApiBridge() {
    if (location.hostname !== "www.netflix.com") {
      return;
    }
    const pageWindow =
      typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    pageWindow.addEventListener(
      "message",
      (event) => {
        if (
          event.source !== pageWindow ||
          event.origin !== "https://www.netflix.com" ||
          event.data?.action !== "hml5speed-seek" ||
          !event.data.seekMs
        ) {
          return;
        }
        try {
          const videoPlayer =
            pageWindow.netflix.appContext.state.playerApp.getAPI().videoPlayer;
          const playerSessionId = videoPlayer.getAllPlayerSessionIds()[0];
          const currentTime =
            videoPlayer.getCurrentTimeBySessionId(playerSessionId);
          videoPlayer
            .getVideoPlayerBySessionId(playerSessionId)
            .seek(currentTime + event.data.seekMs);
        } catch (error) {
          window.VSC.logger?.warn(`Netflix API seek failed: ${error.message}`);
        }
      },
      false,
    );
  })();

  /* ===== userscript runtime compatibility fixes ===== */
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

  /* ===== userscript runtime entry ===== */
  /**
   * HML5SpeedController — Main Content Script
   */

  class HML5SpeedControllerApp {
    constructor() {
      this.config = null;
      this.actionHandler = null;
      this.eventManager = null;
      this.mutationObserver = null;
      this.mediaObserver = null;
      this.initialized = false;
    }

    /**
     * Initialize the userscript
     */
    async initialize() {
      try {
        // Access global modules
        this.VideoController = window.VSC.VideoController;
        this.ActionHandler = window.VSC.ActionHandler;
        this.EventManager = window.VSC.EventManager;
        this.logger = window.VSC.logger;
        this.initializeWhenReady = window.VSC.DomUtils.initializeWhenReady;
        this.siteHandlerManager = window.VSC.siteHandlerManager;
        this.VideoMutationObserver = window.VSC.VideoMutationObserver;
        this.MediaElementObserver = window.VSC.MediaElementObserver;
        this.MESSAGE_TYPES = window.VSC.Constants.MESSAGE_TYPES;

        this.logger.info("HML5SpeedController starting...");

        this.config = window.VSC.videoSpeedConfig;
        await this.config.load();

        if (this.config.settings._abort) {
          this.logger.debug("Userscript disabled on this site — aborting init");
          return;
        }

        // Defer DOM work so page frameworks finish init before we mutate.
        this.deferDOMWork(document);
      } catch (error) {
        this.logger.error(
          `Failed to initialize HML5SpeedController: ${error.message}`,
        );
        this.logger.error(`Error stack: ${error.stack}`);
      }
    }

    /**
     * Initialize for a specific document
     * @param {Document} document - Document to initialize
     */
    initializeDocument(document) {
      try {
        if (window.VSC.initialized) {
          return;
        }

        window.VSC.initialized = true;
        this.eventManager.setupEventListeners(document);

        this.deferExpensiveOperations(document);
        this.logger.debug("Document initialization completed");
      } catch (error) {
        this.logger.error(`Failed to initialize document: ${error.message}`);
      }
    }

    /**
     * Defer expensive operations to avoid blocking page load
     * @param {Document} document - Document to defer operations for
     */
    deferExpensiveOperations(document) {
      const callback = () => {
        try {
          // Start mutation observer — catches dynamically added media elements
          if (this.mutationObserver) {
            this.mutationObserver.start(document);
            this.logger.debug("Mutation observer started for document");
          }

          // Defer media scanning to avoid blocking page load
          this.deferredMediaScan(document);
        } catch (error) {
          this.logger.error(
            `Failed to complete deferred operations: ${error.message}`,
          );
        }
      };

      if (window.requestIdleCallback) {
        requestIdleCallback(callback);
      } else {
        setTimeout(callback, 100);
      }
    }

    /**
     * Perform media scanning in a non-blocking way
     * @param {Document} document - Document to scan
     */
    deferredMediaScan(document) {
      // Split media scanning into smaller chunks to avoid blocking
      const performChunkedScan = () => {
        try {
          // Use a lighter initial scan - avoid expensive shadow DOM traversal initially
          const lightMedia = this.mediaObserver.scanForMediaLight(document);

          lightMedia.forEach((media) => {
            this.onVideoFound(media, media.parentElement || media.parentNode);
          });

          this.logger.info(
            `Attached controllers to ${lightMedia.length} media elements (light scan)`,
          );

          // Schedule comprehensive scan for later if needed
          if (lightMedia.length === 0) {
            this.scheduleComprehensiveScan(document);
          }
        } catch (error) {
          this.logger.error(`Failed to scan media elements: ${error.message}`);
        }
      };

      if (window.requestIdleCallback) {
        requestIdleCallback(performChunkedScan);
      } else {
        setTimeout(performChunkedScan, 200);
      }
    }

    /**
     * Schedule a comprehensive scan if the light scan didn't find anything
     * @param {Document} document - Document to scan comprehensively
     */
    scheduleComprehensiveScan(document) {
      // Only do comprehensive scan if we didn't find any media with light scan
      setTimeout(() => {
        try {
          const comprehensiveMedia = this.mediaObserver.scanAll(document);

          comprehensiveMedia.forEach((media) => {
            // Skip if already has controller
            if (!media.vsc) {
              this.onVideoFound(media, media.parentElement || media.parentNode);
            }
          });

          this.logger.info(
            `Comprehensive scan found ${comprehensiveMedia.length} additional media elements`,
          );
        } catch (error) {
          this.logger.error(`Failed comprehensive media scan: ${error.message}`);
        }
      }, 1000); // Wait 1 second before comprehensive scan
    }

    /**
     * Defer DOM work via requestIdleCallback to yield to site frameworks
     * before injecting CSS, controllers, and observers.
     */
    deferDOMWork(document) {
      const doWork = () => {
        this.injectControllerCSS();
        this.setupCSSLiveUpdates();
        this.siteHandlerManager.initialize(document);

        this.eventManager = new this.EventManager(this.config, null);
        this.actionHandler = new this.ActionHandler(
          this.config,
          this.eventManager,
        );
        this.eventManager.actionHandler = this.actionHandler;

        this.setupObservers();

        this.initializeWhenReady(document, (doc) => {
          this.initializeDocument(doc);
        });

        this.logger.info("HML5SpeedController initialized successfully");
        this.initialized = true;
      };

      if (window.requestIdleCallback) {
        requestIdleCallback(doWork);
      } else {
        setTimeout(doWork, 0);
      }
    }

    /**
     * Resolve domain-based CSS selectors for the current hostname.
     * Matching domains: selector stripped (rule applies unconditionally).
     * Non-matching: entire rule removed. Stripping (vs neutering with a dead
     * selector) ensures perf-sensitive selectors like [style*=...] inside
     * non-matching rules never reach the browser's style invalidation engine.
     */
    preprocessDomainCSS(css) {
      const hostname = location.hostname.replace(/^www\./, "");
      return css.replace(
        /:root\[style\*='--vsc-domain:\s*"([^"]+)"'\]([^{]*)\{([^}]*)\}/g,
        (match, domain, selector, body) =>
          domain === hostname ? `${selector.trim()} {${body}}` : "",
      );
    }

    /**
     * Inject controller CSS via adoptedStyleSheets — pure CSSOM, zero DOM
     * mutations. <style> elements trigger page-level MutationObservers on
     * sites with complex frameworks, breaking their internal state.
     *
     * Two separate sheets: _controllerSheet (built-in defaults, domain-
     * preprocessed, never changes at runtime) and _customSheet (user
     * additions, injected raw, live-updatable). Keeps them separate so
     * user CSS edits don't re-preprocess the defaults.
     */
    injectControllerCSS() {
      try {
        if (this._controllerSheet) {
          return;
        }
        this._controllerSheet = new CSSStyleSheet();
        this._controllerSheet.replaceSync(
          this.preprocessDomainCSS(window.VSC.Constants.DEFAULT_CONTROLLER_CSS),
        );
        const toAdopt = [this._controllerSheet];

        const customCSS = this.config.settings.customCSS || "";
        if (customCSS) {
          this._customSheet = new CSSStyleSheet();
          this._customSheet.replaceSync(customCSS);
          toAdopt.push(this._customSheet);
        }

        document.adoptedStyleSheets = [
          ...document.adoptedStyleSheets,
          ...toAdopt,
        ];
      } catch (error) {
        this.logger.error(`Failed to inject controller CSS: ${error.message}`);
      }
    }

    /** Live-update the user's custom CSS when options are saved. */
    setupCSSLiveUpdates() {
      document.documentElement.addEventListener("VSC_STORAGE_CHANGED", (e) => {
        if (
          e.detail?.customCSS?.newValue === undefined ||
          !this._controllerSheet
        ) {
          return;
        }
        const customCSS = e.detail.customCSS.newValue || "";
        if (customCSS) {
          if (!this._customSheet) {
            this._customSheet = new CSSStyleSheet();
            document.adoptedStyleSheets = [
              ...document.adoptedStyleSheets,
              this._customSheet,
            ];
          }
          this._customSheet.replaceSync(customCSS);
        } else if (this._customSheet) {
          document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
            (s) => s !== this._customSheet,
          );
          this._customSheet = null;
        }
      });
    }

    /**
     * Set up observers for DOM changes and video detection
     */
    setupObservers() {
      // Media element observer
      this.mediaObserver = new this.MediaElementObserver(
        this.config,
        this.siteHandlerManager,
      );

      // Mutation observer for dynamic content
      this.mutationObserver = new this.VideoMutationObserver(
        this.config,
        (video, parent) => this.onVideoFound(video, parent),
        (video) => this.onVideoRemoved(video),
        this.mediaObserver,
      );
    }

    /**
     * Handle newly found video element
     * @param {HTMLMediaElement} video - Video element
     * @param {HTMLElement} parent - Parent element
     */
    onVideoFound(video, parent) {
      try {
        if (
          this.mediaObserver &&
          !this.mediaObserver.isValidMediaElement(video)
        ) {
          this.logger.debug(
            "Video element is not valid for controller attachment",
          );
          return;
        }

        if (video.vsc) {
          this.logger.debug("Video already has controller attached");
          return;
        }

        // Defer until readyState >= HAVE_CURRENT_DATA — inserting a controller
        // too early can trigger the site's internal MutationObservers.
        if (video.readyState < 2) {
          this.logger.debug(
            "Deferring controller until loadeddata (readyState=%d)",
            video.readyState,
          );
          video.addEventListener(
            "loadeddata",
            () => this.onVideoFound(video, parent),
            {
              once: true,
            },
          );
          return;
        }

        // Check if controller should start hidden based on video visibility/size
        const shouldStartHidden = this.mediaObserver
          ? this.mediaObserver.shouldStartHidden(video)
          : false;

        this.logger.debug(
          "Attaching controller to new video element",
          shouldStartHidden ? "(starting hidden)" : "",
        );
        video.vsc = new this.VideoController(
          video,
          parent,
          this.config,
          this.actionHandler,
          shouldStartHidden,
        );
      } catch (error) {
        this.logger.error(
          `Failed to attach controller to video: ${error.message}`,
        );
      }
    }

    /**
     * Tear down the userscript: remove all controllers, stop observers, clean up listeners.
     * Counterpart to initialize() — leaves the page as if VSC was never active.
     */
    teardown() {
      if (!this.initialized) {
        return;
      }

      this.logger.info("Tearing down HML5SpeedController");

      // Remove all controllers from tracked media elements
      const videos = window.VSC.stateManager
        ? window.VSC.stateManager.getAllMediaElements()
        : [];
      for (const video of videos) {
        if (video.vsc) {
          video.vsc.remove();
        }
      }

      // Stop observing DOM for new videos
      if (this.mutationObserver) {
        this.mutationObserver.stop();
        this.mutationObserver = null;
      }

      // Remove keyboard/ratechange listeners
      if (this.eventManager) {
        this.eventManager.cleanup();
        this.eventManager = null;
      }

      // Clean up site-specific handlers
      if (this.siteHandlerManager) {
        this.siteHandlerManager.cleanup();
      }

      // Remove adopted controller CSS (both default and custom sheets)
      if (document.adoptedStyleSheets) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
          (s) => s !== this._controllerSheet && s !== this._customSheet,
        );
      }
      this._controllerSheet = null;
      this._customSheet = null;

      this.actionHandler = null;
      this.mediaObserver = null;
      this.initialized = false;
      window.VSC.initialized = false;
    }

    /**
     * Handle removed video element
     * @param {HTMLMediaElement} video - Video element
     */
    onVideoRemoved(video) {
      try {
        if (video.vsc) {
          this.logger.debug("Removing controller from video element");
          video.vsc.remove();
        }
      } catch (error) {
        this.logger.error(`Failed to remove video controller: ${error.message}`);
      }
    }
  }

  (function bootstrapRuntimeEntry() {
    function startRuntimeEntry() {
      const controllerApp = new HML5SpeedControllerApp();

      // Lifecycle commands from bridge (popup, background, storage changes)
      document.documentElement.addEventListener("VSC_MESSAGE", (event) => {
        const message = event.detail;

        // Handle namespaced VSC message types
        if (
          typeof message === "object" &&
          message.type &&
          message.type.startsWith("VSC_")
        ) {
          // Use state manager for complete media element discovery (includes shadow DOM)
          const videos = window.VSC.stateManager
            ? window.VSC.stateManager.getAllMediaElements()
            : [];

          switch (message.type) {
            case window.VSC.Constants.MESSAGE_TYPES.SET_SPEED:
              if (message.payload && typeof message.payload.speed === "number") {
                const { MIN, MAX } = window.VSC.Constants.SPEED_LIMITS;
                const targetSpeed = Math.min(
                  Math.max(message.payload.speed, MIN),
                  MAX,
                );
                videos.forEach((video) => {
                  if (video.vsc) {
                    controllerApp.actionHandler.adjustSpeed(video, targetSpeed);
                  } else {
                    video.playbackRate = targetSpeed;
                  }
                });

                // Log the successful operation
                window.VSC.logger?.debug(
                  `Set speed to ${targetSpeed} on ${videos.length} media elements`,
                );
              }
              break;

            case window.VSC.Constants.MESSAGE_TYPES.ADJUST_SPEED:
              if (message.payload && typeof message.payload.delta === "number") {
                const delta = message.payload.delta;
                videos.forEach((video) => {
                  if (video.vsc) {
                    controllerApp.actionHandler.adjustSpeed(video, delta, {
                      relative: true,
                    });
                  } else {
                    // Fallback for videos without controller
                    const { MIN: sMin, MAX: sMax } =
                      window.VSC.Constants.SPEED_LIMITS;
                    const newSpeed = Math.min(
                      Math.max(video.playbackRate + delta, sMin),
                      sMax,
                    );
                    video.playbackRate = newSpeed;
                  }
                });

                window.VSC.logger?.debug(
                  `Adjusted speed by ${delta} on ${videos.length} media elements`,
                );
              }
              break;

            case window.VSC.Constants.MESSAGE_TYPES.RESET_SPEED:
              videos.forEach((video) => {
                if (video.vsc) {
                  controllerApp.actionHandler.resetSpeed(video, 1.0);
                } else {
                  video.playbackRate = 1.0;
                }
              });

              window.VSC.logger?.debug(
                `Reset speed on ${videos.length} media elements`,
              );
              break;

            case window.VSC.Constants.MESSAGE_TYPES.TOGGLE_DISPLAY:
              if (controllerApp.actionHandler) {
                controllerApp.actionHandler.runAction("display", null, null);
              }
              break;

            case window.VSC.Constants.MESSAGE_TYPES.TEARDOWN:
              controllerApp.teardown();
              break;

            case window.VSC.Constants.MESSAGE_TYPES.REINIT:
              controllerApp.initialize();
              break;
          }
        }
      });

      // Prevent double injection
      if (window.HML5_controller && window.HML5_controller.initialized) {
        window.VSC.logger?.info("VSC already initialized, skipping re-injection");
        return;
      }

      // Auto-initialize
      controllerApp.initialize().catch((error) => {
        window.VSC.logger.error(
          `Userscript initialization failed: ${error.message}`,
        );
      });

      // Export only what's needed with consistent VSC_ prefix
      window.HML5_controller = controllerApp; // The initialized instance
    }

    if (document.documentElement) {
      startRuntimeEntry();
      return;
    }

    document.addEventListener("DOMContentLoaded", startRuntimeEntry, {
      once: true,
    });
  })();

  /* ===== userscript controls and settings ===== */
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

})();