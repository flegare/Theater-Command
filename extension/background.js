// Sea Power Mission Companion - Background Service Worker

const DEFAULT_TARGET_SUBFOLDER = "SeaPower/user/missions";

// Initialize default storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["targetSubfolder"], (res) => {
    if (!res.targetSubfolder) {
      chrome.storage.local.set({ targetSubfolder: DEFAULT_TARGET_SUBFOLDER });
    }
  });
  console.log("[SeaPowerCompanion] Background service worker installed.");
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  if (request.action === "GET_CONFIG") {
    chrome.storage.local.get(["targetSubfolder"], (res) => {
      sendResponse({
        ok: true,
        targetSubfolder: res.targetSubfolder || DEFAULT_TARGET_SUBFOLDER,
        version: "1.0.0",
      });
    });
    return true; // async
  }

  if (request.action === "SET_CONFIG") {
    const newFolder = (
      request.targetSubfolder || DEFAULT_TARGET_SUBFOLDER
    ).trim();
    chrome.storage.local.set({ targetSubfolder: newFolder }, () => {
      sendResponse({ ok: true, targetSubfolder: newFolder });
    });
    return true;
  }

  if (request.action === "INSTALL_MISSION") {
    const { fileName, missionText } = request.payload || {};

    if (!fileName || !missionText) {
      sendResponse({
        ok: false,
        message: "Missing fileName or missionText payload",
      });
      return false;
    }

    // Force .ini extension for the actual Sea Power destination file
    let cleanFileName = fileName.replace(/\.(mis|seapowermis|txt)$/i, "");
    if (!cleanFileName.toLowerCase().endsWith(".ini")) {
      cleanFileName += ".ini";
    }

    chrome.storage.local.get(["targetSubfolder"], (res) => {
      const subfolder = res.targetSubfolder || DEFAULT_TARGET_SUBFOLDER;
      const cleanSubfolder = subfolder
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "");
      const fullRelativePath = cleanSubfolder
        ? cleanSubfolder + "/" + cleanFileName
        : cleanFileName;

      // Encode mission text to data URI with octet-stream to prevent text rendering
      const dataUri =
        "data:text/plain;charset=utf-8," + encodeURIComponent(missionText);

      chrome.downloads.download(
        {
          url: dataUri,
          filename: fullRelativePath,
          conflictAction: "overwrite",
          saveAs: false,
        },
        (downloadId) => {
          if (chrome.runtime.lastError || !downloadId) {
            const errMsg = chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : "Download failed";
            console.error("[SeaPowerCompanion] Download failed:", errMsg);
            sendResponse({
              ok: false,
              message: errMsg,
              fullPath: fullRelativePath,
            });
          } else {
            console.log(
              "[SeaPowerCompanion] Mission saved via download ID:",
              downloadId,
              fullRelativePath,
            );
            sendResponse({
              ok: true,
              downloadId,
              fileName: cleanFileName,
              fullRelativePath,
              message: "Mission installed to " + fullRelativePath,
            });
          }
        },
      );
    });

    return true; // async response
  }

  return false;
});
