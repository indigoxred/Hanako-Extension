export interface DetectedImage {
  src: string;
  width: number;
  height: number;
  domIndex: number;
}

export function detectImages(
  documentRef: Document = document
): DetectedImage[] {
  return Array.from(documentRef.querySelectorAll("img"))
    .map((image, domIndex) => ({
      src: image.getAttribute("src") || image.currentSrc || image.src,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      domIndex
    }))
    .filter(
      (image) =>
        image.src.length > 0 && image.width >= 120 && image.height >= 120
    );
}
