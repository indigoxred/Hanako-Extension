import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("options UI", () => {
  it("loads and renders glossary group settings", async () => {
    const source = await readFile(resolve("src/options/Options.tsx"), "utf8");

    expect(source).toContain("getGlossaryScopes");
    expect(source).toContain("Glossary groups");
    expect(source).toContain("New glossary terms");
    expect(source).toContain("None (Disabled)");
  });

  it("loads and renders Hanako profile selection", async () => {
    const source = await readFile(resolve("src/options/Options.tsx"), "utf8");

    expect(source).toContain("getSettingsProfiles");
    expect(source).toContain("Hanako profile");
    expect(source).toContain("Default settings");
    expect(source).toContain("profileId");
  });

  it("clears glossary selections when target language changes", async () => {
    const source = await readFile(resolve("src/options/Options.tsx"), "utf8");

    expect(source).toContain("glossaryScopeIds: []");
    expect(source).toContain("autoGlossaryStorageScopeId: null");
  });
});
