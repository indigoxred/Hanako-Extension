import { describe, expect, it } from "vitest";

import {
  queueContextMenuImage,
  sendQueuedImages
} from "../src/background/queue-flow.js";
import {
  getQueuedImageCount,
  type QueueStorageArea
} from "../src/background/queue-state.js";

describe("queue flow", () => {
  it("captures the clicked image into the local queue", async () => {
    const storage = createMemoryStorage();
    const result = await queueContextMenuImage({
      captureImageBytes: async () => ({
        bytesBase64: "page-1",
        height: 1200,
        mediaType: "image/png",
        width: 800
      }),
      context: {
        pageUrl: "https://manga.example/chapter",
        srcUrl: "https://manga.example/page-1.png",
        tabId: 5
      },
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      storage
    });

    expect(result).toMatchObject({ count: 1, ok: true });
  });

  it("falls back to background source fetch when queue image canvas extraction fails", async () => {
    const storage = createMemoryStorage();
    const fetchedImages: unknown[] = [];
    const result = await queueContextMenuImage({
      captureImageBytes: async () => undefined,
      context: {
        pageUrl: "https://x.com/WwQel/status/2063186089964408919/photo/1",
        srcUrl: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg",
        tabId: 5
      },
      fetchImageBytes: async (image) => {
        fetchedImages.push(image);
        return {
          bytesBase64: "full-image",
          mediaType: "image/jpeg"
        };
      },
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      storage
    });

    expect(result).toMatchObject({ count: 1, ok: true });
    expect(fetchedImages).toEqual([
      {
        pageUrl: "https://x.com/WwQel/status/2063186089964408919/photo/1",
        url: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg"
      }
    ]);
    expect(await getQueuedImageCount(storage)).toBe(1);
  });

  it("falls back to inactive image-tab capture before queueing an uncooperative image", async () => {
    const storage = createMemoryStorage();
    const fallbackCalls: string[] = [];
    const result = await queueContextMenuImage({
      captureImageBytes: async () => undefined,
      captureImageBytesInNewTab: async (input) => {
        fallbackCalls.push(`image-tab:${input.sourceUrl}`);
        return {
          bytesBase64: "pixiv-full-image",
          mediaType: "image/jpeg",
          name: "pixiv-page.jpg"
        };
      },
      captureVisibleImageBytes: async () => {
        fallbackCalls.push("visible-screenshot");
        return undefined;
      },
      context: {
        pageUrl: "https://www.pixiv.net/artworks/123",
        srcUrl: "https://i.pximg.net/img-original/img/2026/06/07/page.jpg",
        tabId: 5,
        windowId: 9
      },
      fetchImageBytes: async () => undefined,
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      storage
    });

    expect(result).toMatchObject({ count: 1, ok: true });
    expect(fallbackCalls).toEqual([
      "image-tab:https://i.pximg.net/img-original/img/2026/06/07/page.jpg"
    ]);
    expect(await getQueuedImageCount(storage)).toBe(1);
  });

  it("uses visible screenshot capture as the last queue fallback", async () => {
    const storage = createMemoryStorage();
    const fallbackCalls: string[] = [];
    const result = await queueContextMenuImage({
      captureImageBytes: async () => undefined,
      captureImageBytesInNewTab: async () => {
        fallbackCalls.push("image-tab");
        return undefined;
      },
      captureVisibleImageBytes: async (input) => {
        fallbackCalls.push(`visible:${input.sourceUrl}:${input.windowId}`);
        return {
          bytesBase64: "visible-crop",
          domId: "hanako-context-img-2",
          domIndex: 2,
          mediaType: "image/png",
          name: "visible-page.png"
        };
      },
      context: {
        pageUrl: "https://www.pixiv.net/artworks/123",
        srcUrl: "https://i.pximg.net/img-original/img/2026/06/07/page.jpg",
        tabId: 5,
        windowId: 9
      },
      fetchImageBytes: async () => undefined,
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      storage
    });

    expect(result).toMatchObject({ count: 1, ok: true });
    expect(fallbackCalls).toEqual([
      "image-tab",
      "visible:https://i.pximg.net/img-original/img/2026/06/07/page.jpg:9"
    ]);
    expect(await getQueuedImageCount(storage)).toBe(1);
  });

  it("sends queued images as one Hanako page project and clears queue on success", async () => {
    const storage = createMemoryStorage();
    await queueContextMenuImage({
      captureImageBytes: async () => ({
        bytesBase64: "page-1",
        mediaType: "image/png"
      }),
      context: { srcUrl: "https://manga.example/1.png", tabId: 5 },
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      storage
    });
    await queueContextMenuImage({
      captureImageBytes: async () => ({
        bytesBase64: "page-2",
        mediaType: "image/png"
      }),
      context: { srcUrl: "https://manga.example/2.png", tabId: 5 },
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      storage
    });

    const result = await sendQueuedImages({
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      storage,
      translatePage: async (input) => {
        expect(input).toMatchObject({
          baseUrl: "http://localhost:8787",
          mode: "auto",
          targetLanguage: "en"
        });
        expect(input.images.map((image) => image.bytesBase64)).toEqual([
          "page-1",
          "page-2"
        ]);
        return { job: { id: "job_queue" } };
      }
    });

    expect(result).toEqual({
      imageCount: 2,
      jobId: "job_queue",
      jobUrl: "http://localhost:8787/jobs/job_queue",
      ok: true,
      status: "submitted"
    });
    expect(await getQueuedImageCount(storage)).toBe(0);
  });
});

function createMemoryStorage(): QueueStorageArea {
  const data = new Map<string, unknown>();

  return {
    async get(keys) {
      const keyList = Array.isArray(keys) ? keys : Object.keys(keys);

      return Object.fromEntries(
        keyList.map((key) => [
          key,
          data.get(key) ?? (!Array.isArray(keys) ? keys[key] : undefined)
        ])
      );
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value);
      }
    }
  };
}
