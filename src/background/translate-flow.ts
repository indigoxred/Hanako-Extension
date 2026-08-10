import {
  clearBrowserActiveExtensionJob,
  attemptRenderedPageDelivery,
  RENDERED_PAGE_DELIVERY_FAILED_MESSAGE,
  trackBrowserActiveExtensionJob,
  type TrackActiveExtensionJobInput,
  type ReplaceImagesMessageInput,
  type ReplaceImagesResponse
} from "./active-job-poller.js";
import {
  translatePage as defaultTranslatePage,
  type ExtensionImageCandidate,
  type ExtensionJobDetail,
  type TranslatePageInput
} from "./hanako-client.js";
import {
  waitForJobCompletion as defaultWaitForJobCompletion,
  type WaitForJobCompletionInput,
  type WaitForJobCompletionResult
} from "./job-poller.js";
import { withRequiredImageBytes, type FetchImageBytes } from "./image-bytes.js";
import { loadExtensionSettings } from "../options/extension-settings.js";
import { createDetectImagesMessage } from "../popup/popup-actions.js";

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

export interface TranslateActiveTabDependencies {
  executeContentScript?: (tabId: number) => Promise<void>;
  fetchImageBytes?: FetchImageBytes;
  loadSettings?: () => Promise<ExtensionSettings>;
  onTabResolved?: (tabId: number) => Promise<void> | void;
  openTab?: (url: string) => Promise<void>;
  queryActiveTab?: () => Promise<{ id?: number }>;
  sendDetectImagesMessage?: (tabId: number) => Promise<DetectImagesResponse>;
  sendReplaceImagesMessage?: (
    tabId: number,
    input: ReplaceImagesMessageInput
  ) => Promise<ReplaceImagesResponse>;
  translatePage?: (input: TranslatePageInput) => Promise<ExtensionJobDetail>;
  trackActiveJob?: (input: TrackActiveExtensionJobInput) => Promise<void>;
  clearActiveJob?: (input: { jobId: string; tabId: number }) => Promise<void>;
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
  const fetchImageBytes = dependencies.fetchImageBytes;
  const loadSettings = dependencies.loadSettings ?? loadExtensionSettings;
  const translatePage = dependencies.translatePage ?? defaultTranslatePage;
  const trackActiveJob =
    dependencies.trackActiveJob ?? trackBrowserActiveExtensionJob;
  const clearActiveJob =
    dependencies.clearActiveJob ?? clearBrowserActiveExtensionJob;
  const waitForJobCompletion =
    dependencies.waitForJobCompletion ?? defaultWaitForJobCompletion;
  const tab = await queryActiveTab();

  if (!tab.id) {
    return { error: "No active tab was available", ok: false };
  }
  const activeTabId = tab.id;

  await dependencies.onTabResolved?.(tab.id);
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
  const uploadImages = await resolveUploadImages(images, fetchImageBytes);

  if (uploadImages.length === 0) {
    return {
      error: "The extension could not extract bytes for this image",
      ok: false
    };
  }

  const detail = await translatePage({
    autoGlossaryStorageScopeId: settings.autoGlossaryStorageScopeId,
    baseUrl: settings.hanakoBaseUrl,
    glossaryScopeIds: settings.glossaryScopeIds,
    images: uploadImages,
    profileId: settings.profileId,
    targetLanguage: settings.targetLanguage
  });
  const activeJob: TrackActiveExtensionJobInput = {
    baseUrl: settings.hanakoBaseUrl,
    imageCount: uploadImages.length,
    jobId: detail.job.id,
    replacements: uploadImages.map((image) => ({
      ...(image.domId ? { domId: image.domId } : {}),
      ...(image.domIndex === undefined ? {} : { domIndex: image.domIndex }),
      ...(image.url ? { sourceUrl: image.url } : {})
    })),
    tabId: tab.id
  };
  await trackActiveJob(activeJob);

  const completed = await waitForJobCompletion({
    baseUrl: settings.hanakoBaseUrl,
    jobId: detail.job.id
  });

  if (completed.status === "failed") {
    await clearActiveJob({ jobId: detail.job.id, tabId: tab.id });
    return {
      error: completed.detail.error?.message ?? "Hanako job failed",
      jobId: detail.job.id,
      ok: false,
      status: "failed"
    };
  }

  if (completed.status === "timeout") {
    if (completed.detail.job.status === "completed") {
      await clearActiveJob({ jobId: detail.job.id, tabId: tab.id });
      return {
        error: RENDERED_PAGE_DELIVERY_FAILED_MESSAGE,
        jobId: detail.job.id,
        ok: false,
        status: "failed"
      };
    }

    return {
      imageCount: images.length,
      jobId: detail.job.id,
      ok: true,
      replacementCount: 0,
      status: "timeout"
    };
  }

  let delivery: Awaited<ReturnType<typeof attemptRenderedPageDelivery>>;

  try {
    delivery = await attemptRenderedPageDelivery(activeJob, completed.detail, {
      executeContentScript,
      sendReplaceImagesMessage
    });
  } finally {
    await clearActiveJob({ jobId: detail.job.id, tabId: activeTabId });
  }

  if (!delivery.delivered) {
    return {
      error: RENDERED_PAGE_DELIVERY_FAILED_MESSAGE,
      jobId: detail.job.id,
      ok: false,
      status: "failed"
    };
  }

  return {
    imageCount: uploadImages.length,
    jobId: detail.job.id,
    ok: true,
    replacementCount: delivery.replacementCount,
    status: "completed"
  };
}

async function resolveUploadImages(
  images: ExtensionImageCandidate[],
  fetchImageBytes?: FetchImageBytes
): Promise<ExtensionImageCandidate[]> {
  const uploadImages: ExtensionImageCandidate[] = [];

  for (const image of images) {
    try {
      uploadImages.push(await withRequiredImageBytes(image, fetchImageBytes));
    } catch {
      // Page detection can include icons, SVGs, blocked CDN URLs, and other
      // non-page images. Keep valid pages moving instead of failing the batch.
    }
  }

  return uploadImages;
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
