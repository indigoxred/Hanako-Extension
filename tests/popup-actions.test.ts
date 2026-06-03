import { describe, expect, it } from "vitest";

import {
  createDetectImagesMessage,
  createOpenWebUiUrl
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
});
