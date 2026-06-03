import {
  translatePage as defaultTranslatePage,
  type ExtensionImageCandidate,
  type ExtensionJobDetail,
  type TranslatePageInput
} from "./hanako-client.js";
import { loadExtensionSettings } from "../options/extension-settings.js";
import {
  createDetectImagesMessage,
  createOpenJobUrl
} from "../popup/popup-actions.js";

import type { ExtensionSettings } from "../options/extension-settings.js";

export interface DetectImagesResponse {
  ok: boolean;
  error?: string;
  images?: ExtensionImageCandidate[];
  pageUrl?: string;
}

export type TranslateActiveTabResult =
  | { ok: true; imageCount: number; jobId: string }
  | { ok: false; error: string };

export interface TranslateActiveTabDependencies {
  executeContentScript?: (tabId: number) => Promise<void>;
  loadSettings?: () => Promise<ExtensionSettings>;
  openTab?: (url: string) => Promise<void>;
  queryActiveTab?: () => Promise<{ id?: number }>;
  sendDetectImagesMessage?: (tabId: number) => Promise<DetectImagesResponse>;
  translatePage?: (input: TranslatePageInput) => Promise<ExtensionJobDetail>;
}

export async function translateActiveTab(
  dependencies: TranslateActiveTabDependencies = {}
): Promise<TranslateActiveTabResult> {
  const queryActiveTab = dependencies.queryActiveTab ?? defaultQueryActiveTab;
  const executeContentScript =
    dependencies.executeContentScript ?? defaultExecuteContentScript;
  const sendDetectImagesMessage =
    dependencies.sendDetectImagesMessage ?? defaultSendDetectImagesMessage;
  const loadSettings = dependencies.loadSettings ?? loadExtensionSettings;
  const translatePage = dependencies.translatePage ?? defaultTranslatePage;
  const openTab = dependencies.openTab ?? defaultOpenTab;
  const tab = await queryActiveTab();

  if (!tab.id) {
    return { error: "No active tab was available", ok: false };
  }

  await executeContentScript(tab.id);
  const detected = await sendDetectImagesMessage(tab.id);

  if (!detected.ok) {
    return {
      error: detected.error ?? "Image detection failed",
      ok: false
    };
  }

  const images = (detected.images ?? []).map((image) => ({
    ...image,
    ...(image.pageUrl || !detected.pageUrl
      ? {}
      : { pageUrl: detected.pageUrl })
  }));

  if (images.length === 0) {
    return { error: "No manga images were detected", ok: false };
  }

  const settings = await loadSettings();
  const detail = await translatePage({
    baseUrl: settings.hanakoBaseUrl,
    images,
    targetLanguage: settings.targetLanguage
  });

  await openTab(
    createOpenJobUrl({
      hanakoBaseUrl: settings.hanakoBaseUrl,
      jobId: detail.job.id
    })
  );

  return {
    imageCount: images.length,
    jobId: detail.job.id,
    ok: true
  };
}

async function defaultQueryActiveTab(): Promise<{ id?: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ? { id: tab.id } : {};
}

async function defaultExecuteContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId }
  });
}

async function defaultSendDetectImagesMessage(
  tabId: number
): Promise<DetectImagesResponse> {
  return (await chrome.tabs.sendMessage(
    tabId,
    createDetectImagesMessage()
  )) as DetectImagesResponse;
}

async function defaultOpenTab(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}
