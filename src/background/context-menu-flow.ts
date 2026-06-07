import {
  clearBrowserActiveExtensionJob,
  trackBrowserActiveExtensionJob,
  type TrackActiveExtensionJobInput
} from "./active-job-poller.js";
import {
  translateImage as defaultTranslateImage,
  type ExtensionImageCandidate,
  type ExtensionJobDetail,
  type TranslateImageInput
} from "./hanako-client.js";
import {
  withImageBytes,
  type FetchImageBytes,
  type ImageBytesPayload
} from "./image-bytes.js";
import {
  captureVisibleElementBitmap as defaultCaptureVisibleElementBitmap,
  type VisibleElementRect
} from "./visible-tab-capture.js";
import {
  createRenderedPageUrl,
  waitForJobCompletion as defaultWaitForJobCompletion,
  type WaitForJobCompletionInput,
  type WaitForJobCompletionResult
} from "./job-poller.js";
import { loadExtensionSettings } from "../options/extension-settings.js";

import type { ExtensionSettings } from "../options/extension-settings.js";

export interface ContextMenuImageContext {
  srcUrl?: string;
  pageUrl?: string;
  tabId?: number;
  windowId?: number;
}

export type ContextMenuTranslationResult =
  | {
      ok: true;
      jobId: string;
      replacementCount: number;
      status: "completed" | "timeout";
      warning?: string;
    }
  | { ok: false; error: string; jobId?: string; status?: "failed" };

export interface ContextMenuTranslationPhase {
  jobId?: string;
  message: string;
  phase:
    | "capturing-image"
    | "submitting-job"
    | "waiting-for-job"
    | "replacing-image"
    | "completed"
    | "failed"
    | "timeout";
}

export interface ReplaceContextImageInput {
  domIndex?: number;
  domId?: string;
  renderedUrl: string;
  sourceUrl: string;
}

export interface ContextImageBytesPayload extends ImageBytesPayload {
  domIndex?: number;
  domId?: string;
  warning?: string;
}

export interface CaptureContextImageInput {
  pageUrl?: string;
  sourceUrl: string;
  tabId: number;
  windowId?: number;
}

export type CaptureContextImageBytes = (
  input: CaptureContextImageInput
) => Promise<ContextImageBytesPayload | undefined>;

export type CaptureContextImageBytesInNewTab = (
  input: CaptureContextImageInput
) => Promise<ContextImageBytesPayload | undefined>;

export type CaptureVisibleContextImageBytes = (
  input: CaptureContextImageInput
) => Promise<ContextImageBytesPayload | undefined>;

export interface ResolveContextImageBytesDependencies {
  captureImageBytes?: CaptureContextImageBytes;
  captureImageBytesInNewTab?: CaptureContextImageBytesInNewTab;
  captureVisibleImageBytes?: CaptureVisibleContextImageBytes;
  fetchImageBytes?: FetchImageBytes;
}

interface ResolvedContextImageCandidate extends ExtensionImageCandidate {
  warning?: string;
}

export interface TranslateContextMenuImageDependencies {
  captureImageBytes?: CaptureContextImageBytes;
  captureImageBytesInNewTab?: CaptureContextImageBytesInNewTab;
  captureVisibleImageBytes?: CaptureVisibleContextImageBytes;
  context: ContextMenuImageContext;
  fetchImageBytes?: FetchImageBytes;
  loadSettings?: () => Promise<ExtensionSettings>;
  onPhase?: (phase: ContextMenuTranslationPhase) => Promise<void> | void;
  openTab?: (url: string) => Promise<void>;
  replaceImage?: (
    tabId: number,
    replacement: ReplaceContextImageInput
  ) => Promise<{ ok: boolean; replaced: number }>;
  translateImage?: (input: TranslateImageInput) => Promise<ExtensionJobDetail>;
  trackActiveJob?: (input: TrackActiveExtensionJobInput) => Promise<void>;
  clearActiveJob?: (input: { jobId: string; tabId: number }) => Promise<void>;
  waitForJobCompletion?: (
    input: WaitForJobCompletionInput
  ) => Promise<WaitForJobCompletionResult>;
}

export async function translateContextMenuImage({
  captureImageBytes,
  captureImageBytesInNewTab,
  captureVisibleImageBytes,
  context,
  fetchImageBytes,
  loadSettings = loadExtensionSettings,
  onPhase,
  replaceImage = defaultReplaceImage,
  translateImage = defaultTranslateImage,
  trackActiveJob = trackBrowserActiveExtensionJob,
  clearActiveJob = clearBrowserActiveExtensionJob,
  waitForJobCompletion = defaultWaitForJobCompletion
}: TranslateContextMenuImageDependencies): Promise<ContextMenuTranslationResult> {
  if (!context.srcUrl) {
    return { error: "No clicked image URL was available", ok: false };
  }

  if (!context.tabId) {
    return { error: "No source tab was available", ok: false };
  }

  const settings = await loadSettings();
  await emitPhase(onPhase, {
    message: "Capturing clicked image",
    phase: "capturing-image"
  });
  const image = await resolveContextImageBytes(
    {
      ...(context.pageUrl ? { pageUrl: context.pageUrl } : {}),
      sourceUrl: context.srcUrl,
      tabId: context.tabId,
      ...(context.windowId === undefined ? {} : { windowId: context.windowId })
    },
    {
      captureImageBytes,
      captureImageBytesInNewTab,
      captureVisibleImageBytes,
      fetchImageBytes
    }
  );

  if (!image?.bytesBase64 || !image.mediaType) {
    await emitPhase(onPhase, {
      message: "The extension could not extract bytes for this image",
      phase: "failed"
    });
    return {
      error: "The extension could not extract bytes for this image",
      ok: false
    };
  }

  if (image.warning) {
    await emitPhase(onPhase, {
      message: image.warning,
      phase: "capturing-image"
    });
  }

  const uploadImage = withoutCaptureWarning(image);

  await emitPhase(onPhase, {
    message: "Submitting image to Hanako",
    phase: "submitting-job"
  });
  const detail = await translateImage({
    baseUrl: settings.hanakoBaseUrl,
    image: uploadImage,
    targetLanguage: settings.targetLanguage
  });
  await emitPhase(onPhase, {
    jobId: detail.job.id,
    message: "Waiting for Hanako job",
    phase: "waiting-for-job"
  });
  await trackActiveJob({
    baseUrl: settings.hanakoBaseUrl,
    imageCount: 1,
    jobId: detail.job.id,
    replacements: [
      {
        ...(image.domId ? { domId: image.domId } : {}),
        ...(image.domIndex === undefined ? {} : { domIndex: image.domIndex }),
        sourceUrl: context.srcUrl
      }
    ],
    tabId: context.tabId
  });
  const completed = await waitForJobCompletion({
    baseUrl: settings.hanakoBaseUrl,
    jobId: detail.job.id
  });

  if (completed.status === "failed") {
    await clearActiveJob({ jobId: detail.job.id, tabId: context.tabId });
    await emitPhase(onPhase, {
      jobId: detail.job.id,
      message: completed.detail.error?.message ?? "Hanako job failed",
      phase: "failed"
    });
    return {
      error: completed.detail.error?.message ?? "Hanako job failed",
      jobId: detail.job.id,
      ok: false,
      status: "failed"
    };
  }

  if (completed.status === "timeout") {
    await emitPhase(onPhase, {
      jobId: detail.job.id,
      message: "Hanako job is still processing",
      phase: "timeout"
    });
    return {
      jobId: detail.job.id,
      ok: true,
      replacementCount: 0,
      status: "timeout",
      ...(image.warning ? { warning: image.warning } : {})
    };
  }

  const page = completed.detail.pages?.[0];

  if (!page?.renderedAssetId) {
    await clearActiveJob({ jobId: detail.job.id, tabId: context.tabId });
    await emitPhase(onPhase, {
      jobId: detail.job.id,
      message: "Hanako job completed without a rendered page",
      phase: "failed"
    });
    return {
      error: "Hanako job completed without a rendered page",
      jobId: detail.job.id,
      ok: false
    };
  }

  await emitPhase(onPhase, {
    jobId: detail.job.id,
    message: "Replacing rendered image",
    phase: "replacing-image"
  });
  const replaced = await replaceImage(context.tabId, {
    renderedUrl: createRenderedPageUrl({
      baseUrl: settings.hanakoBaseUrl,
      jobId: detail.job.id,
      pageId: page.id
    }),
    ...(image.domId ? { domId: image.domId } : {}),
    ...(image.domIndex === undefined ? {} : { domIndex: image.domIndex }),
    sourceUrl: context.srcUrl
  });
  await clearActiveJob({ jobId: detail.job.id, tabId: context.tabId });

  await emitPhase(onPhase, {
    jobId: detail.job.id,
    message: "Translation completed",
    phase: "completed"
  });
  return {
    jobId: detail.job.id,
    ok: true,
    replacementCount: replaced.replaced,
    status: "completed",
    ...(image.warning ? { warning: image.warning } : {})
  };
}

async function emitPhase(
  onPhase: TranslateContextMenuImageDependencies["onPhase"],
  phase: ContextMenuTranslationPhase
): Promise<void> {
  await onPhase?.(phase);
}

export async function resolveContextImageBytes(
  input: CaptureContextImageInput,
  dependencies: ResolveContextImageBytesDependencies = {}
): Promise<ResolvedContextImageCandidate | undefined> {
  const base = compactImageCandidate({
    pageUrl: input.pageUrl,
    url: input.sourceUrl
  });
  const captureImageBytes =
    dependencies.captureImageBytes ?? captureContextImageBytes;
  const captureImageBytesInNewTab =
    dependencies.captureImageBytesInNewTab ?? captureContextImageBytesInNewTab;
  const captureVisibleImageBytes =
    dependencies.captureVisibleImageBytes ?? captureVisibleContextImageBytes;
  const captured = await captureImageBytes(input).catch(() => undefined);
  const sourceFetched = await withImageBytes(
    {
      ...base,
      ...(captured ?? {})
    },
    dependencies.fetchImageBytes
  ).catch(() => ({
    ...base,
    ...(captured ?? {})
  }));

  if (hasSupportedImageBytes(sourceFetched)) {
    return sourceFetched;
  }

  const imageTabCaptured = await captureImageBytesInNewTab(input).catch(
    () => undefined
  );
  const imageTabImage = {
    ...base,
    ...(imageTabCaptured ?? {})
  };

  if (hasSupportedImageBytes(imageTabImage)) {
    return imageTabImage;
  }

  const visibleCaptured = await captureVisibleImageBytes(input).catch(
    () => undefined
  );
  const visibleImage = {
    ...base,
    ...(visibleCaptured ?? {})
  };

  return hasSupportedImageBytes(visibleImage) ? visibleImage : undefined;
}

export async function captureContextImageBytes(
  input: CaptureContextImageInput
): Promise<ContextImageBytesPayload | undefined> {
  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId: input.tabId }
  });

  const response = (await chrome.tabs.sendMessage(input.tabId, {
    sourceUrl: input.sourceUrl,
    type: "HANAKO_CAPTURE_IMAGE_BYTES"
  })) as unknown;

  if (isCaptureImageBytesResponse(response)) {
    return response.image;
  }
  return undefined;
}

export async function captureContextImageBytesInNewTab(
  input: CaptureContextImageInput,
  dependencies: ImageTabCaptureDependencies = {}
): Promise<ContextImageBytesPayload | undefined> {
  if (!isHttpUrl(input.sourceUrl)) {
    return undefined;
  }

  const createTab = dependencies.createTab ?? defaultCreateImageTab;
  const removeTab = dependencies.removeTab ?? defaultRemoveTab;
  const waitForTabComplete =
    dependencies.waitForTabComplete ?? defaultWaitForImageTabComplete;
  const executeContentScript =
    dependencies.executeContentScript ?? defaultExecuteContentScript;
  const sendCaptureMessage =
    dependencies.sendCaptureMessage ?? defaultSendCaptureMessage;
  const waitForCaptureRetry =
    dependencies.waitForCaptureRetry ?? defaultWaitForCaptureRetry;
  const maxCaptureAttempts = dependencies.maxCaptureAttempts ?? 20;
  const tab = await createTab(input.sourceUrl).catch(() => undefined);
  const tabId = tab?.id;
  const tabStatus = tab?.status;

  if (tabId === undefined) {
    return undefined;
  }

  try {
    await waitForTabComplete(tabId, tabStatus);
    await executeContentScript(tabId);

    for (let attempt = 1; attempt <= maxCaptureAttempts; attempt += 1) {
      const response = await sendCaptureMessage(tabId, input.sourceUrl).catch(
        () => undefined
      );

      if (isCaptureImageBytesResponse(response)) {
        return response.image;
      }

      if (attempt < maxCaptureAttempts) {
        await waitForCaptureRetry(attempt);
      }
    }

    return undefined;
  } finally {
    await removeTab(tabId).catch(() => undefined);
  }
}

export async function captureVisibleContextImageBytes(
  input: CaptureContextImageInput,
  dependencies: VisibleContextImageCaptureDependencies = {}
): Promise<ContextImageBytesPayload | undefined> {
  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId: input.tabId }
  });

  const scrolled = (await chrome.tabs.sendMessage(input.tabId, {
    sourceUrl: input.sourceUrl,
    type: "HANAKO_SCROLL_IMAGE_INTO_VIEW"
  })) as unknown;
  const located = isLocatedImageElementResponse(scrolled)
    ? scrolled
    : ((await chrome.tabs.sendMessage(input.tabId, {
        sourceUrl: input.sourceUrl,
        type: "HANAKO_LOCATE_IMAGE_ELEMENT"
      })) as unknown);

  if (!isLocatedImageElementResponse(located)) {
    return undefined;
  }

  const captureVisibleElementBitmap =
    dependencies.captureVisibleElementBitmap ??
    defaultCaptureVisibleElementBitmap;
  const captured = await captureVisibleElementBitmap({
    rect: located.rect,
    sourceUrl: input.sourceUrl,
    ...(input.windowId === undefined ? {} : { windowId: input.windowId })
  });

  return captured
    ? {
        ...captured,
        domId: located.rect.domId,
        domIndex: located.rect.domIndex,
        ...(located.rect.warning ? { warning: located.rect.warning } : {})
      }
    : undefined;
}

async function defaultReplaceImage(
  tabId: number,
  replacement: ReplaceContextImageInput
): Promise<{ ok: boolean; replaced: number }> {
  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId }
  });

  return (await chrome.tabs.sendMessage(tabId, {
    replacements: [replacement],
    type: "HANAKO_REPLACE_IMAGES"
  })) as { ok: boolean; replaced: number };
}

function compactImageCandidate(input: {
  pageUrl?: string;
  url: string;
}): ExtensionImageCandidate {
  return {
    ...(input.pageUrl ? { pageUrl: input.pageUrl } : {}),
    url: input.url
  };
}

function isCaptureImageBytesResponse(response: unknown): response is {
  image: ContextImageBytesPayload;
  ok: true;
} {
  return (
    typeof response === "object" &&
    response !== null &&
    "ok" in response &&
    response.ok === true &&
    "image" in response &&
    typeof response.image === "object" &&
    response.image !== null &&
    "bytesBase64" in response.image &&
    typeof response.image.bytesBase64 === "string" &&
    "mediaType" in response.image &&
    typeof response.image.mediaType === "string"
  );
}

interface ImageTabCaptureDependencies {
  createTab?: (url: string) => Promise<{ id?: number; status?: string }>;
  executeContentScript?: (tabId: number) => Promise<void>;
  maxCaptureAttempts?: number;
  removeTab?: (tabId: number) => Promise<void>;
  sendCaptureMessage?: (tabId: number, sourceUrl: string) => Promise<unknown>;
  waitForCaptureRetry?: (attempt: number) => Promise<void>;
  waitForTabComplete?: (tabId: number, initialStatus?: string) => Promise<void>;
}

interface VisibleContextImageCaptureDependencies {
  captureVisibleElementBitmap?: (input: {
    rect: VisibleElementRect;
    sourceUrl: string;
    windowId?: number;
  }) => Promise<ImageBytesPayload | undefined>;
}

function defaultCreateImageTab(
  url: string
): Promise<{ id?: number; status?: string }> {
  return chrome.tabs.create({ active: false, url }) as Promise<{
    id?: number;
    status?: string;
  }>;
}

function defaultRemoveTab(tabId: number): Promise<void> {
  return chrome.tabs.remove(tabId).then(() => undefined);
}

function defaultExecuteContentScript(tabId: number): Promise<void> {
  return chrome.scripting
    .executeScript({
      files: ["content/content-entry.js"],
      target: { tabId }
    })
    .then(() => undefined);
}

function defaultSendCaptureMessage(
  tabId: number,
  sourceUrl: string
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, {
    sourceUrl,
    type: "HANAKO_CAPTURE_IMAGE_BYTES"
  });
}

function defaultWaitForCaptureRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

function defaultWaitForImageTabComplete(
  tabId: number,
  initialStatus?: string
): Promise<void> {
  if (initialStatus === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = (
      timeout: ReturnType<typeof setTimeout>,
      listener: (updatedTabId: number, changeInfo: { status?: string }) => void
    ) => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string }
    ) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        done(timeout, listener);
      }
    };
    const timeout = setTimeout(() => done(timeout, listener), 15000);

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function isLocatedImageElementResponse(response: unknown): response is {
  ok: true;
  rect: VisibleElementRect & {
    domIndex: number;
    domId: string;
    fullyVisible?: boolean;
    warning?: string;
  };
} {
  return (
    typeof response === "object" &&
    response !== null &&
    "ok" in response &&
    response.ok === true &&
    "rect" in response &&
    typeof response.rect === "object" &&
    response.rect !== null &&
    isNumberProperty(response.rect, "height") &&
    isNumberProperty(response.rect, "left") &&
    isNumberProperty(response.rect, "top") &&
    isNumberProperty(response.rect, "viewportHeight") &&
    isNumberProperty(response.rect, "viewportWidth") &&
    isNumberProperty(response.rect, "width") &&
    isNumberProperty(response.rect, "domIndex") &&
    "domId" in response.rect &&
    typeof response.rect.domId === "string" &&
    (!("warning" in response.rect) || typeof response.rect.warning === "string")
  );
}

function isNumberProperty(
  value: object,
  property: keyof VisibleElementRect | "domIndex"
): boolean {
  return (
    property in value &&
    typeof (value as Record<string, unknown>)[property] === "number"
  );
}

function hasSupportedImageBytes(
  image: ResolvedContextImageCandidate | undefined
): image is ResolvedContextImageCandidate & ImageBytesPayload {
  return Boolean(
    image?.bytesBase64 &&
    image.mediaType &&
    ["image/jpeg", "image/png", "image/webp"].includes(
      image.mediaType.split(";")[0]?.trim().toLowerCase() ?? ""
    )
  );
}

function isHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function withoutCaptureWarning(
  image: ResolvedContextImageCandidate
): ExtensionImageCandidate {
  const uploadImage = { ...image };
  delete uploadImage.warning;
  return uploadImage;
}
