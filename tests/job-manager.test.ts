import { describe, expect, it } from "vitest";

import { createJobManager } from "../src/background/job-manager.js";

describe("job manager", () => {
  it("deduplicates an active tab translation", async () => {
    let calls = 0;
    const statuses: string[] = [];
    const manager = createJobManager({
      setActionStatus: async (status) => {
        statuses.push(status);
      },
      translateActiveTab: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
          imageCount: 1,
          jobId: "job_1",
          ok: true,
          replacementCount: 1,
          status: "completed"
        };
      }
    });

    await Promise.all([
      manager.translateActiveTab(),
      manager.translateActiveTab()
    ]);

    expect(calls).toBe(1);
    expect(statuses).toEqual(["running", "success"]);
  });

  it("updates queue indicators after queueing an image", async () => {
    const badgeCounts: number[] = [];
    const menuCounts: number[] = [];
    const manager = createJobManager({
      queueContextMenuImage: async () => ({ count: 2, ok: true }),
      updateQueueBadge: async (count) => {
        badgeCounts.push(count);
      },
      updateQueueMenuTitle: async (count) => {
        menuCounts.push(count);
      }
    });

    await expect(
      manager.queueContextMenuImage({
        srcUrl: "https://manga.example/page.png",
        tabId: 7
      })
    ).resolves.toEqual({ count: 2, ok: true });
    expect(badgeCounts).toEqual([2]);
    expect(menuCounts).toEqual([2]);
  });

  it("clears queue indicators after sending a queue", async () => {
    const badgeCounts: number[] = [];
    const menuCounts: number[] = [];
    const manager = createJobManager({
      sendQueuedImages: async () => ({
        imageCount: 2,
        jobId: "job_queue",
        ok: true,
        status: "submitted"
      }),
      setActionStatus: async () => undefined,
      updateQueueBadge: async (count) => {
        badgeCounts.push(count);
      },
      updateQueueMenuTitle: async (count) => {
        menuCounts.push(count);
      }
    });

    await expect(manager.sendQueuedImages()).resolves.toMatchObject({
      jobId: "job_queue",
      ok: true
    });
    expect(badgeCounts).toEqual([0]);
    expect(menuCounts).toEqual([0]);
  });
});
