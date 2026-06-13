import { describe, expect, it } from "vitest";

import { createJobManager } from "../src/background/job-manager.js";

describe("job manager", () => {
  it("deduplicates an active tab translation", async () => {
    let calls = 0;
    const statuses: Array<{ status: string; tabId?: number }> = [];
    const manager = createJobManager({
      setActionStatus: async (status, tabId) => {
        statuses.push({ status, tabId });
      },
      translateActiveTab: async (input) => {
        calls += 1;
        await input?.onTabResolved?.(7);
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
    expect(statuses).toEqual([
      { status: "running", tabId: 7 },
      { status: "success", tabId: 7 }
    ]);
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

  it("keeps the source tab badge running when a translation times out", async () => {
    const statuses: Array<{ status: string; tabId?: number }> = [];
    const manager = createJobManager({
      setActionStatus: async (status, tabId) => {
        statuses.push({ status, tabId });
      },
      translateContextMenuImage: async () => ({
        jobId: "job_1",
        ok: true,
        replacementCount: 0,
        status: "timeout"
      })
    });

    await expect(
      manager.translateContextMenuImage({
        srcUrl: "https://manga.example/page.png",
        tabId: 7
      })
    ).resolves.toMatchObject({ jobId: "job_1", ok: true, status: "timeout" });

    expect(statuses).toEqual([
      { status: "running", tabId: 7 },
      { status: "running", tabId: 7 }
    ]);
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
    const statuses: Array<{ status: string; tabId?: number }> = [];
    const manager = createJobManager({
      setActionStatus: async (status, tabId) => {
        statuses.push({ status, tabId });
      },
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

    expect(statuses).toEqual([
      { status: "running", tabId: 7 },
      { status: "success", tabId: 7 }
    ]);
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

  it("keeps context menu capture warnings in the final source tab status", async () => {
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
        status: "completed",
        warning:
          "Warning: screenshot fallback could only include the visible portion of the image."
      })
    });

    await manager.translateContextMenuImage({
      srcUrl: "https://manga.example/page.png",
      tabId: 7
    });

    expect(states.at(-1)).toEqual({
      state: {
        jobId: "job_1",
        message:
          "Replaced 1 image. Warning: screenshot fallback could only include the visible portion of the image.",
        phase: "completed",
        status: "completed"
      },
      tabId: 7
    });
  });

  it("keeps queue capture warnings in the queued source tab status", async () => {
    const states: unknown[] = [];
    const manager = createJobManager({
      queueContextMenuImage: async () => ({
        count: 1,
        ok: true,
        warning:
          "Warning: screenshot fallback could only include the visible portion of the image."
      }),
      setTabJobState: async (tabId, state) => {
        states.push({ state, tabId });
        return { ...state, updatedAt: "now" };
      },
      updateQueueBadge: async () => undefined,
      updateQueueMenuTitle: async () => undefined
    });

    await manager.queueContextMenuImage({
      srcUrl: "https://manga.example/page.png",
      tabId: 7
    });

    expect(states.at(-1)).toEqual({
      state: {
        message:
          "Added 1 page to project. Warning: screenshot fallback could only include the visible portion of the image.",
        status: "queued"
      },
      tabId: 7
    });
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
