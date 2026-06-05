import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..");
const ciWorkflowPath = resolve(repoRoot, ".github", "workflows", "ci.yml");
const releaseWorkflowPath = resolve(
  repoRoot,
  ".github",
  "workflows",
  "release.yml"
);

describe("release workflow", () => {
  it("publishes a Chrome extension release from the merged CI workflow", () => {
    expect(existsSync(ciWorkflowPath)).toBe(true);
    expect(existsSync(releaseWorkflowPath)).toBe(false);

    const workflow = readFileSync(ciWorkflowPath, "utf8");

    expect(workflow).toContain("push:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("pnpm build");
    expect(workflow).toContain("pnpm test");
    expect(workflow).toContain("hanako-extension-chrome.zip");
    expect(workflow).toContain('tag_name="sha-${short_sha}"');
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("github.event_name != 'pull_request'");
  });
});
