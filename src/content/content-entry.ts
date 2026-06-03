import { detectImages } from "./image-detector.js";
import { showOverlay } from "./overlay.js";

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isDetectImagesMessage(message)) {
    return;
  }

  showOverlay(`Found ${detectImages().length} image candidates`);
});

function isDetectImagesMessage(message: unknown): message is { type: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_DETECT_IMAGES"
  );
}
