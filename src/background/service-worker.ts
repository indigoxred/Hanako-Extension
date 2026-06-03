import { createContextMenu, TRANSLATE_IMAGE_MENU_ID } from "./context-menu.js";
import { translateImage } from "./hanako-client.js";
import { translateActiveTab } from "./translate-flow.js";
import { loadExtensionSettings } from "../options/extension-settings.js";
import {
  createDetectImagesMessage,
  createOpenJobUrl
} from "../popup/popup-actions.js";

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu(chrome);
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== TRANSLATE_IMAGE_MENU_ID) {
    return;
  }

  void translateContextMenuImage(info);
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (isDetectActiveTabMessage(message)) {
      void detectImagesInActiveTab().then((result) => sendResponse(result));
      return true;
    }

    if (isTranslateActiveTabMessage(message)) {
      void translateActiveTab().then((result) => sendResponse(result));
      return true;
    }

    return false;
  }
);

async function translateContextMenuImage(
  info: chrome.contextMenus.OnClickData
): Promise<void> {
  if (!info.srcUrl) {
    return;
  }

  const settings = await loadExtensionSettings();
  const detail = await translateImage({
    baseUrl: settings.hanakoBaseUrl,
    image: {
      ...(info.pageUrl ? { pageUrl: info.pageUrl } : {}),
      url: info.srcUrl
    },
    targetLanguage: settings.targetLanguage
  });

  await chrome.tabs.create({
    url: createOpenJobUrl({
      hanakoBaseUrl: settings.hanakoBaseUrl,
      jobId: detail.job.id
    })
  });
}

async function detectImagesInActiveTab(): Promise<
  | { ok: true; imageCount: number }
  | { ok: false; error: string }
> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return { error: "No active tab was available", ok: false };
  }

  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId: tab.id }
  });
  const detected = (await chrome.tabs.sendMessage(
    tab.id,
    createDetectImagesMessage()
  )) as { images?: unknown[]; ok: boolean };

  return { imageCount: detected.images?.length ?? 0, ok: true };
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

function isTranslateActiveTabMessage(
  message: unknown
): message is { type: "HANAKO_TRANSLATE_ACTIVE_TAB" } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_TRANSLATE_ACTIVE_TAB"
  );
}
