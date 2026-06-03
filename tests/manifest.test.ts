import { describe, expect, it } from "vitest";

import manifest from "../src/manifest.js";

describe("extension manifest", () => {
  it("uses Manifest V3 with narrow default Hanako permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual([
      "storage",
      "contextMenus",
      "activeTab",
      "scripting"
    ]);
    expect(manifest.host_permissions).toEqual([
      "http://localhost:8787/*",
      "http://127.0.0.1:8787/*"
    ]);
    expect(manifest.optional_host_permissions).toEqual(["<all_urls>"]);
  });
});
