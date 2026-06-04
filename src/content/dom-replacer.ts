export interface ImageReplacement {
  domIndex: number;
  renderedUrl: string;
}

export interface ImageReplacementResult {
  replaced: number;
}

export function replaceDetectedImages(
  replacements: ImageReplacement[],
  documentRef: Document = document
): ImageReplacementResult {
  const images = Array.from(documentRef.querySelectorAll("img"));
  let replaced = 0;

  for (const replacement of replacements) {
    const image = images[replacement.domIndex];

    if (!image) {
      continue;
    }

    const currentSrc = image.getAttribute("src") || image.currentSrc || image.src;
    image.dataset.hanakoOriginalSrc =
      image.dataset.hanakoOriginalSrc || currentSrc;
    image.dataset.hanakoRenderedSrc = replacement.renderedUrl;
    image.src = replacement.renderedUrl;
    replaced += 1;
  }

  return { replaced };
}
