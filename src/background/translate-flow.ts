import {
  clearBrowserActiveExtensionJob,
  trackBrowserActiveExtensionJob,
  type TrackActiveExtensionJobInput
} from "./active-job-poller.js";
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

export interface ReplaceImagesMessageInput {
  replacements: Array<{
    domIndex?: number;
    domId?: string;
    renderedUrl: string;
  }>;
}

export interface ReplaceImagesResponse {
  ok: boolean;
  replaced: number;
}

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
  await trackActiveJob({
    baseUrl: settings.hanakoBaseUrl,
    imageCount: uploadImages.length,
    jobId: detail.job.id,
    replacements: uploadImages.map((image) => ({
      ...(image.domId ? { domId: image.domId } : {}),
      ...(image.domIndex === undefined ? {} : { domIndex: image.domIndex }),
      ...(image.url ? { sourceUrl: image.url } : {})
    })),
    tabId: tab.id
  });

  const completed = await waitForJobCompletion({
    baseUrl: settings.hanakoBaseUrl,
    jobId: detail.job.id,
    requiredRenderedPages: uploadImages.length
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
    images: uploadImages,
    jobId: detail.job.id,
    pages: completed.detail.pages ?? []
  });
  const replaced = await sendReplaceImagesMessage(tab.id, { replacements });
  await clearActiveJob({ jobId: detail.job.id, tabId: tab.id });

  return {
    imageCount: uploadImages.length,
    jobId: detail.job.id,
    ok: true,
    replacementCount: replaced.replaced,
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

function buildReplacementInstructions(input: {
  baseUrl: string;
  images: ExtensionImageCandidate[];
  jobId: string;
  pages: Array<{ id: string; renderedAssetId?: string }>;
}): ReplaceImagesMessageInput["replacements"] {
  return input.images.flatMap((image, index) => {
    const page = input.pages[index];

    if (
      !page?.renderedAssetId ||
      (image.domIndex === undefined && !image.domId)
    ) {
      return [];
    }

    return [
      {
        ...(image.domIndex === undefined ? {} : { domIndex: image.domIndex }),
        ...(image.domId ? { domId: image.domId } : {}),
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
