import { describe, expect, it } from "vitest";

import { createTranslationCacheKey } from "../src/background/translation-cache.js";

describe("translation cache", () => {
  it("keys by bytes, target language, and base URL", async () => {
    await expect(
      createTranslationCacheKey({
        baseUrl: "http://localhost:8787",
        bytesBase64: "abc",
        targetLanguage: "en"
      })
    ).resolves.toContain("http://localhost:8787:en:");
  });
});
