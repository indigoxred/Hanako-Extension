import { describe, expect, it } from "vitest";

import {
  clearActiveExtensionJob,
  pollActiveExtensionJobsOnce,
  trackActiveExtensionJob
} from "../src/background/active-job-poller.js";

function createStorage() {
  const values: Record<string, unknown> = {};

  return {
    values,
    async get(keys: string[] | Record<string, unknown>) {
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, values[key]]));
      }

      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [
          key,
          values[key] ?? fallback
        ])
      );
    },
    async set(items: Record<string, unknown>) {
      Object.assign(values, items);
    }
  };
}

describe("active extension job poller", () => {
  it("finishes a stored active job when Hanako reports completion", async () => {
    const storage = createStorage();
    const replacements: unknown[] = [];
    const states: unknown[] = [];
    const executedTabs: number[] = [];

    await trackActiveExtensionJob(storage, {
      baseUrl: "http://hanako.test",
      imageCount: 1,
      jobId: "job_1",
      replacements: [
        {
          domId: "hanako-img-1",
          domIndex: 0,
          sourceUrl: "https://manga.example/page-1.png"
        }
      ],
      tabId: 7
    });

    await pollActiveExtensionJobsOnce({
      executeContentScript: async (tabId) => {
        executedTabs.push(tabId);
      },
      pollJobOnce: async (input) => {
        expect(input).toMatchObject({
          baseUrl: "http://hanako.test",
          jobId: "job_1"
        });
        return {
          job: { id: "job_1", status: "completed" },
          pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
        };
      },
      sendReplaceImagesMessage: async (tabId, input) => {
        replacements.push({ input, tabId });
        return { ok: true, replaced: input.replacements.length };
      },
      setTabJobState: async (tabId, state) => {
        states.push({ state, tabId });
        return { ...state, updatedAt: "now" };
      },
      storage
    });

    expect(executedTabs).toEqual([7]);
    expect(replacements).toEqual([
      {
        input: {
          replacements: [
            {
              domId: "hanako-img-1",
              domIndex: 0,
              renderedUrl:
                "http://hanako.test/api/jobs/job_1/pages/page_1/rendered",
              sourceUrl: "https://manga.example/page-1.png"
            }
          ]
        },
        tabId: 7
      }
    ]);
    expect(states.at(-1)).toEqual({
      state: {
        jobId: "job_1",
        message: "Replaced 1 image",
        phase: "completed",
        status: "completed"
      },
      tabId: 7
    });

    await clearActiveExtensionJob(storage, "7:job_1");
    await expect(
      pollActiveExtensionJobsOnce({
        pollJobOnce: async () => {
          throw new Error("No active jobs should remain");
        },
        storage
      })
    ).resolves.toEqual({ polled: 0 });
  });
});
