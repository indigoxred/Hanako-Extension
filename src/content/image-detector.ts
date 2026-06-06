export interface DetectedImage {
  src: string;
  width: number;
  height: number;
  domIndex: number;
  domId: string;
}

export interface DetectedImageElement extends DetectedImage {
  element: HTMLImageElement;
}

let nextDomId = 1;

export function detectImages(
  documentRef: Document = document
): DetectedImage[] {
  return detectImageElements(documentRef).map((image) => ({
    domId: image.domId,
    domIndex: image.domIndex,
    height: image.height,
    src: image.src,
    width: image.width
  }));
}

export function detectImageElements(
  documentRef: Document = document
): DetectedImageElement[] {
  return Array.from(documentRef.querySelectorAll("img"))
    .map((image, domIndex) => ({
      domId: ensureHanakoDomId(image),
      element: image,
      src: image.currentSrc || image.src || image.getAttribute("src") || "",
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      domIndex
    }))
    .filter(
      (image) =>
        image.src.length > 0 && image.width >= 120 && image.height >= 120
    );
}

function ensureHanakoDomId(image: HTMLImageElement): string {
  if (!image.dataset.hanakoDomId) {
    image.dataset.hanakoDomId = `hanako-img-${nextDomId}`;
    nextDomId += 1;
  }

  return image.dataset.hanakoDomId;
}
