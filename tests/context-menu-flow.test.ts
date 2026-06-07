import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureContextImageBytes,
  translateContextMenuImage,
  type ContextImageBytesPayload
} from "../src/background/context-menu-flow.js";

describe("context menu translation flow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers bytes captured from the clicked page image before fetching the URL", async () => {
    let fetchCalls = 0;
    const result = await translateContextMenuImage({
      captureImageBytes: async (context) => {
        expect(context).toEqual({
          pageUrl: "https://manga.example/chapter-1",
          sourceUrl: "https://manga.example/page-1.png",
          tabId: 12
        });

        return {
          bytesBase64: "Y2FwdHVyZWQtcG5n",
          mediaType: "image/png",
          name: "captured-page.png"
        };
      },
      context: {
        pageUrl: "https://manga.example/chapter-1",
        srcUrl: "https://manga.example/page-1.png",
        tabId: 12
      },
      fetchImageBytes: async () => {
        fetchCalls += 1;
        throw new Error("The source URL should not be fetched after capture");
      },
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      replaceImage: async () => ({ ok: true, replaced: 1 }),
      translateImage: async (input) => {
        expect(input.image).toMatchObject({
          bytesBase64: "Y2FwdHVyZWQtcG5n",
          mediaType: "image/png",
          name: "captured-page.png",
          pageUrl: "https://manga.example/chapter-1",
          url: "https://manga.example/page-1.png"
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

    expect(fetchCalls).toBe(0);
    expect(result).toMatchObject({
      jobId: "job_1",
      ok: true,
      status: "completed"
    });
  });

  it("translates the clicked image, waits for completion, and replaces it without opening WebUI", async () => {
    const openedUrls: string[] = [];
    const replacements: unknown[] = [];
    const result = await translateContextMenuImage({
      context: {
        pageUrl: "https://manga.example/chapter-1",
        srcUrl: "https://manga.example/page-1.png",
        tabId: 12
      },
      captureImageBytes: async () =>
        ({
          bytesBase64: "cGFnZSAx",
          domId: "hanako-context-img-4",
          domIndex: 4,
          mediaType: "image/png"
        }) satisfies ContextImageBytesPayload,
      fetchImageBytes: async (image) => {
        throw new Error(`Unexpected URL fetch for ${image.url}`);
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
          domId: "hanako-context-img-4",
          domIndex: 4,
          renderedUrl:
            "http://localhost:8787/api/jobs/job_1/pages/page_1/rendered",
          sourceUrl: "https://manga.example/page-1.png"
        },
        tabId: 12
      }
    ]);
  });

  it("emits active phases while translating and replacing a clicked image", async () => {
    const phases: unknown[] = [];

    await translateContextMenuImage({
      context: {
        srcUrl: "https://manga.example/page-1.png",
        tabId: 12
      },
      captureImageBytes: async () => ({
        bytesBase64: "cGFnZSAx",
        mediaType: "image/png"
      }),
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      onPhase: async (phase) => {
        phases.push(phase);
      },
      replaceImage: async () => ({ ok: true, replaced: 1 }),
      translateImage: async () => ({ job: { id: "job_1" } }),
      waitForJobCompletion: async () => ({
        detail: {
          job: { id: "job_1", status: "completed" },
          pages: [{ id: "page_1", renderedAssetId: "asset_1" }]
        },
        status: "completed"
      })
    });

    expect(phases).toEqual([
      { message: "Capturing clicked image", phase: "capturing-image" },
      { message: "Submitting image to Hanako", phase: "submitting-job" },
      {
        jobId: "job_1",
        message: "Waiting for Hanako job",
        phase: "waiting-for-job"
      },
      {
        jobId: "job_1",
        message: "Replacing rendered image",
        phase: "replacing-image"
      },
      {
        jobId: "job_1",
        message: "Translation completed",
        phase: "completed"
      }
    ]);
  });

  it("falls back to background source fetch when clicked image canvas extraction fails", async () => {
    const fetchedImages: unknown[] = [];
    const translatedImages: unknown[] = [];
    const result = await translateContextMenuImage({
      captureImageBytes: async () => undefined,
      context: {
        pageUrl: "https://x.com/WwQel/status/2063186089964408919/photo/1",
        srcUrl: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg",
        tabId: 12
      },
      fetchImageBytes: async (image) => {
        fetchedImages.push(image);
        return {
          bytesBase64: "ZnVsbC1zb3VyY2UtaW1hZ2U=",
          mediaType: "image/jpeg",
          name: "HJ4cDDWbgAALVyK"
        };
      },
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      replaceImage: async () => ({ ok: true, replaced: 1 }),
      translateImage: async (input) => {
        translatedImages.push(input.image);
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

    expect(fetchedImages).toEqual([
      {
        pageUrl: "https://x.com/WwQel/status/2063186089964408919/photo/1",
        url: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg"
      }
    ]);
    expect(translatedImages).toEqual([
      {
        bytesBase64: "ZnVsbC1zb3VyY2UtaW1hZ2U=",
        mediaType: "image/jpeg",
        name: "HJ4cDDWbgAALVyK",
        pageUrl: "https://x.com/WwQel/status/2063186089964408919/photo/1",
        url: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg"
      }
    ]);
    expect(result).toMatchObject({
      jobId: "job_1",
      ok: true,
      status: "completed"
    });
  });

  it("does not fall back to visible viewport screenshots for context captures", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      error: "The clicked image could not be captured from the page",
      ok: false
    });
    const executeScript = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("chrome", {
      scripting: { executeScript },
      tabs: { sendMessage }
    });

    await expect(
      captureContextImageBytes({
        sourceUrl: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg",
        tabId: 12,
        windowId: 9
      })
    ).resolves.toBeUndefined();

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(12, {
      sourceUrl: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg",
      type: "HANAKO_CAPTURE_IMAGE_BYTES"
    });
  });
});
