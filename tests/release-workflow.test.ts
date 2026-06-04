import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..");
const workflowPath = resolve(repoRoot, ".github", "workflows", "release.yml");

describe("release workflow", () => {
  it("builds and uploads a Chrome extension zip to GitHub Releases", () => {
    expect(existsSync(workflowPath)).toBe(true);

    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("release:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("pnpm build");
    expect(workflow).toContain("hanako-extension-chrome.zip");
    expect(workflow).toContain("softprops/action-gh-release@v2");
  });
});
