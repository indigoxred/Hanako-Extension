import { describe, expect, it } from "vitest";

import manifest from "../src/manifest.js";

describe("extension manifest", () => {
  it("uses Manifest V3 with host access for arbitrary image sources and Hanako servers", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual([
      "storage",
      "contextMenus",
      "activeTab",
      "alarms",
      "scripting",
      "unlimitedStorage"
    ]);
    expect(manifest.host_permissions).toEqual(["<all_urls>"]);
    expect(manifest).not.toHaveProperty("optional_host_permissions");
  });
});
