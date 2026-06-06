import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("content script build output", () => {
  it("emits a classic script without top-level module imports", () => {
    const builtContentScript = resolve("dist/content/content-entry.js");

    if (!existsSync(builtContentScript)) {
      return;
    }

    const source = readFileSync(builtContentScript, "utf8");

    expect(source.trimStart()).toMatch(/^\(\(\)\s*=>\s*\{/);
    expect(source).toContain("__hanakoContentEntryInstalled");
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/^\s*export\b/m);
  });
});
