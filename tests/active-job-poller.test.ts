import { describe, expect, it } from "vitest";

import {
  getActiveExtensionJobs,
  pollActiveExtensionJobsOnce,
  trackActiveExtensionJob
} from "../src/background/active-job-poller.js";

function createStorage() {
  const values: Record<string, unknown> = {};
  const writes: Array<Record<string, unknown>> = [];

  return {
    values,
    writes,
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
      writes.push(structuredClone(items));
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
        return { applied: input.replacements.length, failed: 0, ok: true };
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

    await expect(getActiveExtensionJobs(storage)).resolves.toHaveLength(0);
    await expect(
      pollActiveExtensionJobsOnce({
        pollJobOnce: async () => {
          throw new Error("No active jobs should remain");
        },
        storage
      })
    ).resolves.toEqual({ polled: 0 });
  });

  it("stores the latest Hanako progress phase while the job is still running", async () => {
    const storage = createStorage();
    const states: unknown[] = [];
    let pollRequests = 0;

    await trackActiveExtensionJob(storage, {
      baseUrl: "http://hanako.test",
      imageCount: 1,
      jobId: "job_1",
      replacements: [{ domIndex: 0 }],
      tabId: 7
    });
    const storedBeforePoll = await getActiveExtensionJobs(storage);

    const poll = () =>
      pollActiveExtensionJobsOnce({
        pollJobOnce: async () => {
          pollRequests += 1;
          return {
            job: { id: "job_1", status: "running" },
            progress: [
              {
                createdAt: "2026-06-07T00:00:01.000Z",
                label: "Detect/OCR",
                message: "Detecting text regions and running OCR",
                status: "started",
                step: "detect_ocr"
              }
            ]
          };
        },
        setTabJobState: async (tabId, state) => {
          states.push({ state, tabId });
          return { ...state, updatedAt: "now" };
        },
        storage
      });

    await poll();
    await poll();

    expect(pollRequests).toBe(2);
    expect(states.at(-1)).toEqual({
      state: {
        jobId: "job_1",
        message: "Detecting text regions and running OCR",
        phase: "detect_ocr",
        status: "running"
      },
      tabId: 7
    });
    await expect(getActiveExtensionJobs(storage)).resolves.toEqual(
      storedBeforePoll
    );
  });

  it("clears a completed job without rendered metadata and does not poll it again", async () => {
    const storage = createStorage();
    const states: unknown[] = [];
    let pollRequests = 0;

    await trackActiveExtensionJob(storage, {
      baseUrl: "http://hanako.test",
      imageCount: 1,
      jobId: "job_1",
      replacements: [{ domIndex: 0 }],
      tabId: 7
    });

    const poll = () =>
      pollActiveExtensionJobsOnce({
        executeContentScript: async () => {
          throw new Error("Should not replace without rendered metadata");
        },
        pollJobOnce: async () => {
          pollRequests += 1;
          return {
            job: { id: "job_1", status: "completed" },
            pages: [{ id: "page_1" }]
          };
        },
        sendReplaceImagesMessage: async () => {
          throw new Error("Should not replace without rendered metadata");
        },
        setTabJobState: async (tabId, state) => {
          states.push({ state, tabId });
          return { ...state, updatedAt: "now" };
        },
        storage
      });

    await poll();
    await poll();

    expect(pollRequests).toBe(1);
    await expect(getActiveExtensionJobs(storage)).resolves.toHaveLength(0);
    expect(states.at(-1)).toEqual({
      state: {
        jobId: "job_1",
        message:
          "Translation completed, but the rendered image could not be applied",
        phase: "failed",
        status: "failed"
      },
      tabId: 7
    });
  });

  it.each([
    ["partial", { applied: 1, failed: 0, ok: true }],
    ["zero", { applied: 0, failed: 0, ok: true }],
    ["errored", new Error("content script unavailable")]
  ])(
    "clears a completed job when delivery acknowledgement is %s",
    async (_label, response) => {
      const storage = createStorage();
      const states: unknown[] = [];
      let pollRequests = 0;

      await trackActiveExtensionJob(storage, {
        baseUrl: "http://hanako.test",
        imageCount: 2,
        jobId: "job_1",
        replacements: [{ domIndex: 0 }, { domIndex: 1 }],
        tabId: 7
      });

      await pollActiveExtensionJobsOnce({
        executeContentScript: async () => undefined,
        pollJobOnce: async () => {
          pollRequests += 1;
          return {
            job: { id: "job_1", status: "completed" },
            pages: [
              { id: "page_1", renderedAssetId: "asset_1" },
              { id: "page_2", renderedAssetId: "asset_2" }
            ]
          };
        },
        sendReplaceImagesMessage: async () => {
          if (response instanceof Error) {
            throw response;
          }
          return response;
        },
        setTabJobState: async (tabId, state) => {
          states.push({ state, tabId });
          return { ...state, updatedAt: "now" };
        },
        storage
      });

      await pollActiveExtensionJobsOnce({
        pollJobOnce: async () => {
          pollRequests += 1;
          throw new Error("Terminal job should not be polled again");
        },
        setTabJobState: async (_tabId, state) => ({
          ...state,
          updatedAt: "now"
        }),
        storage
      });

      expect(pollRequests).toBe(1);
      await expect(getActiveExtensionJobs(storage)).resolves.toHaveLength(0);
      expect(states.at(-1)).toEqual({
        state: {
          jobId: "job_1",
          message:
            "Translation completed, but the rendered image could not be applied",
          phase: "failed",
          status: "failed"
        },
        tabId: 7
      });
    }
  );

  it("leaves a genuinely active job untouched after a temporary server error", async () => {
    const storage = createStorage();

    await trackActiveExtensionJob(storage, {
      baseUrl: "http://hanako.test",
      imageCount: 1,
      jobId: "job_1",
      replacements: [{ domIndex: 0 }],
      tabId: 7
    });
    const storedBeforePoll = await getActiveExtensionJobs(storage);
    const writesBeforePoll = storage.writes.length;

    await pollActiveExtensionJobsOnce({
      pollJobOnce: async () => {
        throw new Error("temporary server failure");
      },
      setTabJobState: async (_tabId, state) => ({
        ...state,
        updatedAt: "now"
      }),
      storage
    });

    await expect(getActiveExtensionJobs(storage)).resolves.toEqual(
      storedBeforePoll
    );
    expect(storage.writes).toHaveLength(writesBeforePoll);
  });

  it("does not let an overlapping failed poll recreate a delivered job", async () => {
    const storage = createStorage();
    let rejectPendingPoll: ((error: Error) => void) | undefined;

    await trackActiveExtensionJob(storage, {
      baseUrl: "http://hanako.test",
      imageCount: 1,
      jobId: "job_1",
      replacements: [{ domIndex: 0 }],
      tabId: 7
    });

    const failedPoll = pollActiveExtensionJobsOnce({
      pollJobOnce: () =>
        new Promise((_resolve, reject) => {
          rejectPendingPoll = reject;
        }),
      setTabJobState: async (_tabId, state) => ({
        ...state,
        updatedAt: "now"
      }),
      storage
    });
    await Promise.resolve();

    await pollActiveExtensionJobsOnce({
      executeContentScript: async () => undefined,
      pollJobOnce: async () => ({
        job: { id: "job_1", status: "completed" },
        pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
      }),
      sendReplaceImagesMessage: async () => ({
        applied: 1,
        failed: 0,
        ok: true
      }),
      setTabJobState: async (_tabId, state) => ({
        ...state,
        updatedAt: "now"
      }),
      storage
    });
    rejectPendingPoll?.(new Error("temporary poll failure"));
    await failedPoll;

    await expect(getActiveExtensionJobs(storage)).resolves.toHaveLength(0);
  });
});
