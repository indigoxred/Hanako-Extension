import { describe, expect, it } from "vitest";

import { translateActiveTab } from "../src/background/translate-flow.js";

describe("extension translate flow", () => {
  it("detects active-tab images, creates a page job, replaces rendered images, and leaves WebUI opening optional", async () => {
    const calls: string[] = [];
    const openedUrls: string[] = [];
    const replacements: unknown[] = [];
    const result = await translateActiveTab({
      loadSettings: async () => ({
        autoGlossaryStorageScopeId: "scope_new",
        glossaryScopeIds: ["scope_1"],
        hanakoBaseUrl: "http://localhost:8787/",
        targetLanguage: "ja"
      }),
      openTab: async (url) => {
        openedUrls.push(url);
      },
      queryActiveTab: async () => ({ id: 7 }),
      sendDetectImagesMessage: async (tabId) => {
        calls.push(`message:${tabId}`);
        return {
          images: [
            {
              domIndex: 0,
              domId: "hanako-img-1",
              height: 1200,
              pageUrl: "https://manga.example/chapter-1",
              url: "https://manga.example/page-1.png",
              width: 800
            }
          ],
          ok: true,
          pageUrl: "https://manga.example/chapter-1"
        };
      },
      executeContentScript: async (tabId) => {
        calls.push(`script:${tabId}`);
      },
      fetchImageBytes: async (image) => {
        expect(image.url).toBe("https://manga.example/page-1.png");
        return {
          bytesBase64: "cGFnZSAx",
          mediaType: "image/png"
        };
      },
      translatePage: async (input) => {
        expect(input).toMatchObject({
          autoGlossaryStorageScopeId: "scope_new",
          baseUrl: "http://localhost:8787/",
          glossaryScopeIds: ["scope_1"],
          images: [
            {
              bytesBase64: "cGFnZSAx",
              domIndex: 0,
              domId: "hanako-img-1",
              height: 1200,
              mediaType: "image/png",
              pageUrl: "https://manga.example/chapter-1",
              url: "https://manga.example/page-1.png",
              width: 800
            }
          ],
          targetLanguage: "ja"
        });
        return { job: { id: "job_1" } };
      },
      waitForJobCompletion: async (input) => {
        expect(input).toMatchObject({
          baseUrl: "http://localhost:8787/",
          jobId: "job_1"
        });
        return {
          detail: {
            job: { id: "job_1", status: "completed" },
            pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
          },
          status: "completed"
        };
      },
      sendReplaceImagesMessage: async (tabId, replacementInput) => {
        replacements.push({ tabId, replacementInput });
        return { ok: true, replaced: replacementInput.replacements.length };
      }
    });

    expect(result).toEqual({
      imageCount: 1,
      jobId: "job_1",
      ok: true,
      replacementCount: 1,
      status: "completed"
    });
    expect(calls).toEqual(["script:7", "message:7"]);
    expect(openedUrls).toEqual([]);
    expect(replacements).toEqual([
      {
        replacementInput: {
          replacements: [
            {
              domIndex: 0,
              domId: "hanako-img-1",
              renderedUrl:
                "http://localhost:8787/api/jobs/job_1/pages/page_1/rendered"
            }
          ]
        },
        tabId: 7
      }
    ]);
  });

  it("returns a timeout result when the job does not complete before polling ends", async () => {
    const result = await translateActiveTab({
      executeContentScript: async () => undefined,
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      openTab: async () => undefined,
      fetchImageBytes: async () => ({
        bytesBase64: "cGFnZQ==",
        mediaType: "image/png"
      }),
      queryActiveTab: async () => ({ id: 7 }),
      sendDetectImagesMessage: async () => ({
        images: [{ domIndex: 0, url: "https://manga.example/page.png" }],
        ok: true
      }),
      sendReplaceImagesMessage: async () => ({ ok: true, replaced: 0 }),
      translatePage: async () => ({ job: { id: "job_1" } }),
      waitForJobCompletion: async () => ({
        detail: { job: { id: "job_1", status: "running" } },
        status: "timeout"
      })
    });

    expect(result).toEqual({
      imageCount: 1,
      jobId: "job_1",
      ok: true,
      replacementCount: 0,
      status: "timeout"
    });
  });

  it("returns a failure when the job fails while polling", async () => {
    const result = await translateActiveTab({
      executeContentScript: async () => undefined,
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      openTab: async () => undefined,
      fetchImageBytes: async () => ({
        bytesBase64: "cGFnZQ==",
        mediaType: "image/png"
      }),
      queryActiveTab: async () => ({ id: 7 }),
      sendDetectImagesMessage: async () => ({
        images: [{ domIndex: 0, url: "https://manga.example/page.png" }],
        ok: true
      }),
      sendReplaceImagesMessage: async () => ({ ok: true, replaced: 0 }),
      translatePage: async () => ({ job: { id: "job_1" } }),
      waitForJobCompletion: async () => ({
        detail: {
          error: { message: "Pipeline failed" },
          job: { id: "job_1", status: "failed" }
        },
        status: "failed"
      })
    });

    expect(result).toEqual({
      error: "Pipeline failed",
      jobId: "job_1",
      ok: false,
      status: "failed"
    });
  });

  it("skips active-tab images whose bytes cannot be extracted and submits the remaining raster images", async () => {
    const result = await translateActiveTab({
      executeContentScript: async () => undefined,
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      fetchImageBytes: async (image) => {
        if (image.url?.endsWith("page-1.jpg")) {
          return {
            bytesBase64: "cGFnZSAx",
            mediaType: "image/jpeg"
          };
        }

        return undefined;
      },
      queryActiveTab: async () => ({ id: 7 }),
      sendDetectImagesMessage: async () => ({
        images: [
          {
            domId: "hanako-page-1",
            height: 1200,
            url: "https://manga.example/page-1.jpg",
            width: 800
          },
          {
            domId: "hanako-icon",
            height: 150,
            url: "https://manga.example/icon.svg",
            width: 150
          },
          {
            domId: "hanako-blocked",
            height: 680,
            url: "https://cdn.example/blocked.jpg",
            width: 483
          }
        ],
        ok: true,
        pageUrl: "https://manga.example/chapter-1"
      }),
      sendReplaceImagesMessage: async (_tabId, input) => ({
        ok: true,
        replaced: input.replacements.length
      }),
      translatePage: async (input) => {
        expect(input.images).toEqual([
          {
            bytesBase64: "cGFnZSAx",
            domId: "hanako-page-1",
            height: 1200,
            mediaType: "image/jpeg",
            pageUrl: "https://manga.example/chapter-1",
            url: "https://manga.example/page-1.jpg",
            width: 800
          }
        ]);
        return { job: { id: "job_1" } };
      },
      waitForJobCompletion: async () => ({
        detail: {
          job: { id: "job_1", status: "completed" },
          pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
        },
        status: "completed"
      })
    });

    expect(result).toEqual({
      imageCount: 1,
      jobId: "job_1",
      ok: true,
      replacementCount: 1,
      status: "completed"
    });
  });

  it("fails before contacting Hanako when active-tab image bytes cannot be extracted", async () => {
    const result = await translateActiveTab({
      executeContentScript: async () => undefined,
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      fetchImageBytes: async () => undefined,
      queryActiveTab: async () => ({ id: 7 }),
      sendDetectImagesMessage: async () => ({
        images: [{ domIndex: 0, url: "https://manga.example/page.png" }],
        ok: true
      }),
      sendReplaceImagesMessage: async () => {
        throw new Error("Should not replace images before a job exists");
      },
      translatePage: async () => {
        throw new Error("Should not contact Hanako without image bytes");
      },
      waitForJobCompletion: async () => {
        throw new Error("Should not poll without a job");
      }
    });

    expect(result).toEqual({
      error: "The extension could not extract bytes for this image",
      ok: false
    });
  });

  it("reports a failure when no active tab is available", async () => {
    const result = await translateActiveTab({
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      openTab: async () => undefined,
      queryActiveTab: async () => ({}),
      sendDetectImagesMessage: async () => ({ images: [], ok: true }),
      executeContentScript: async () => undefined,
      translatePage: async () => ({ job: { id: "job_1" } })
    });

    expect(result).toEqual({
      error: "No active tab was available",
      ok: false
    });
  });
});
