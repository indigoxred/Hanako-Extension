import { calculateBoundedImageSize } from "./image-resize.js";

import type { ImageBytesPayload } from "./image-bytes.js";

export interface VisibleElementRect {
  height: number;
  left: number;
  top: number;
  viewportHeight: number;
  viewportWidth: number;
  width: number;
}

export interface VisibleCrop {
  outputHeight: number;
  outputWidth: number;
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
}

interface BitmapLike {
  close?: () => void;
  height: number;
  width: number;
}

interface CanvasLike {
  convertToBlob: (options: { type: string }) => Promise<Blob>;
  getContext: (
    contextId: "2d"
  ) => { drawImage: (...args: unknown[]) => void } | null;
}

export interface VisibleElementCaptureInput {
  dataUrl?: string;
  rect: VisibleElementRect;
  sourceUrl: string;
  windowId?: number;
}

interface VisibleElementCaptureDependencies {
  captureVisibleTab?: (windowId?: number) => Promise<string | undefined>;
  createCanvas?: (width: number, height: number) => CanvasLike;
  createImageBitmapFromBlob?: (blob: Blob) => Promise<BitmapLike>;
  fetchDataUrl?: typeof fetch;
}

export async function captureVisibleElementBitmap(
  input: VisibleElementCaptureInput,
  dependencies: VisibleElementCaptureDependencies = {}
): Promise<ImageBytesPayload | undefined> {
  const captureVisibleTab =
    dependencies.captureVisibleTab ?? captureVisibleTabSnapshot;
  const fetchDataUrl = dependencies.fetchDataUrl ?? fetch;
  const createImageBitmapFromBlob =
    dependencies.createImageBitmapFromBlob ?? createImageBitmap;
  const createCanvas = dependencies.createCanvas ?? defaultCreateCanvas;
  const dataUrl = input.dataUrl ?? (await captureVisibleTab(input.windowId));

  if (!dataUrl) {
    return undefined;
  }

  try {
    const response = await fetchDataUrl(dataUrl);

    if (!response.ok) {
      return undefined;
    }

    const bitmap = await createImageBitmapFromBlob(await response.blob());
    const crop = calculateVisibleCrop({
      bitmapHeight: bitmap.height,
      bitmapWidth: bitmap.width,
      rect: input.rect
    });

    if (!crop) {
      bitmap.close?.();
      return undefined;
    }

    const canvas = createCanvas(crop.outputWidth, crop.outputHeight);
    const context = canvas.getContext("2d");

    if (!context) {
      bitmap.close?.();
      return undefined;
    }

    context.drawImage(
      bitmap,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      0,
      0,
      crop.outputWidth,
      crop.outputHeight
    );
    const blob = await canvas.convertToBlob({ type: "image/png" });
    bitmap.close?.();

    return {
      bytesBase64: arrayBufferToBase64(await blob.arrayBuffer()),
      mediaType: blob.type || "image/png",
      ...(nameFromUrl(input.sourceUrl)
        ? { name: nameFromUrl(input.sourceUrl) }
        : {})
    };
  } catch {
    return undefined;
  }
}

export function calculateVisibleCrop(input: {
  bitmapHeight: number;
  bitmapWidth: number;
  rect: VisibleElementRect;
}): VisibleCrop | undefined {
  const left = clamp(input.rect.left, 0, input.rect.viewportWidth);
  const top = clamp(input.rect.top, 0, input.rect.viewportHeight);
  const right = clamp(
    input.rect.left + input.rect.width,
    0,
    input.rect.viewportWidth
  );
  const bottom = clamp(
    input.rect.top + input.rect.height,
    0,
    input.rect.viewportHeight
  );
  const visibleWidth = right - left;
  const visibleHeight = bottom - top;

  if (visibleWidth <= 0 || visibleHeight <= 0) {
    return undefined;
  }

  const scaleX = input.bitmapWidth / input.rect.viewportWidth;
  const scaleY = input.bitmapHeight / input.rect.viewportHeight;
  const sourceX = Math.round(left * scaleX);
  const sourceY = Math.round(top * scaleY);
  const sourceWidth = Math.round(visibleWidth * scaleX);
  const sourceHeight = Math.round(visibleHeight * scaleY);

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return undefined;
  }

  const output = calculateBoundedImageSize({
    height: sourceHeight,
    width: sourceWidth
  });

  return {
    outputHeight: output.height,
    outputWidth: output.width,
    sourceHeight,
    sourceWidth,
    sourceX,
    sourceY
  };
}

export function captureVisibleTabSnapshot(
  windowId?: number
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const callback = (dataUrl?: string) => {
      if (chrome.runtime.lastError || !dataUrl) {
        resolve(undefined);
        return;
      }

      resolve(dataUrl);
    };

    if (windowId === undefined) {
      chrome.tabs.captureVisibleTab({ format: "png" }, callback);
      return;
    }

    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, callback);
  });
}

function defaultCreateCanvas(width: number, height: number): CanvasLike {
  return new OffscreenCanvas(width, height) as CanvasLike;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nameFromUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    const rawName = url.pathname.split("/").filter(Boolean).at(-1);
    return rawName
      ? decodeURIComponent(rawName).replace(/[^A-Za-z0-9._-]+/g, "_")
      : undefined;
  } catch {
    return undefined;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
