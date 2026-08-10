import { describe, expect, it } from "vitest";

import {
  clearActiveExtensionJob,
  getActiveExtensionJobs,
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

  it("stores the latest Hanako progress phase while the job is still running", async () => {
    const storage = createStorage();
    const states: unknown[] = [];

    await trackActiveExtensionJob(storage, {
      baseUrl: "http://hanako.test",
      imageCount: 1,
      jobId: "job_1",
      replacements: [{ domIndex: 0 }],
      tabId: 7
    });

    await pollActiveExtensionJobsOnce({
      pollJobOnce: async () => ({
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
      }),
      setTabJobState: async (tabId, state) => {
        states.push({ state, tabId });
        return { ...state, updatedAt: "now" };
      },
      storage
    });

    expect(states.at(-1)).toEqual({
      state: {
        jobId: "job_1",
        message: "Detecting text regions and running OCR",
        phase: "detect_ocr",
        status: "running"
      },
      tabId: 7
    });
  });

  it("keeps polling completed active jobs until rendered page metadata appears", async () => {
    const storage = createStorage();
    const replacements: unknown[] = [];
    const states: unknown[] = [];
    const responses = [
      {
        job: { id: "job_1", status: "completed" },
        pages: [{ id: "page_1" }]
      },
      {
        job: { id: "job_1", status: "completed" },
        pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
      }
    ];

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
      executeContentScript: async () => {
        throw new Error("Should not replace before rendered page metadata");
      },
      pollJobOnce: async () => responses.shift()!,
      sendReplaceImagesMessage: async () => {
        throw new Error("Should not replace before rendered page metadata");
      },
      setTabJobState: async (tabId, state) => {
        states.push({ state, tabId });
        return { ...state, updatedAt: "now" };
      },
      storage
    });

    expect(states.at(-1)).toEqual({
      state: {
        jobId: "job_1",
        message: "Waiting for Hanako rendered pages",
        phase: "render_pages",
        status: "running"
      },
      tabId: 7
    });

    await pollActiveExtensionJobsOnce({
      executeContentScript: async () => undefined,
      pollJobOnce: async () => responses.shift()!,
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
  });
  it.each([
    ["partial", { applied: 1, failed: 0, ok: true }],
    ["zero", { applied: 0, failed: 0, ok: true }]
  ])(
    "keeps the active job when delivery acknowledgement is %s",
    async (_label, response) => {
      const storage = createStorage();

      await trackActiveExtensionJob(storage, {
        baseUrl: "http://hanako.test",
        imageCount: 2,
        jobId: "job_1",
        replacements: [{ domIndex: 0 }, { domIndex: 1 }],
        tabId: 7
      });

      await pollActiveExtensionJobsOnce({
        executeContentScript: async () => undefined,
        pollJobOnce: async () => ({
          job: { id: "job_1", status: "completed" },
          pages: [
            { id: "page_1", renderedAssetId: "asset_1" },
            { id: "page_2", renderedAssetId: "asset_2" }
          ]
        }),
        sendReplaceImagesMessage: async () => response,
        setTabJobState: async (_tabId, state) => ({
          ...state,
          updatedAt: "now"
        }),
        storage
      });

      await expect(getActiveExtensionJobs(storage)).resolves.toHaveLength(1);
    }
  );

  it("removes a retained job after a subsequent alarm retry is fully acknowledged", async () => {
    const storage = createStorage();
    const responses = [
      { applied: 0, failed: 1, ok: false },
      { applied: 1, failed: 0, ok: true }
    ];

    await trackActiveExtensionJob(storage, {
      baseUrl: "http://hanako.test",
      imageCount: 1,
      jobId: "job_1",
      replacements: [{ domIndex: 0 }],
      tabId: 7
    });

    const poll = () =>
      pollActiveExtensionJobsOnce({
        executeContentScript: async () => undefined,
        pollJobOnce: async () => ({
          job: { id: "job_1", status: "completed" },
          pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
        }),
        sendReplaceImagesMessage: async () => responses.shift()!,
        setTabJobState: async (_tabId, state) => ({
          ...state,
          updatedAt: "now"
        }),
        storage
      });

    await poll();
    await expect(getActiveExtensionJobs(storage)).resolves.toHaveLength(1);

    await poll();
    await expect(getActiveExtensionJobs(storage)).resolves.toHaveLength(0);
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
