import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureContextImageBytes,
  captureVisibleContextImageBytes,
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

  it("uses visible screenshot capture directly after source fetch fails", async () => {
    const createTab = vi.fn().mockRejectedValue(new Error("do not open tabs"));
    const fallbackCalls: string[] = [];
    const translatedImages: unknown[] = [];
    vi.stubGlobal("chrome", {
      tabs: { create: createTab }
    });

    const result = await translateContextMenuImage({
      captureImageBytes: async () => undefined,
      captureVisibleImageBytes: async (input) => {
        fallbackCalls.push(`visible:${input.sourceUrl}:${input.windowId}`);
        return {
          bytesBase64: "dmlzaWJsZS1jcm9w",
          domId: "hanako-context-img-2",
          domIndex: 2,
          mediaType: "image/png",
          name: "visible-page.png"
        };
      },
      context: {
        pageUrl: "https://www.pixiv.net/artworks/123",
        srcUrl: "https://i.pximg.net/img-original/img/2026/06/07/page.jpg",
        tabId: 12,
        windowId: 9
      },
      fetchImageBytes: async () => undefined,
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

    expect(fallbackCalls).toEqual([
      "visible:https://i.pximg.net/img-original/img/2026/06/07/page.jpg:9"
    ]);
    expect(createTab).not.toHaveBeenCalled();
    expect(translatedImages).toEqual([
      {
        bytesBase64: "dmlzaWJsZS1jcm9w",
        domId: "hanako-context-img-2",
        domIndex: 2,
        mediaType: "image/png",
        name: "visible-page.png",
        pageUrl: "https://www.pixiv.net/artworks/123",
        url: "https://i.pximg.net/img-original/img/2026/06/07/page.jpg"
      }
    ]);
    expect(result).toMatchObject({
      jobId: "job_1",
      ok: true,
      status: "completed"
    });
  });

  it("emits a warning when screenshot fallback can only capture the visible portion", async () => {
    const phases: unknown[] = [];
    const uploadedImages: unknown[] = [];
    const result = await translateContextMenuImage({
      captureImageBytes: async () => undefined,
      captureVisibleImageBytes: async () => ({
        bytesBase64: "dmlzaWJsZS1jcm9w",
        mediaType: "image/png",
        warning:
          "Warning: screenshot fallback could only include the visible portion of the image."
      }),
      context: {
        pageUrl: "https://www.pixiv.net/artworks/123",
        srcUrl: "https://i.pximg.net/img-original/img/2026/06/07/page.jpg",
        tabId: 12,
        windowId: 9
      },
      fetchImageBytes: async () => undefined,
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      onPhase: async (phase) => {
        phases.push(phase);
      },
      replaceImage: async () => ({ ok: true, replaced: 1 }),
      translateImage: async (input) => {
        uploadedImages.push(input.image);
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

    expect(phases).toContainEqual({
      message:
        "Warning: screenshot fallback could only include the visible portion of the image.",
      phase: "capturing-image"
    });
    expect(result).toMatchObject({
      ok: true,
      warning:
        "Warning: screenshot fallback could only include the visible portion of the image."
    });
    expect(uploadedImages).toEqual([
      {
        bytesBase64: "dmlzaWJsZS1jcm9w",
        mediaType: "image/png",
        pageUrl: "https://www.pixiv.net/artworks/123",
        url: "https://i.pximg.net/img-original/img/2026/06/07/page.jpg"
      }
    ]);
  });

  it("content capture helper only asks the page for image bytes", async () => {
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

  it("scrolls the clicked image before using the visible screenshot fallback", async () => {
    const executeScript = vi.fn().mockResolvedValue([]);
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      rect: {
        domId: "hanako-context-img-3",
        domIndex: 3,
        height: 120,
        left: 10,
        top: 20,
        viewportHeight: 800,
        viewportWidth: 1000,
        width: 200
      }
    });
    vi.stubGlobal("chrome", {
      scripting: { executeScript },
      tabs: { sendMessage }
    });

    await expect(
      captureVisibleContextImageBytes(
        {
          sourceUrl: "https://manga.example/page.png",
          tabId: 12,
          windowId: 9
        },
        {
          captureVisibleElementBitmap: async (input) => {
            expect(input).toEqual({
              rect: {
                domId: "hanako-context-img-3",
                domIndex: 3,
                height: 120,
                left: 10,
                top: 20,
                viewportHeight: 800,
                viewportWidth: 1000,
                width: 200
              },
              sourceUrl: "https://manga.example/page.png",
              windowId: 9
            });
            return {
              bytesBase64: "dmlzaWJsZS1pbWFnZQ==",
              mediaType: "image/png",
              name: "page.png"
            };
          }
        }
      )
    ).resolves.toEqual({
      bytesBase64: "dmlzaWJsZS1pbWFnZQ==",
      domId: "hanako-context-img-3",
      domIndex: 3,
      mediaType: "image/png",
      name: "page.png"
    });

    expect(executeScript).toHaveBeenCalledWith({
      files: ["content/content-entry.js"],
      target: { tabId: 12 }
    });
    expect(sendMessage).toHaveBeenCalledWith(12, {
      sourceUrl: "https://manga.example/page.png",
      type: "HANAKO_SCROLL_IMAGE_INTO_VIEW"
    });
  });

  it("captures a pre-scroll snapshot and passes it as stale when the scroll moved the image", async () => {
    const calls: string[] = [];
    const executeScript = vi.fn().mockResolvedValue([]);
    const sendMessage = vi.fn().mockImplementation(async (_tabId, message) => {
      calls.push(`message:${message.type}`);
      return {
        ok: true,
        rect: {
          domId: "hanako-context-img-3",
          domIndex: 3,
          height: 120,
          left: 10,
          scrollChanged: true,
          top: 20,
          viewportHeight: 800,
          viewportWidth: 1000,
          width: 200
        }
      };
    });
    vi.stubGlobal("chrome", {
      scripting: { executeScript },
      tabs: { sendMessage }
    });

    await expect(
      captureVisibleContextImageBytes(
        {
          sourceUrl: "https://manga.example/page.png",
          tabId: 12,
          windowId: 9
        },
        {
          captureVisibleElementBitmap: async (input) => {
            calls.push("crop");
            expect(input).toMatchObject({
              staleDataUrl: "data:image/png;base64,cHJlLXNjcm9sbA==",
              windowId: 9
            });
            return {
              bytesBase64: "dmlzaWJsZS1pbWFnZQ==",
              mediaType: "image/png",
              name: "page.png"
            };
          },
          captureVisibleTabSnapshot: async (windowId) => {
            calls.push(`snapshot:${windowId}`);
            return "data:image/png;base64,cHJlLXNjcm9sbA==";
          }
        }
      )
    ).resolves.toMatchObject({
      bytesBase64: "dmlzaWJsZS1pbWFnZQ==",
      domId: "hanako-context-img-3",
      domIndex: 3
    });

    expect(calls).toEqual([
      "snapshot:9",
      "message:HANAKO_SCROLL_IMAGE_INTO_VIEW",
      "crop"
    ]);
  });

  it("scrolls the image into view before visible screenshot fallback and warns if it remains partial", async () => {
    const executeScript = vi.fn().mockResolvedValue([]);
    const sendMessage = vi.fn().mockImplementation(async (_tabId, message) => {
      if (message.type !== "HANAKO_SCROLL_IMAGE_INTO_VIEW") {
        throw new Error(`Unexpected message ${message.type}`);
      }

      return {
        ok: true,
        rect: {
          domId: "hanako-context-img-3",
          domIndex: 3,
          fullyVisible: false,
          height: 1200,
          left: 0,
          top: 0,
          viewportHeight: 800,
          viewportWidth: 1000,
          warning:
            "Warning: screenshot fallback could only include the visible portion of the image.",
          width: 700
        }
      };
    });
    vi.stubGlobal("chrome", {
      scripting: { executeScript },
      tabs: { sendMessage }
    });

    await expect(
      captureVisibleContextImageBytes(
        {
          sourceUrl: "https://manga.example/page.png",
          tabId: 12,
          windowId: 9
        },
        {
          captureVisibleElementBitmap: async (input) => {
            expect(input).toEqual({
              rect: {
                domId: "hanako-context-img-3",
                domIndex: 3,
                fullyVisible: false,
                height: 1200,
                left: 0,
                top: 0,
                viewportHeight: 800,
                viewportWidth: 1000,
                warning:
                  "Warning: screenshot fallback could only include the visible portion of the image.",
                width: 700
              },
              sourceUrl: "https://manga.example/page.png",
              windowId: 9
            });
            return {
              bytesBase64: "dmlzaWJsZS1wb3J0aW9u",
              mediaType: "image/png",
              name: "page.png"
            };
          }
        }
      )
    ).resolves.toEqual({
      bytesBase64: "dmlzaWJsZS1wb3J0aW9u",
      domId: "hanako-context-img-3",
      domIndex: 3,
      mediaType: "image/png",
      name: "page.png",
      warning:
        "Warning: screenshot fallback could only include the visible portion of the image."
    });

    expect(sendMessage).toHaveBeenCalledWith(12, {
      sourceUrl: "https://manga.example/page.png",
      type: "HANAKO_SCROLL_IMAGE_INTO_VIEW"
    });
  });
});
