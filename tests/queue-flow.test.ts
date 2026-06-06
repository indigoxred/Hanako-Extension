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
