import {
  translateImage as defaultTranslateImage,
  type ExtensionImageCandidate,
  type ExtensionJobDetail,
  type TranslateImageInput
} from "./hanako-client.js";
import {
  withRequiredImageBytes,
  type FetchImageBytes,
  type ImageBytesPayload
} from "./image-bytes.js";
import {
  captureVisibleElementBitmap,
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
    }
  | { ok: false; error: string; jobId?: string; status?: "failed" };

export interface ReplaceContextImageInput {
  renderedUrl: string;
  sourceUrl: string;
}

export interface CaptureContextImageInput {
  pageUrl?: string;
  sourceUrl: string;
  tabId: number;
  windowId?: number;
}

export interface TranslateContextMenuImageDependencies {
  captureImageBytes?: (
    input: CaptureContextImageInput
  ) => Promise<ImageBytesPayload | undefined>;
  context: ContextMenuImageContext;
  fetchImageBytes?: FetchImageBytes;
  loadSettings?: () => Promise<ExtensionSettings>;
  openTab?: (url: string) => Promise<void>;
  replaceImage?: (
    tabId: number,
    replacement: ReplaceContextImageInput
  ) => Promise<{ ok: boolean; replaced: number }>;
  translateImage?: (input: TranslateImageInput) => Promise<ExtensionJobDetail>;
  waitForJobCompletion?: (
    input: WaitForJobCompletionInput
  ) => Promise<WaitForJobCompletionResult>;
}

export async function translateContextMenuImage({
  captureImageBytes = captureContextImageBytes,
  context,
  fetchImageBytes,
  loadSettings = loadExtensionSettings,
  replaceImage = defaultReplaceImage,
  translateImage = defaultTranslateImage,
  waitForJobCompletion = defaultWaitForJobCompletion
}: TranslateContextMenuImageDependencies): Promise<ContextMenuTranslationResult> {
  if (!context.srcUrl) {
    return { error: "No clicked image URL was available", ok: false };
  }

  if (!context.tabId) {
    return { error: "No source tab was available", ok: false };
  }

  const settings = await loadSettings();
  let image: ExtensionImageCandidate;
  const captured = await captureImageBytes({
    ...(context.pageUrl ? { pageUrl: context.pageUrl } : {}),
    sourceUrl: context.srcUrl,
    tabId: context.tabId,
    ...(context.windowId === undefined ? {} : { windowId: context.windowId })
  }).catch(() => undefined);

  try {
    image = await withRequiredImageBytes(
      {
        ...compactImageCandidate({
          pageUrl: context.pageUrl,
          url: context.srcUrl
        }),
        ...(captured ?? {})
      },
      fetchImageBytes
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The extension could not extract bytes for this image",
      ok: false
    };
  }

  const detail = await translateImage({
    baseUrl: settings.hanakoBaseUrl,
    image,
    targetLanguage: settings.targetLanguage
  });
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
      jobId: detail.job.id,
      ok: true,
      replacementCount: 0,
      status: "timeout"
    };
  }

  const page = completed.detail.pages?.[0];

  if (!page?.renderedAssetId) {
    return {
      error: "Hanako job completed without a rendered page",
      jobId: detail.job.id,
      ok: false
    };
  }

  const replaced = await replaceImage(context.tabId, {
    renderedUrl: createRenderedPageUrl({
      baseUrl: settings.hanakoBaseUrl,
      jobId: detail.job.id,
      pageId: page.id
    }),
    sourceUrl: context.srcUrl
  });

  return {
    jobId: detail.job.id,
    ok: true,
    replacementCount: replaced.replaced,
    status: "completed"
  };
}

export async function captureContextImageBytes(
  input: CaptureContextImageInput
): Promise<ImageBytesPayload | undefined> {
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

  const located = (await chrome.tabs.sendMessage(input.tabId, {
    sourceUrl: input.sourceUrl,
    type: "HANAKO_LOCATE_IMAGE_ELEMENT"
  })) as unknown;

  return isLocatedImageElementResponse(located)
    ? captureVisibleElementBitmap({
        rect: located.rect,
        sourceUrl: input.sourceUrl,
        ...(input.windowId === undefined ? {} : { windowId: input.windowId })
      })
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
  image: ImageBytesPayload;
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

function isLocatedImageElementResponse(response: unknown): response is {
  ok: true;
  rect: VisibleElementRect;
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
    isNumberProperty(response.rect, "width")
  );
}

function isNumberProperty(
  value: object,
  property: keyof VisibleElementRect
): boolean {
  return (
    property in value &&
    typeof (value as Record<keyof VisibleElementRect, unknown>)[property] ===
      "number"
  );
}
