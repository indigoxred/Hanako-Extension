import { normalizeBaseUrl } from "../background/hanako-client.js";

import type { ExtensionSettings } from "../options/extension-settings.js";

export interface DetectImagesMessage {
  type: "HANAKO_DETECT_IMAGES";
}

export interface DetectActiveTabMessage {
  type: "HANAKO_DETECT_ACTIVE_TAB";
}

export interface TranslateActiveTabMessage {
  type: "HANAKO_TRANSLATE_ACTIVE_TAB";
}

export function createOpenWebUiUrl(
  settings: Pick<ExtensionSettings, "hanakoBaseUrl">
): string {
  return normalizeBaseUrl(settings.hanakoBaseUrl);
}

export function createOpenJobUrl(input: {
  hanakoBaseUrl: string;
  jobId: string;
}): string {
  return `${normalizeBaseUrl(input.hanakoBaseUrl)}/jobs/${encodeURIComponent(
    input.jobId
  )}`;
}

export function createDetectImagesMessage(): DetectImagesMessage {
  return { type: "HANAKO_DETECT_IMAGES" };
}

export function createDetectActiveTabMessage(): DetectActiveTabMessage {
  return { type: "HANAKO_DETECT_ACTIVE_TAB" };
}

export function createTranslateActiveTabMessage(): TranslateActiveTabMessage {
  return { type: "HANAKO_TRANSLATE_ACTIVE_TAB" };
}
