import { describe, expect, it } from "vitest";

import {
  addQueuedImage,
  clearQueuedImages,
  getQueuedImageCount,
  listQueuedImages,
  type QueueStorageArea
} from "../src/background/queue-state.js";

describe("queue state", () => {
  it("stores queued images in insertion order", async () => {
    const storage = createMemoryStorage();

    await addQueuedImage(storage, {
      bytesBase64: "page-1",
      height: 1200,
      mediaType: "image/png",
      pageUrl: "https://manga.example/chapter",
      sourceUrl: "https://manga.example/1.png",
      width: 800
    });
    await addQueuedImage(storage, {
      bytesBase64: "page-2",
      height: 1200,
      mediaType: "image/png",
      pageUrl: "https://manga.example/chapter",
      sourceUrl: "https://manga.example/2.png",
      width: 800
    });

    expect(await getQueuedImageCount(storage)).toBe(2);
    expect(
      (await listQueuedImages(storage)).map((item) => item.sourceUrl)
    ).toEqual(["https://manga.example/1.png", "https://manga.example/2.png"]);
  });

  it("clears queued images", async () => {
    const storage = createMemoryStorage();
    await addQueuedImage(storage, {
      bytesBase64: "page-1",
      mediaType: "image/png",
      sourceUrl: "https://manga.example/1.png"
    });

    await clearQueuedImages(storage);

    expect(await getQueuedImageCount(storage)).toBe(0);
    expect(await listQueuedImages(storage)).toEqual([]);
  });

  it("keeps an exact cached duplicate from being queued twice", async () => {
    const storage = createMemoryStorage();

    await addQueuedImage(storage, {
      bytesBase64: "page-1",
      cacheKey: "cache-key-1",
      mediaType: "image/png",
      sourceUrl: "https://manga.example/1.png"
    });
    await addQueuedImage(storage, {
      bytesBase64: "page-1",
      cacheKey: "cache-key-1",
      mediaType: "image/png",
      sourceUrl: "https://manga.example/1.png"
    });

    expect(await getQueuedImageCount(storage)).toBe(1);
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
