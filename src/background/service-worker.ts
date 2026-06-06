import {
  createContextMenu,
  QUEUE_IMAGE_MENU_ID,
  SEND_QUEUE_MENU_ID,
  TRANSLATE_IMAGE_MENU_ID
} from "./context-menu.js";
import { createJobManager } from "./job-manager.js";
import { createDetectImagesMessage } from "../popup/popup-actions.js";

const jobManager = createJobManager();

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu(chrome);
  void jobManager.getQueueStatus().then((result) => {
    if (result.ok) {
      void chrome.action.setBadgeText({
        text: result.count ? String(result.count) : ""
      });
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const context = {
    ...(info.pageUrl ? { pageUrl: info.pageUrl } : {}),
    ...(info.srcUrl ? { srcUrl: info.srcUrl } : {}),
    ...(tab?.id ? { tabId: tab.id } : {}),
    ...(tab?.windowId === undefined ? {} : { windowId: tab.windowId })
  };

  if (info.menuItemId === TRANSLATE_IMAGE_MENU_ID) {
    void jobManager.translateContextMenuImage(context).catch(() => undefined);
  }

  if (info.menuItemId === QUEUE_IMAGE_MENU_ID) {
    void jobManager.queueContextMenuImage(context).catch(() => undefined);
  }

  if (info.menuItemId === SEND_QUEUE_MENU_ID) {
    void jobManager.sendQueuedImages().catch(() => undefined);
  }
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (isDetectActiveTabMessage(message)) {
      respond(sendResponse, detectImagesInActiveTab());
      return true;
    }

    if (isTranslateActiveTabMessage(message)) {
      respond(sendResponse, jobManager.translateActiveTab());
      return true;
    }

    if (isGetQueueStatusMessage(message)) {
      respond(sendResponse, jobManager.getQueueStatus());
      return true;
    }

    if (isSendQueueMessage(message)) {
      respond(sendResponse, jobManager.sendQueuedImages());
      return true;
    }

    if (isClearQueueMessage(message)) {
      respond(sendResponse, jobManager.clearQueue());
      return true;
    }

    if (isClearTranslationsActiveTabMessage(message)) {
      respond(sendResponse, clearTranslationsInActiveTab());
      return true;
    }

    return false;
  }
);

async function detectImagesInActiveTab(): Promise<
  { ok: true; imageCount: number } | { ok: false; error: string }
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

function respond(
  sendResponse: (response?: unknown) => void,
  promise: Promise<unknown>
): void {
  void promise
    .then((result) => sendResponse(result))
    .catch((error: unknown) =>
      sendResponse({
        error:
          error instanceof Error ? error.message : "Extension action failed",
        ok: false
      })
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

function isGetQueueStatusMessage(
  message: unknown
): message is { type: "HANAKO_GET_QUEUE_STATUS" } {
  return isMessageType(message, "HANAKO_GET_QUEUE_STATUS");
}

function isSendQueueMessage(
  message: unknown
): message is { type: "HANAKO_SEND_QUEUE" } {
  return isMessageType(message, "HANAKO_SEND_QUEUE");
}

function isClearQueueMessage(
  message: unknown
): message is { type: "HANAKO_CLEAR_QUEUE" } {
  return isMessageType(message, "HANAKO_CLEAR_QUEUE");
}

function isClearTranslationsActiveTabMessage(
  message: unknown
): message is { type: "HANAKO_CLEAR_TRANSLATIONS_ACTIVE_TAB" } {
  return isMessageType(message, "HANAKO_CLEAR_TRANSLATIONS_ACTIVE_TAB");
}

function isMessageType(message: unknown, type: string): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === type
  );
}

async function clearTranslationsInActiveTab(): Promise<
  { ok: true; restored: number } | { ok: false; error: string }
> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return { error: "No active tab was available", ok: false };
  }

  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId: tab.id }
  });

  return (await chrome.tabs.sendMessage(tab.id, {
    type: "HANAKO_CLEAR_TRANSLATIONS"
  })) as { ok: true; restored: number } | { ok: false; error: string };
}
