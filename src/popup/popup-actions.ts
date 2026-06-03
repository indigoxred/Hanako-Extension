import { normalizeBaseUrl } from "../background/hanako-client.js";

import type { ExtensionSettings } from "../options/extension-settings.js";

export interface DetectImagesMessage {
  type: "HANAKO_DETECT_IMAGES";
}

export function createOpenWebUiUrl(
  settings: Pick<ExtensionSettings, "hanakoBaseUrl">
): string {
  return normalizeBaseUrl(settings.hanakoBaseUrl);
}

export function createDetectImagesMessage(): DetectImagesMessage {
  return { type: "HANAKO_DETECT_IMAGES" };
}
