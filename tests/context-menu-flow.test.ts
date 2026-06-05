import { describe, expect, it } from "vitest";

import { translateContextMenuImage } from "../src/background/context-menu-flow.js";

describe("context menu translation flow", () => {
  it("translates the clicked image, waits for completion, and replaces it without opening WebUI", async () => {
    const openedUrls: string[] = [];
    const replacements: unknown[] = [];
    const result = await translateContextMenuImage({
      context: {
        pageUrl: "https://manga.example/chapter-1",
        srcUrl: "https://manga.example/page-1.png",
        tabId: 12
      },
      fetchImageBytes: async (image) => {
        expect(image.url).toBe("https://manga.example/page-1.png");
        return {
          bytesBase64: "cGFnZSAx",
          mediaType: "image/png"
        };
      },
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      openTab: async (url) => {
        openedUrls.push(url);
      },
      replaceImage: async (tabId, replacement) => {
        replacements.push({ replacement, tabId });
        return { ok: true, replaced: 1 };
      },
      translateImage: async (input) => {
        expect(input).toMatchObject({
          baseUrl: "http://localhost:8787",
          image: {
            bytesBase64: "cGFnZSAx",
            mediaType: "image/png",
            pageUrl: "https://manga.example/chapter-1",
            url: "https://manga.example/page-1.png"
          },
          targetLanguage: "en"
        });
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
      jobId: "job_1",
      ok: true,
      replacementCount: 1,
      status: "completed"
    });
    expect(openedUrls).toEqual([]);
    expect(replacements).toEqual([
      {
        replacement: {
          renderedUrl:
            "http://localhost:8787/api/jobs/job_1/pages/page_1/rendered",
          sourceUrl: "https://manga.example/page-1.png"
        },
        tabId: 12
      }
    ]);
  });

  it("fails before contacting Hanako when the clicked image bytes cannot be extracted", async () => {
    const result = await translateContextMenuImage({
      context: {
        srcUrl: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg",
        tabId: 12
      },
      fetchImageBytes: async () => undefined,
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      replaceImage: async () => {
        throw new Error("Should not replace an image before a job exists");
      },
      translateImage: async () => {
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
});
