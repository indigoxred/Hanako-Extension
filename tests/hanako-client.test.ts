import { describe, expect, it } from "vitest";

import {
  checkHanakoConnection,
  translateImage,
  translatePage
} from "../src/background/hanako-client.js";
import {
  createRenderedPageUrl,
  pollJobOnce,
  waitForJobCompletion
} from "../src/background/job-poller.js";

describe("Hanako extension client", () => {
  it("checks Hanako health against the configured base URL", async () => {
    const ok = await checkHanakoConnection({
      baseUrl: "http://hanako.test",
      fetch: async (input) => {
        expect(input).toBe("http://hanako.test/healthz");
        return new Response(
          JSON.stringify({ ok: true, service: "hanako-api" })
        );
      }
    });

    expect(ok).toBe(true);
  });

  it("polls extension jobs against the configured base URL", async () => {
    const result = await pollJobOnce({
      baseUrl: "http://hanako.test",
      jobId: "job_1",
      fetch: async (input) => {
        expect(input).toBe("http://hanako.test/api/extension/jobs/job_1");
        return new Response(JSON.stringify({ job: { id: "job_1" } }));
      }
    });

    expect(result).toEqual({ job: { id: "job_1" } });
  });

  it("builds rendered page URLs", () => {
    expect(
      createRenderedPageUrl({
        baseUrl: "http://hanako.test/",
        jobId: "job_1",
        pageId: "page_1"
      })
    ).toBe("http://hanako.test/api/jobs/job_1/pages/page_1/rendered");
  });

  it("waits until an extension job is completed", async () => {
    const statuses = ["running", "rendering", "completed"];
    const result = await waitForJobCompletion({
      baseUrl: "http://hanako.test",
      delayMs: 0,
      fetch: async () =>
        new Response(
          JSON.stringify({
            job: { id: "job_1", status: statuses.shift() },
            pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
          })
        ),
      jobId: "job_1",
      maxAttempts: 5
    });

    expect(result).toEqual({
      detail: {
        job: { id: "job_1", status: "completed" },
        pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
      },
      status: "completed"
    });
  });

  it("keeps polling a completed extension job until required rendered pages appear", async () => {
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

    const result = await waitForJobCompletion({
      baseUrl: "http://hanako.test",
      delayMs: 0,
      fetch: async () => new Response(JSON.stringify(responses.shift())),
      jobId: "job_1",
      maxAttempts: 3,
      requiredRenderedPages: 1
    });

    expect(result).toEqual({
      detail: {
        job: { id: "job_1", status: "completed" },
        pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
      },
      status: "completed"
    });
  });

  it("stops polling when an extension job fails", async () => {
    const result = await waitForJobCompletion({
      baseUrl: "http://hanako.test",
      delayMs: 0,
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: { message: "Pipeline failed" },
            job: { id: "job_1", status: "failed" }
          })
        ),
      jobId: "job_1",
      maxAttempts: 3
    });

    expect(result).toEqual({
      detail: {
        error: { message: "Pipeline failed" },
        job: { id: "job_1", status: "failed" }
      },
      status: "failed"
    });
  });

  it("times out while waiting for an extension job", async () => {
    const result = await waitForJobCompletion({
      baseUrl: "http://hanako.test",
      delayMs: 0,
      fetch: async () =>
        new Response(
          JSON.stringify({ job: { id: "job_1", status: "running" } })
        ),
      jobId: "job_1",
      maxAttempts: 2
    });

    expect(result).toEqual({
      detail: { job: { id: "job_1", status: "running" } },
      status: "timeout"
    });
  });

  it("creates a single-image extension job", async () => {
    const result = await translateImage({
      baseUrl: "http://hanako.test/",
      fetch: async (input, init) => {
        expect(input).toBe("http://hanako.test/api/extension/translate-image");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ "content-type": "application/json" });
        expect(JSON.parse(String(init?.body))).toEqual({
          image: {
            bytesBase64: "cGFnZSAx",
            height: 1200,
            mediaType: "image/png",
            pageUrl: "https://manga.example/chapter-1",
            width: 800
          },
          mode: "auto",
          targetLanguage: "en"
        });
        return new Response(JSON.stringify({ job: { id: "job_1" } }), {
          status: 201
        });
      },
      image: {
        bytesBase64: "cGFnZSAx",
        height: 1200,
        mediaType: "image/png",
        pageUrl: "https://manga.example/chapter-1",
        url: "https://manga.example/page-1.png",
        width: 800
      },
      targetLanguage: "en"
    });

    expect(result).toEqual({ job: { id: "job_1" } });
  });

  it("creates a page-batch extension job", async () => {
    const result = await translatePage({
      baseUrl: "http://hanako.test",
      fetch: async (input, init) => {
        expect(input).toBe("http://hanako.test/api/extension/translate-page");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          images: [
            {
              bytesBase64: "cGFnZSAx",
              domIndex: 0,
              height: 1200,
              mediaType: "image/png",
              pageUrl: "https://manga.example/chapter-1",
              width: 800
            }
          ],
          mode: "auto",
          targetLanguage: "ja"
        });
        return new Response(JSON.stringify({ job: { id: "job_2" } }), {
          status: 201
        });
      },
      images: [
        {
          bytesBase64: "cGFnZSAx",
          domIndex: 0,
          height: 1200,
          mediaType: "image/png",
          pageUrl: "https://manga.example/chapter-1",
          url: "https://manga.example/page-1.png",
          width: 800
        }
      ],
      targetLanguage: "ja"
    });

    expect(result).toEqual({ job: { id: "job_2" } });
  });
});
