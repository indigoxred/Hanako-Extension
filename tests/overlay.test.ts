import { afterEach, describe, expect, it, vi } from "vitest";

import { showOverlay } from "../src/content/overlay.js";

describe("showOverlay", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("updates the existing Hanako overlay instead of adding duplicates", () => {
    const first = showOverlay("Found 1", document);
    const second = showOverlay("Found 2", document);

    expect(first).toBe(second);
    expect(document.querySelectorAll("[data-hanako-overlay]")).toHaveLength(1);
    expect(second.textContent).toBe("Found 2");
  });

  it("dismisses transient replacement text after three seconds", () => {
    vi.useFakeTimers();

    const overlay = showOverlay("Replaced 1 translated images", document);

    expect(document.querySelector("[data-hanako-overlay]")).toBe(overlay);

    vi.advanceTimersByTime(2999);
    expect(document.querySelector("[data-hanako-overlay]")).toBe(overlay);

    vi.advanceTimersByTime(1);
    expect(document.querySelector("[data-hanako-overlay]")).toBeNull();
  });
});
