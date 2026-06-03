import { createContextMenu, TRANSLATE_IMAGE_MENU_ID } from "./context-menu.js";
import { createDetectImagesMessage } from "../popup/popup-actions.js";

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu(chrome);
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== TRANSLATE_IMAGE_MENU_ID) {
    return;
  }

  void chrome.storage.local.set({
    lastHanakoImageUrl: info.srcUrl ?? null
  });
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!isDetectActiveTabMessage(message)) {
      return false;
    }

    void detectImagesInActiveTab().then((ok) => sendResponse({ ok }));
    return true;
  }
);

async function detectImagesInActiveTab(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return false;
  }

  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId: tab.id }
  });
  await chrome.tabs.sendMessage(tab.id, createDetectImagesMessage());
  return true;
}

function isDetectActiveTabMessage(
  message: unknown
): message is { type: "HANAKO_DETECT_ACTIVE_TAB" } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_DETECT_ACTIVE_TAB"
  );
}
