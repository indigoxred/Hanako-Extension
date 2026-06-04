export interface DetectedImage {
  src: string;
  width: number;
  height: number;
  domIndex: number;
  domId: string;
}

let nextDomId = 1;

export function detectImages(
  documentRef: Document = document
): DetectedImage[] {
  return Array.from(documentRef.querySelectorAll("img"))
    .map((image, domIndex) => ({
      domId: ensureHanakoDomId(image),
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
