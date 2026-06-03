import { detectImages } from "./image-detector.js";
import { showOverlay } from "./overlay.js";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isDetectImagesMessage(message)) {
    return false;
  }

  const pageUrl = window.location.href;
  const images = detectImages().map((image) => ({
    domIndex: image.domIndex,
    height: image.height,
    pageUrl,
    url: image.src,
    width: image.width
  }));
  showOverlay(`Found ${images.length} image candidates`);
  sendResponse({ images, ok: true, pageUrl });
  return true;
});

function isDetectImagesMessage(message: unknown): message is { type: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_DETECT_IMAGES"
  );
}
