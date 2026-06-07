export interface CapturedImageBytes {
  bytesBase64: string;
  domIndex?: number;
  domId?: string;
  mediaType: string;
  name?: string;
  warning?: string;
}

export interface LocatedImageElementRect {
  domIndex: number;
  domId: string;
  fullyVisible?: boolean;
  height: number;
  left: number;
  scrollChanged?: boolean;
  top: number;
  viewportHeight: number;
  viewportWidth: number;
  warning?: string;
  width: number;
}

export const PARTIAL_SCREENSHOT_WARNING =
  "Warning: screenshot fallback could only include the visible portion of the image.";

export async function captureImageBytesBySource(
  sourceUrl: string,
  documentRef: Document = document
): Promise<CapturedImageBytes | undefined> {
  const found = findImageBySource(sourceUrl, documentRef);
  const image = found?.image;

  if (!image) {
    return undefined;
  }

  const captured = await captureImageBitmapFromElement(image, documentRef);

  return captured
    ? {
        ...captured,
        domId: ensureContextDomId(image, found.domIndex),
        domIndex: found.domIndex
      }
    : undefined;
}

export function locateImageElementBySource(
  sourceUrl: string,
  documentRef: Document = document
): LocatedImageElementRect | undefined {
  const found = findImageBySource(sourceUrl, documentRef);
  const image = found?.image;

  if (!image) {
    return undefined;
  }

  const rect = image.getBoundingClientRect();
  const view = documentRef.defaultView ?? window;

  return {
    domId: ensureContextDomId(image, found.domIndex),
    domIndex: found.domIndex,
    fullyVisible: isFullyVisible({
      height: rect.height,
      left: rect.left,
      top: rect.top,
      viewportHeight: view.innerHeight,
      viewportWidth: view.innerWidth,
      width: rect.width
    }),
    height: rect.height,
    left: rect.left,
    top: rect.top,
    viewportHeight: view.innerHeight,
    viewportWidth: view.innerWidth,
    width: rect.width
  };
}

export async function scrollImageElementIntoViewBySource(
  sourceUrl: string,
  documentRef: Document = document
): Promise<LocatedImageElementRect | undefined> {
  const found = findImageBySource(sourceUrl, documentRef);
  const image = found?.image;

  if (!image) {
    return undefined;
  }

  const beforeRect = image.getBoundingClientRect();
  const beforeScroll = getViewportScroll(documentRef);
  image.scrollIntoView?.({
    behavior: "auto",
    block: "center",
    inline: "center"
  });
  await waitForScrollToSettle(documentRef);

  const located = locateImageElementBySource(sourceUrl, documentRef);

  if (!located) {
    return undefined;
  }

  const fullyVisible = isFullyVisible(located);

  return {
    ...located,
    fullyVisible,
    scrollChanged:
      hasRectMoved(beforeRect, located) ||
      hasViewportScrollChanged(beforeScroll, documentRef),
    ...(fullyVisible ? {} : { warning: PARTIAL_SCREENSHOT_WARNING })
  };
}

async function waitForScrollToSettle(documentRef: Document): Promise<void> {
  const view = documentRef.defaultView ?? window;
  const requestFrame = view.requestAnimationFrame?.bind(view);

  if (!requestFrame) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return;
  }

  await new Promise<void>((resolve) => requestFrame(() => resolve()));
  await new Promise<void>((resolve) => requestFrame(() => resolve()));
}

function getViewportScroll(documentRef: Document): {
  scrollX: number;
  scrollY: number;
} {
  const view = documentRef.defaultView ?? window;

  return {
    scrollX: view.scrollX,
    scrollY: view.scrollY
  };
}

function hasViewportScrollChanged(
  before: { scrollX: number; scrollY: number },
  documentRef: Document
): boolean {
  const after = getViewportScroll(documentRef);

  return after.scrollX !== before.scrollX || after.scrollY !== before.scrollY;
}

function hasRectMoved(
  before: Pick<DOMRect, "left" | "top">,
  after: Pick<LocatedImageElementRect, "left" | "top">
): boolean {
  return (
    Math.round(before.left) !== Math.round(after.left) ||
    Math.round(before.top) !== Math.round(after.top)
  );
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

function findImageBySource(
  sourceUrl: string,
  documentRef: Document
): { domIndex: number; image: HTMLImageElement } | undefined {
  const images = Array.from(documentRef.querySelectorAll("img"));
  const domIndex = images.findIndex((candidate) =>
    imageMatchesSource(candidate, sourceUrl, documentRef)
  );
  const image = domIndex >= 0 ? images[domIndex] : undefined;
  return image ? { domIndex, image } : undefined;
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

function calculateBoundedImageSize(input: {
  width: number;
  height: number;
  maxDimension?: number;
}): { width: number; height: number } {
  const maxDimension = input.maxDimension ?? 1800;
  const largest = Math.max(input.width, input.height);

  if (largest <= maxDimension) {
    return { height: input.height, width: input.width };
  }

  const scale = maxDimension / largest;
  return {
    height: Math.round(input.height * scale),
    width: Math.round(input.width * scale)
  };
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

function isFullyVisible(
  rect: Pick<
    LocatedImageElementRect,
    "height" | "left" | "top" | "viewportHeight" | "viewportWidth" | "width"
  >
): boolean {
  return (
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.left + rect.width <= rect.viewportWidth &&
    rect.top + rect.height <= rect.viewportHeight
  );
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
