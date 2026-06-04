import {
  translatePage as defaultTranslatePage,
  type ExtensionImageCandidate,
  type ExtensionJobDetail,
  type TranslatePageInput
} from "./hanako-client.js";
import {
  createRenderedPageUrl,
  waitForJobCompletion as defaultWaitForJobCompletion,
  type WaitForJobCompletionInput,
  type WaitForJobCompletionResult
} from "./job-poller.js";
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
  | {
      ok: true;
      imageCount: number;
      jobId: string;
      replacementCount: number;
      status: "completed" | "timeout";
    }
  | { ok: false; error: string; jobId?: string; status?: "failed" };

export interface ReplaceImagesMessageInput {
  replacements: Array<{
    domIndex: number;
    renderedUrl: string;
  }>;
}

export interface ReplaceImagesResponse {
  ok: boolean;
  replaced: number;
}

export interface TranslateActiveTabDependencies {
  executeContentScript?: (tabId: number) => Promise<void>;
  loadSettings?: () => Promise<ExtensionSettings>;
  openTab?: (url: string) => Promise<void>;
  queryActiveTab?: () => Promise<{ id?: number }>;
  sendDetectImagesMessage?: (tabId: number) => Promise<DetectImagesResponse>;
  sendReplaceImagesMessage?: (
    tabId: number,
    input: ReplaceImagesMessageInput
  ) => Promise<ReplaceImagesResponse>;
  translatePage?: (input: TranslatePageInput) => Promise<ExtensionJobDetail>;
  waitForJobCompletion?: (
    input: WaitForJobCompletionInput
  ) => Promise<WaitForJobCompletionResult>;
}

export async function translateActiveTab(
  dependencies: TranslateActiveTabDependencies = {}
): Promise<TranslateActiveTabResult> {
  const queryActiveTab = dependencies.queryActiveTab ?? defaultQueryActiveTab;
  const executeContentScript =
    dependencies.executeContentScript ?? defaultExecuteContentScript;
  const sendDetectImagesMessage =
    dependencies.sendDetectImagesMessage ?? defaultSendDetectImagesMessage;
  const sendReplaceImagesMessage =
    dependencies.sendReplaceImagesMessage ?? defaultSendReplaceImagesMessage;
  const loadSettings = dependencies.loadSettings ?? loadExtensionSettings;
  const translatePage = dependencies.translatePage ?? defaultTranslatePage;
  const waitForJobCompletion =
    dependencies.waitForJobCompletion ?? defaultWaitForJobCompletion;
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
    ...(image.pageUrl || !detected.pageUrl ? {} : { pageUrl: detected.pageUrl })
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

  const completed = await waitForJobCompletion({
    baseUrl: settings.hanakoBaseUrl,
    jobId: detail.job.id
  });

  if (completed.status === "failed") {
    return {
      error: completed.detail.error?.message ?? "Hanako job failed",
      jobId: detail.job.id,
      ok: false,
      status: "failed"
    };
  }

  if (completed.status === "timeout") {
    return {
      imageCount: images.length,
      jobId: detail.job.id,
      ok: true,
      replacementCount: 0,
      status: "timeout"
    };
  }

  const replacements = buildReplacementInstructions({
    baseUrl: settings.hanakoBaseUrl,
    images,
    jobId: detail.job.id,
    pages: completed.detail.pages ?? []
  });
  const replaced = await sendReplaceImagesMessage(tab.id, { replacements });

  return {
    imageCount: images.length,
    jobId: detail.job.id,
    ok: true,
    replacementCount: replaced.replaced,
    status: "completed"
  };
}

function buildReplacementInstructions(input: {
  baseUrl: string;
  images: ExtensionImageCandidate[];
  jobId: string;
  pages: Array<{ id: string; renderedAssetId?: string }>;
}): ReplaceImagesMessageInput["replacements"] {
  return input.images.flatMap((image, index) => {
    const page = input.pages[index];

    if (!page?.renderedAssetId || image.domIndex === undefined) {
      return [];
    }

    return [
      {
        domIndex: image.domIndex,
        renderedUrl: createRenderedPageUrl({
          baseUrl: input.baseUrl,
          jobId: input.jobId,
          pageId: page.id
        })
      }
    ];
  });
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

async function defaultSendReplaceImagesMessage(
  tabId: number,
  input: ReplaceImagesMessageInput
): Promise<ReplaceImagesResponse> {
  return (await chrome.tabs.sendMessage(tabId, {
    ...input,
    type: "HANAKO_REPLACE_IMAGES"
  })) as ReplaceImagesResponse;
}

async function defaultOpenTab(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}
