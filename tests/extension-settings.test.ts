import { describe, expect, it } from "vitest";

import {
  loadExtensionSettings,
  saveExtensionSettings,
  type ExtensionStorageArea
} from "../src/options/extension-settings.js";

describe("extension settings", () => {
  it("loads defaults and persists configured settings", async () => {
    const storage = createMemoryStorage();

    await expect(loadExtensionSettings(storage)).resolves.toEqual({
      hanakoBaseUrl: "http://localhost:8787",
      targetLanguage: "en"
    });

    await saveExtensionSettings(storage, {
      hanakoBaseUrl: "http://tower.local:8787",
      targetLanguage: "ja"
    });

    await expect(loadExtensionSettings(storage)).resolves.toEqual({
      hanakoBaseUrl: "http://tower.local:8787",
      targetLanguage: "ja"
    });
  });
});

function createMemoryStorage(): ExtensionStorageArea {
  const data = new Map<string, unknown>();

  return {
    async get(keys) {
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, data.get(key)]));
      }

      return Object.fromEntries(
        Object.keys(keys).map((key) => [key, data.get(key) ?? keys[key]])
      );
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value);
      }
    }
  };
}
