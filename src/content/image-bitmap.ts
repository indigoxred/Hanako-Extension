import { calculateBoundedImageSize } from "../background/image-resize.js";

export interface CapturedImageBytes {
  bytesBase64: string;
  domIndex?: number;
  domId?: string;
  mediaType: string;
  name?: string;
}

export interface LocatedImageElementRect {
  domIndex: number;
  domId: string;
  height: number;
  left: number;
  top: number;
  viewportHeight: number;
  viewportWidth: number;
  width: number;
}

export async function captureImageBytesBySource(
  sourceUrl: string,
  documentRef: Document = document
): Promise<CapturedImageBytes | undefined> {
  const images = Array.from(documentRef.querySelectorAll("img"));
  const domIndex = images.findIndex((candidate) =>
    imageMatchesSource(candidate, sourceUrl, documentRef)
  );
  const image = domIndex >= 0 ? images[domIndex] : undefined;

  if (!image) {
    return undefined;
  }

  const captured = await captureImageBitmapFromElement(image, documentRef);

  return captured
    ? {
        ...captured,
        domId: ensureContextDomId(image, domIndex),
        domIndex
      }
    : undefined;
}

export function locateImageElementBySource(
  sourceUrl: string,
  documentRef: Document = document
): LocatedImageElementRect | undefined {
  const images = Array.from(documentRef.querySelectorAll("img"));
  const domIndex = images.findIndex((candidate) =>
    imageMatchesSource(candidate, sourceUrl, documentRef)
  );
  const image = domIndex >= 0 ? images[domIndex] : undefined;

  if (!image) {
    return undefined;
  }

  const rect = image.getBoundingClientRect();
  const view = documentRef.defaultView ?? window;

  return {
    domId: ensureContextDomId(image, domIndex),
    domIndex,
    height: rect.height,
    left: rect.left,
    top: rect.top,
    viewportHeight: view.innerHeight,
    viewportWidth: view.innerWidth,
    width: rect.width
  };
}

export async function captureImageBitmapFromElement(
  image: HTMLImageElement,
  documentRef: Document = document
): Promise<CapturedImageBytes | undefined> {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return undefined;
  }

  try {
    const { height, width } = calculateBoundedImageSize({
      height: sourceHeight,
      width: sourceWidth
    });
    const canvas = documentRef.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      return undefined;
    }

    context.drawImage(
      image,
      0,
      0,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height
    );
    const blob = await canvasToBlob(canvas, "image/png");

    if (!blob) {
      return undefined;
    }

    const name = nameFromImage(image, documentRef);

    return {
      bytesBase64: arrayBufferToBase64(await blob.arrayBuffer()),
      mediaType: blob.type || "image/png",
      ...(name ? { name } : {})
    };
  } catch {
    return undefined;
  }
}

function imageMatchesSource(
  image: HTMLImageElement,
  sourceUrl: string,
  documentRef: Document
): boolean {
  const sources = [
    image.currentSrc,
    image.src,
    image.getAttribute("src") ?? undefined
  ].filter(
    (source): source is string => source !== undefined && source.length > 0
  );

  return sources.some(
    (source) =>
      source === sourceUrl ||
      toAbsoluteUrl(source, documentRef) ===
        toAbsoluteUrl(sourceUrl, documentRef)
  );
}

function ensureContextDomId(image: HTMLImageElement, domIndex: number): string {
  if (!image.dataset.hanakoDomId) {
    image.dataset.hanakoDomId = `hanako-context-img-${domIndex}`;
  }

  return image.dataset.hanakoDomId;
}

function toAbsoluteUrl(
  rawUrl: string,
  documentRef: Document
): string | undefined {
  try {
    return new URL(rawUrl, documentRef.location.href).href;
  } catch {
    return undefined;
  }
}

function nameFromImage(
  image: HTMLImageElement,
  documentRef: Document
): string | undefined {
  const rawUrl = image.currentSrc || image.src || image.getAttribute("src");

  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl, documentRef.location.href);
    const rawName = url.pathname.split("/").filter(Boolean).at(-1);
    return rawName
      ? decodeURIComponent(rawName).replace(/[^A-Za-z0-9._-]+/g, "_")
      : undefined;
  } catch {
    return undefined;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mediaType: string
): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), mediaType);
  });
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
