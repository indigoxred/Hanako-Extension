import { describe, expect, it } from "vitest";

import { showOverlay } from "../src/content/overlay.js";

describe("showOverlay", () => {
  it("updates the existing Hanako overlay instead of adding duplicates", () => {
    const first = showOverlay("Found 1", document);
    const second = showOverlay("Found 2", document);

    expect(first).toBe(second);
    expect(document.querySelectorAll("[data-hanako-overlay]")).toHaveLength(1);
    expect(second.textContent).toBe("Found 2");
  });
});
