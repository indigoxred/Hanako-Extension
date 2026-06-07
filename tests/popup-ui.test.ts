import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("popup UI", () => {
  it("does not expose the old page-wide detection and translation actions", async () => {
    const source = await readFile(resolve("src/popup/Popup.tsx"), "utf8");

    expect(source).not.toContain("Detect manga images");
    expect(source).not.toContain("Translate page");
  });

  it("shows the active job phase from stored job state", async () => {
    const source = await readFile(resolve("src/popup/Popup.tsx"), "utf8");

    expect(source).toContain("Current phase:");
    expect(source).toContain("setInterval");
  });

  it("sets a wider popup width to reduce unnecessary wrapping", async () => {
    const source = await readFile(resolve("src/popup/popup.html"), "utf8");

    expect(source).toContain("min-width: 420px");
  });

  it("groups WebUI links on their own spaced row and resets success text", async () => {
    const source = await readFile(resolve("src/popup/Popup.tsx"), "utf8");

    expect(source).toContain('className="popup-link-row"');
    expect(source).toContain("SUCCESS_STATUS_RESET_MS");
    expect(source).toContain('setStatus("Ready")');
  });
});
