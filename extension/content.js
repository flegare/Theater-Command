// Sea Power Mission Companion - Content Script
// Injected into Theater Command web app to enable direct 1-click mission installation

(function () {
  const EXTENSION_VERSION = "1.0.0";

  // Notify page that extension is active
  window.__THEATER_COMMAND_COMPANION_INSTALLED__ = true;
  window.__THEATER_COMMAND_COMPANION_VERSION__ = EXTENSION_VERSION;

  // Dispatch custom DOM event
  window.dispatchEvent(
    new CustomEvent("theater-command-companion-ready", {
      detail: { version: EXTENSION_VERSION },
    }),
  );

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
      chrome.runtime.sendMessage({ action: "GET_CONFIG" }, function (response) {
        window.postMessage(
          {
            action: "THEATER_COMMAND_PONG",
            requestId,
            payload: {
              installed: true,
              version: EXTENSION_VERSION,
              config: response || { targetSubfolder: "SeaPower/user/missions" },
            },
          },
          "*",
        );
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
