import {
  captureImageBitmapFromElement,
  captureImageBytesBySource,
  locateImageElementBySource
} from "./image-bitmap.js";
import { detectImageElements } from "./image-detector.js";
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

    if (isCaptureImageBytesMessage(message)) {
      void captureImageBytesBySource(message.sourceUrl)
        .then((image) => {
          sendResponse(
            image
              ? { image, ok: true }
              : {
                  error:
                    "The clicked image could not be captured from the page",
                  ok: false
                }
          );
        })
        .catch((error: unknown) => {
          sendResponse({
            error:
              error instanceof Error
                ? error.message
                : "The clicked image could not be captured from the page",
            ok: false
          });
        });
      return true;
    }

    if (isLocateImageElementMessage(message)) {
      const rect = locateImageElementBySource(message.sourceUrl);
      sendResponse(
        rect
          ? { ok: true, rect }
          : {
              error: "The clicked image could not be located on the page",
              ok: false
            }
      );
      return true;
    }

    if (isDetectImagesMessage(message)) {
      void detectImagePayloads()
        .then((images) => {
          const pageUrl = window.location.href;
          showOverlay(`Found ${images.length} image candidates`);
          sendResponse({ images, ok: true, pageUrl });
        })
        .catch((error: unknown) => {
          sendResponse({
            error:
              error instanceof Error ? error.message : "Image detection failed",
            ok: false
          });
        });
      return true;
    }

    return false;
  }
);

async function detectImagePayloads() {
  const pageUrl = window.location.href;

  return Promise.all(
    detectImageElements().map(async (image) => {
      const captured = await captureImageBitmapFromElement(image.element);

      return {
        ...(captured ?? {}),
        domId: image.domId,
        domIndex: image.domIndex,
        height: image.height,
        pageUrl,
        url: image.src,
        width: image.width
      };
    })
  );
}

function isDetectImagesMessage(message: unknown): message is { type: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_DETECT_IMAGES"
  );
}

function isCaptureImageBytesMessage(message: unknown): message is {
  sourceUrl: string;
  type: "HANAKO_CAPTURE_IMAGE_BYTES";
} {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_CAPTURE_IMAGE_BYTES" &&
    "sourceUrl" in message &&
    typeof message.sourceUrl === "string"
  );
}

function isLocateImageElementMessage(message: unknown): message is {
  sourceUrl: string;
  type: "HANAKO_LOCATE_IMAGE_ELEMENT";
} {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_LOCATE_IMAGE_ELEMENT" &&
    "sourceUrl" in message &&
    typeof message.sourceUrl === "string"
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
