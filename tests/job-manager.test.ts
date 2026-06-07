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
    const openedUrls: string[] = [];
    const manager = createJobManager({
      sendQueuedImages: async () => ({
        imageCount: 2,
        jobId: "job_queue",
        jobUrl: "http://localhost:8787/jobs/job_queue",
        ok: true,
        status: "submitted"
      }),
      openTab: async (url) => {
        openedUrls.push(url);
      },
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
    expect(openedUrls).toEqual(["http://localhost:8787/jobs/job_queue"]);
  });

  it("stores context menu job status for the source tab", async () => {
    const states: unknown[] = [];
    const manager = createJobManager({
      setActionStatus: async () => undefined,
      setTabJobState: async (tabId, state) => {
        states.push({ state, tabId });
        return { ...state, updatedAt: "now" };
      },
      translateContextMenuImage: async () => ({
        jobId: "job_1",
        ok: true,
        replacementCount: 1,
        status: "completed"
      })
    });

    await expect(
      manager.translateContextMenuImage({
        srcUrl: "https://manga.example/page.png",
        tabId: 7
      })
    ).resolves.toMatchObject({ jobId: "job_1", ok: true });

    expect(states).toEqual([
      {
        state: {
          message: "Translating clicked image",
          phase: "starting",
          status: "running"
        },
        tabId: 7
      },
      {
        state: {
          jobId: "job_1",
          message: "Replaced 1 image",
          phase: "completed",
          status: "completed"
        },
        tabId: 7
      }
    ]);
  });

  it("stores queue finalization phase status for the source tab", async () => {
    const states: unknown[] = [];
    const manager = createJobManager({
      sendQueuedImages: async () => ({
        imageCount: 2,
        jobId: "job_queue",
        jobUrl: "http://localhost:8787/jobs/job_queue",
        ok: true,
        status: "submitted"
      }),
      setActionStatus: async () => undefined,
      setTabJobState: async (tabId, state) => {
        states.push({ state, tabId });
        return { ...state, updatedAt: "now" };
      },
      updateQueueBadge: async () => undefined,
      updateQueueMenuTitle: async () => undefined
    });

    await expect(
      manager.sendQueuedImages({
        srcUrl: "https://manga.example/page.png",
        tabId: 7
      })
    ).resolves.toMatchObject({ jobId: "job_queue", ok: true });

    expect(states).toEqual([
      {
        state: {
          message: "Finalizing project",
          phase: "finalizing-project",
          status: "running"
        },
        tabId: 7
      },
      {
        state: {
          jobId: "job_queue",
          message: "Submitted 2 project pages to Hanako",
          phase: "submitted",
          status: "submitted"
        },
        tabId: 7
      }
    ]);
  });
});
