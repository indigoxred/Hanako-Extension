export interface ImageReplacement {
  domIndex?: number;
  domId?: string;
  renderedUrl: string;
  sourceUrl?: string;
}

export interface ImageReplacementResult {
  replaced: number;
}

export interface ImageRestoreResult {
  restored: number;
}

export function replaceDetectedImages(
  replacements: ImageReplacement[],
  documentRef: Document = document
): ImageReplacementResult {
  const images = Array.from(documentRef.querySelectorAll("img"));
  let replaced = 0;

  for (const replacement of replacements) {
    const image = findReplacementTarget(images, replacement);

    if (!image) {
      continue;
    }

    const currentSrc =
      image.currentSrc || image.src || image.getAttribute("src") || "";
    image.dataset.hanakoOriginalSrc =
      image.dataset.hanakoOriginalSrc || currentSrc;
    image.dataset.hanakoOriginalSrcset =
      image.dataset.hanakoOriginalSrcset || image.getAttribute("srcset") || "";
    image.dataset.hanakoRenderedSrc = replacement.renderedUrl;
    image.removeAttribute("srcset");
    disablePictureSources(image);
    image.src = replacement.renderedUrl;
    replaced += 1;
  }

  return { replaced };
}

export function reapplyStoredReplacements(
  documentRef: Document = document
): ImageReplacementResult {
  let replaced = 0;

  for (const image of Array.from(documentRef.querySelectorAll("img"))) {
    const renderedUrl = image.dataset.hanakoRenderedSrc;

    if (!renderedUrl) {
      continue;
    }

    const currentSrc =
      image.currentSrc || image.src || image.getAttribute("src") || "";

    if (currentSrc === renderedUrl) {
      continue;
    }

    image.removeAttribute("srcset");
    disablePictureSources(image);
    image.src = renderedUrl;
    replaced += 1;
  }

  return { replaced };
}

export function clearDetectedImageReplacements(
  documentRef: Document = document
): ImageRestoreResult {
  let restored = 0;

  for (const image of Array.from(documentRef.querySelectorAll("img"))) {
    if (!image.dataset.hanakoRenderedSrc) {
      continue;
    }

    if (image.dataset.hanakoOriginalSrc) {
      image.src = image.dataset.hanakoOriginalSrc;
    }

    if (image.dataset.hanakoOriginalSrcset) {
      image.setAttribute("srcset", image.dataset.hanakoOriginalSrcset);
    } else {
      image.removeAttribute("srcset");
    }

    restorePictureSources(image);
    delete image.dataset.hanakoOriginalSrc;
    delete image.dataset.hanakoOriginalSrcset;
    delete image.dataset.hanakoRenderedSrc;
    restored += 1;
  }

  return { restored };
}

export function observeReplacementMutations(
  documentRef: Document = document
): MutationObserver {
  const observer = new MutationObserver(() => {
    reapplyStoredReplacements(documentRef);
  });
  observer.observe(documentRef.body, {
    attributeFilter: ["src", "srcset"],
    attributes: true,
    childList: true,
    subtree: true
  });
  return observer;
}

function findReplacementTarget(
  images: HTMLImageElement[],
  replacement: ImageReplacement
): HTMLImageElement | undefined {
  if (replacement.domId) {
    const byDomId = images.find(
      (image) => image.dataset.hanakoDomId === replacement.domId
    );

    if (byDomId) {
      return byDomId;
    }
  }

  if (replacement.sourceUrl) {
    const bySource = images.find((image) => {
      const sources = [
        image.currentSrc,
        image.src,
        image.getAttribute("src"),
        image.dataset.hanakoOriginalSrc
      ];
      return sources.includes(replacement.sourceUrl);
    });

    if (bySource) {
      return bySource;
    }
  }

  if (replacement.domIndex === undefined) {
    return undefined;
  }

  return images[replacement.domIndex];
}

function disablePictureSources(image: HTMLImageElement): void {
  const picture = image.closest("picture");

  if (!picture) {
    return;
  }

  for (const source of Array.from(picture.querySelectorAll("source"))) {
    source.dataset.hanakoOriginalSrcset =
      source.dataset.hanakoOriginalSrcset ||
      source.getAttribute("srcset") ||
      "";
    source.removeAttribute("srcset");
  }
}

function restorePictureSources(image: HTMLImageElement): void {
  const picture = image.closest("picture");

  if (!picture) {
    return;
  }

  for (const source of Array.from(picture.querySelectorAll("source"))) {
    if (source.dataset.hanakoOriginalSrcset) {
      source.setAttribute("srcset", source.dataset.hanakoOriginalSrcset);
    }

    delete source.dataset.hanakoOriginalSrcset;
  }
}
