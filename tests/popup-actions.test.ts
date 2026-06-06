import { describe, expect, it } from "vitest";

import {
  createClearQueueMessage,
  createClearTranslationsMessage,
  createDetectActiveTabMessage,
  createDetectImagesMessage,
  createGetQueueStatusMessage,
  createOpenJobUrl,
  createOpenWebUiUrl,
  createSendQueueMessage,
  createTranslateActiveTabMessage
} from "../src/popup/popup-actions.js";

describe("popup actions", () => {
  it("builds the configured WebUI URL", () => {
    expect(
      createOpenWebUiUrl({ hanakoBaseUrl: "http://localhost:8787/" })
    ).toBe("http://localhost:8787");
  });

  it("builds the detect images runtime message", () => {
    expect(createDetectImagesMessage()).toEqual({
      type: "HANAKO_DETECT_IMAGES"
    });
  });

  it("builds the detect active tab runtime message", () => {
    expect(createDetectActiveTabMessage()).toEqual({
      type: "HANAKO_DETECT_ACTIVE_TAB"
    });
  });

  it("builds the translate active tab runtime message", () => {
    expect(createTranslateActiveTabMessage()).toEqual({
      type: "HANAKO_TRANSLATE_ACTIVE_TAB"
    });
  });

  it("builds the WebUI job URL", () => {
    expect(
      createOpenJobUrl({
        hanakoBaseUrl: "http://localhost:8787/",
        jobId: "job_1"
      })
    ).toBe("http://localhost:8787/jobs/job_1");
  });

  it("builds queue and clear runtime messages", () => {
    expect(createGetQueueStatusMessage()).toEqual({
      type: "HANAKO_GET_QUEUE_STATUS"
    });
    expect(createSendQueueMessage()).toEqual({ type: "HANAKO_SEND_QUEUE" });
    expect(createClearQueueMessage()).toEqual({ type: "HANAKO_CLEAR_QUEUE" });
    expect(createClearTranslationsMessage()).toEqual({
      type: "HANAKO_CLEAR_TRANSLATIONS_ACTIVE_TAB"
    });
  });
});
