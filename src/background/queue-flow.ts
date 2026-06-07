import {
  translatePage as defaultTranslatePage,
  type ExtensionJobDetail,
  type TranslatePageInput
} from "./hanako-client.js";
import {
  captureContextImageBytes,
  type CaptureContextImageInput,
  type ContextMenuImageContext
} from "./context-menu-flow.js";
import { createTranslationCacheKey } from "./translation-cache.js";
import {
  addQueuedImage,
  clearQueuedImages,
  listQueuedImages,
  type QueueStorageArea
} from "./queue-state.js";
import { loadExtensionSettings } from "../options/extension-settings.js";

import type { ImageBytesPayload } from "./image-bytes.js";
import type { ExtensionSettings } from "../options/extension-settings.js";

export type QueueImageResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export type SendQueueResult =
  | {
      ok: true;
      imageCount: number;
      jobId: string;
      jobUrl: string;
      status: "submitted";
    }
  | { ok: false; error: string };

export interface QueueContextMenuImageInput {
  captureImageBytes?: (
    input: CaptureContextImageInput
  ) => Promise<ImageBytesPayload | undefined>;
  context: ContextMenuImageContext;
  loadSettings?: () => Promise<ExtensionSettings>;
  storage?: QueueStorageArea;
}

export interface SendQueuedImagesInput {
  loadSettings?: () => Promise<ExtensionSettings>;
  storage?: QueueStorageArea;
  translatePage?: (input: TranslatePageInput) => Promise<ExtensionJobDetail>;
}

export async function queueContextMenuImage({
  captureImageBytes = captureContextImageBytes,
  context,
  loadSettings = loadExtensionSettings,
  storage
}: QueueContextMenuImageInput): Promise<QueueImageResult> {
  if (!context.srcUrl) {
    return { error: "No clicked image URL was available", ok: false };
  }

  if (!context.tabId) {
    return { error: "No source tab was available", ok: false };
  }

  const captured = await captureImageBytes({
    ...(context.pageUrl ? { pageUrl: context.pageUrl } : {}),
    sourceUrl: context.srcUrl,
    tabId: context.tabId,
    ...(context.windowId === undefined ? {} : { windowId: context.windowId })
  }).catch(() => undefined);

  if (!captured?.bytesBase64 || !captured.mediaType) {
    return {
      error: "The extension could not extract bytes for this image",
      ok: false
    };
  }

  const settings = await loadSettings();
  const cacheKey = await createTranslationCacheKey({
    baseUrl: settings.hanakoBaseUrl,
    bytesBase64: captured.bytesBase64,
    targetLanguage: settings.targetLanguage
  });
  const queued = await addQueuedImage(storage, {
    ...captured,
    cacheKey,
    ...(context.pageUrl ? { pageUrl: context.pageUrl } : {}),
    sourceUrl: context.srcUrl
  });

  return { count: queued.count, ok: true };
}

export async function sendQueuedImages({
  loadSettings = loadExtensionSettings,
  storage,
  translatePage = defaultTranslatePage
}: SendQueuedImagesInput = {}): Promise<SendQueueResult> {
  const queued = await listQueuedImages(storage);

  if (queued.length === 0) {
    return { error: "Hanako project is empty", ok: false };
  }

  const settings = await loadSettings();
  const detail = await translatePage({
    baseUrl: settings.hanakoBaseUrl,
    images: queued.map((item) => ({
      bytesBase64: item.bytesBase64,
      ...(item.height === undefined ? {} : { height: item.height }),
      mediaType: item.mediaType,
      ...(item.pageUrl ? { pageUrl: item.pageUrl } : {}),
      url: item.sourceUrl ?? item.id,
      ...(item.width === undefined ? {} : { width: item.width })
    })),
    mode: "auto",
    targetLanguage: settings.targetLanguage
  });

  await clearQueuedImages(storage);

  return {
    imageCount: queued.length,
    jobId: detail.job.id,
    jobUrl: createOpenJobUrl({
      baseUrl: settings.hanakoBaseUrl,
      jobId: detail.job.id
    }),
    ok: true,
    status: "submitted"
  };
}

function createOpenJobUrl(input: { baseUrl: string; jobId: string }): string {
  return `${input.baseUrl.replace(/\/+$/, "")}/jobs/${encodeURIComponent(
    input.jobId
  )}`;
}
