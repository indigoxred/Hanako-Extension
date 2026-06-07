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

    const sourceCandidates = getImageSourceCandidates(image, replacement);
    const imageAlreadyApplied = isRenderedImageApplied(
      image,
      replacement.renderedUrl
    );
    const currentSrc =
      image.currentSrc || image.src || image.getAttribute("src") || "";
    image.dataset.hanakoOriginalSrc =
      image.dataset.hanakoOriginalSrc || currentSrc;
    image.dataset.hanakoOriginalSrcset =
      image.dataset.hanakoOriginalSrcset || image.getAttribute("srcset") || "";
    image.dataset.hanakoRenderedSrc = replacement.renderedUrl;
    const backgroundChanged = applyVisualBackgroundLayers(image, {
      renderedUrl: replacement.renderedUrl,
      sourceCandidates
    });

    if (!imageAlreadyApplied) {
      image.removeAttribute("srcset");
      disablePictureSources(image);
      image.src = replacement.renderedUrl;
    }

    if (!imageAlreadyApplied || backgroundChanged) {
      replaced += 1;
    }
  }

  return { replaced };
}

export function reapplyStoredReplacements(
  documentRef: Document = document
): ImageReplacementResult {
  return reapplyStoredReplacementTargets(
    Array.from(documentRef.querySelectorAll("img"))
  );
}

function reapplyStoredReplacementTargets(
  images: HTMLImageElement[]
): ImageReplacementResult {
  let replaced = 0;

  for (const image of images) {
    const renderedUrl = image.dataset.hanakoRenderedSrc;

    if (!renderedUrl) {
      continue;
    }

    const imageAlreadyApplied = isRenderedImageApplied(image, renderedUrl);
    const backgroundChanged = applyVisualBackgroundLayers(image, {
      renderedUrl,
      sourceCandidates: getImageSourceCandidates(image)
    });

    if (!imageAlreadyApplied) {
      image.removeAttribute("srcset");
      disablePictureSources(image);
      image.src = renderedUrl;
    }

    if (!imageAlreadyApplied || backgroundChanged) {
      replaced += 1;
    }
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

    restoreVisualBackgroundLayers(image);

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
  const pendingImages = new Set<HTMLImageElement>();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const images = Array.from(pendingImages);
    pendingImages.clear();
    reapplyStoredReplacementTargets(images);
  };

  const scheduleFlush = () => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    const defaultView = documentRef.defaultView;
    if (defaultView?.requestAnimationFrame) {
      defaultView.requestAnimationFrame(flush);
      return;
    }

    setTimeout(flush, 0);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        addReplacementImageTarget(mutation.target, pendingImages);
        continue;
      }

      for (const node of Array.from(mutation.addedNodes)) {
        addReplacementImageTarget(node, pendingImages);
      }
    }

    if (pendingImages.size > 0) {
      scheduleFlush();
    }
  });
  observer.observe(documentRef.body, {
    attributes: true,
    childList: true,
    attributeFilter: ["src", "srcset", "style"],
    subtree: true
  });
  return observer;
}

function addReplacementImageTarget(
  node: Node,
  targets: Set<HTMLImageElement>
): void {
  if (node instanceof HTMLImageElement) {
    targets.add(node);
    return;
  }

  if (!(node instanceof Element)) {
    return;
  }

  for (const image of Array.from(node.querySelectorAll("img"))) {
    targets.add(image);
  }

  const container = findVisualMediaContainer(node);
  if (!container) {
    return;
  }

  for (const image of Array.from(container.querySelectorAll("img"))) {
    if (image.dataset.hanakoRenderedSrc) {
      targets.add(image);
    }
  }
}

function isRenderedImageApplied(
  image: HTMLImageElement,
  renderedUrl: string
): boolean {
  return [image.getAttribute("src"), image.src, image.currentSrc].includes(
    renderedUrl
  );
}

function applyVisualBackgroundLayers(
  image: HTMLImageElement,
  input: { renderedUrl: string; sourceCandidates: string[] }
): boolean {
  let changed = false;
  const layers = findVisualBackgroundLayers(image, input);

  for (const layer of layers) {
    const currentBackground = getBackgroundImage(layer);

    if (!layer.dataset.hanakoOriginalBackgroundImage) {
      layer.dataset.hanakoOriginalBackgroundImage = currentBackground;
    }

    layer.dataset.hanakoRenderedBackgroundImage = input.renderedUrl;

    if (backgroundImageMatches(currentBackground, [input.renderedUrl])) {
      continue;
    }

    layer.style.backgroundImage = toCssUrl(input.renderedUrl);
    changed = true;
  }

  return (
    ensureVisualReplacementLayer(image, input.renderedUrl, layers.length > 0) ||
    changed
  );
}

function restoreVisualBackgroundLayers(image: HTMLImageElement): void {
  const container = findVisualMediaContainer(image);

  if (!container) {
    return;
  }

  for (const layer of getContainerElements(container)) {
    if (!layer.dataset.hanakoOriginalBackgroundImage) {
      continue;
    }

    layer.style.backgroundImage = layer.dataset.hanakoOriginalBackgroundImage;
    delete layer.dataset.hanakoOriginalBackgroundImage;
    delete layer.dataset.hanakoRenderedBackgroundImage;
  }

  removeVisualReplacementLayer(container);
}

function findVisualBackgroundLayers(
  image: HTMLImageElement,
  input: { renderedUrl: string; sourceCandidates: string[] }
): HTMLElement[] {
  const container = findVisualMediaContainer(image);

  if (!container) {
    return [];
  }

  const candidates = [input.renderedUrl, ...input.sourceCandidates].filter(
    Boolean
  );

  return getContainerElements(container).filter((element) => {
    if (element === image) {
      return false;
    }

    if (element.dataset.hanakoOriginalBackgroundImage) {
      return true;
    }

    const backgroundImage = getBackgroundImage(element);
    return backgroundImageMatches(backgroundImage, candidates);
  });
}

function findVisualMediaContainer(element: Element): Element | undefined {
  let current: Element | null = element;
  let depth = 0;

  while (current && current !== current.ownerDocument.body && depth < 6) {
    if (
      current.matches(
        '[aria-label="Image"], [data-testid="tweetPhoto"], [role="img"], picture, figure'
      )
    ) {
      return current;
    }

    current = current.parentElement;
    depth += 1;
  }

  return element.parentElement ?? undefined;
}

function getContainerElements(container: Element): HTMLElement[] {
  return [container, ...Array.from(container.querySelectorAll("*"))].filter(
    (element): element is HTMLElement => element instanceof HTMLElement
  );
}

function ensureVisualReplacementLayer(
  image: HTMLImageElement,
  renderedUrl: string,
  hasBackgroundLayer: boolean
): boolean {
  const container = findVisualMediaContainer(image);

  if (!container || !hasBackgroundLayer) {
    return false;
  }

  const documentRef = image.ownerDocument;
  let changed = false;
  let overlay = container.querySelector<HTMLImageElement>(
    "img[data-hanako-visual-replacement]"
  );

  if (!overlay) {
    overlay = documentRef.createElement("img");
    overlay.dataset.hanakoVisualReplacement = "true";
    overlay.alt = "";
    overlay.setAttribute("aria-hidden", "true");
    overlay.draggable = false;
    container.append(overlay);
    changed = true;
  }

  if (overlay.getAttribute("src") !== renderedUrl) {
    overlay.src = renderedUrl;
    changed = true;
  }

  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.objectFit = "contain";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "2147483646";
  overlay.style.opacity = "1";
  overlay.style.visibility = "visible";

  if (container instanceof HTMLElement) {
    const currentPosition =
      container.style.position ||
      container.ownerDocument.defaultView?.getComputedStyle(container)
        .position ||
      "";

    if (currentPosition === "" || currentPosition === "static") {
      container.dataset.hanakoOriginalPosition = container.style.position;
      container.style.position = "relative";
      changed = true;
    }
  }

  return changed;
}

function removeVisualReplacementLayer(container: Element): void {
  container
    .querySelectorAll("img[data-hanako-visual-replacement]")
    .forEach((overlay) => overlay.remove());

  if (
    container instanceof HTMLElement &&
    "hanakoOriginalPosition" in container.dataset
  ) {
    container.style.position = container.dataset.hanakoOriginalPosition ?? "";
    delete container.dataset.hanakoOriginalPosition;
  }
}

function getBackgroundImage(element: HTMLElement): string {
  const inlineBackground = element.style.backgroundImage;

  if (inlineBackground && inlineBackground !== "none") {
    return inlineBackground;
  }

  return (
    element.ownerDocument.defaultView?.getComputedStyle(element)
      .backgroundImage ?? ""
  );
}

function backgroundImageMatches(
  backgroundImage: string,
  candidates: string[]
): boolean {
  return (
    backgroundImage !== "" &&
    backgroundImage !== "none" &&
    candidates.some((candidate) => backgroundImage.includes(candidate))
  );
}

function toCssUrl(url: string): string {
  return `url("${url.replace(/["\\]/g, "\\$&")}")`;
}

function getImageSourceCandidates(
  image: HTMLImageElement,
  replacement?: ImageReplacement
): string[] {
  return [
    replacement?.sourceUrl,
    image.dataset.hanakoOriginalSrc,
    image.dataset.hanakoRenderedSrc,
    image.currentSrc,
    image.src,
    image.getAttribute("src")
  ].filter((candidate): candidate is string => Boolean(candidate));
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
