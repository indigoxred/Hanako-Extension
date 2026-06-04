import { detectImages } from "./image-detector.js";
import {
  observeReplacementMutations,
  replaceDetectedImages
} from "./dom-replacer.js";
import { showOverlay } from "./overlay.js";

let replacementObserver: MutationObserver | undefined;

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (isReplaceImagesMessage(message)) {
      const result = replaceDetectedImages(message.replacements);
      replacementObserver ??= observeReplacementMutations();
      showOverlay(`Replaced ${result.replaced} translated images`);
      sendResponse({ ok: true, ...result });
      return true;
    }

    if (!isDetectImagesMessage(message)) {
      return false;
    }

    const pageUrl = window.location.href;
    const images = detectImages().map((image) => ({
      domId: image.domId,
      domIndex: image.domIndex,
      height: image.height,
      pageUrl,
      url: image.src,
      width: image.width
    }));
    showOverlay(`Found ${images.length} image candidates`);
    sendResponse({ images, ok: true, pageUrl });
    return true;
  }
);

function isDetectImagesMessage(message: unknown): message is { type: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_DETECT_IMAGES"
  );
}

function isReplaceImagesMessage(message: unknown): message is {
  replacements: Array<{
    domIndex?: number;
    domId?: string;
    renderedUrl: string;
    sourceUrl?: string;
  }>;
  type: "HANAKO_REPLACE_IMAGES";
} {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_REPLACE_IMAGES" &&
    "replacements" in message &&
    Array.isArray(message.replacements)
  );
}
