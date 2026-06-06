import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("popup UI", () => {
  it("does not expose the old page-wide detection and translation actions", async () => {
    const source = await readFile(resolve("src/popup/Popup.tsx"), "utf8");

    expect(source).not.toContain("Detect manga images");
    expect(source).not.toContain("Translate page");
  });
});
