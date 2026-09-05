// Sea Power Mission Companion - Content Script
// Injected into Theater Command web app to enable direct 1-click mission installation

(function () {
  const EXTENSION_VERSION = "1.0.0";

  // Mark DOM root element so main page context can immediately detect presence
  try {
    if (document.documentElement) {
      document.documentElement.setAttribute(
        "data-theater-companion-installed",
        "true",
      );
      document.documentElement.setAttribute(
        "data-theater-companion-version",
        EXTENSION_VERSION,
      );
    }
  } catch {
    // Ignore error
  }

  // Notify page that extension is active
  window.__THEATER_COMMAND_COMPANION_INSTALLED__ = true;
  window.__THEATER_COMMAND_COMPANION_VERSION__ = EXTENSION_VERSION;

  // Dispatch custom DOM events on both window and document
  const readyEvent = new CustomEvent("theater-command-companion-ready", {
    detail: { version: EXTENSION_VERSION },
  });
  window.dispatchEvent(readyEvent);
  document.dispatchEvent(readyEvent);

  // Handle postMessage communication from web app
  window.addEventListener("message", function (event) {
    if (
      event.source !== window ||
      !event.data ||
      typeof event.data !== "object"
    ) {
      return;
    }

    const { action, payload, requestId } = event.data;

    if (action === "THEATER_COMMAND_PING") {
      // Respond IMMEDIATELY with PONG
      window.postMessage(
        {
          action: "THEATER_COMMAND_PONG",
          requestId,
          payload: {
            installed: true,
            version: EXTENSION_VERSION,
            config: { targetSubfolder: "SeaPower/user/missions" },
          },
        },
        "*",
      );

      // Also retrieve latest config from background worker if needed
      chrome.runtime.sendMessage({ action: "GET_CONFIG" }, function (response) {
        if (response && response.ok) {
          window.postMessage(
            {
              action: "THEATER_COMMAND_CONFIG",
              payload: response,
            },
            "*",
          );
        }
      });
      return;
    }

    if (action === "THEATER_COMMAND_INSTALL_MISSION") {
      chrome.runtime.sendMessage(
        {
          action: "INSTALL_MISSION",
          payload: payload,
        },
        function (response) {
          window.postMessage(
            {
              action: "THEATER_COMMAND_INSTALL_RESULT",
              requestId,
              payload: response || {
                ok: false,
                message: "No response from extension background worker",
              },
            },
            "*",
          );
        },
      );
      return;
    }
  });

  console.log(
    "[SeaPowerCompanion] Content script initialized (v" +
      EXTENSION_VERSION +
      ")",
  );
})();
