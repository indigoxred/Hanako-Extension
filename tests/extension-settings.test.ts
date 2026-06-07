import { describe, expect, it } from "vitest";

import {
  isValidHanakoBaseUrl,
  loadExtensionSettings,
  saveExtensionSettings,
  validateHanakoBaseUrl,
  type ExtensionStorageArea
} from "../src/options/extension-settings.js";

describe("extension settings", () => {
  it("loads defaults and persists configured settings", async () => {
    const storage = createMemoryStorage();

    await expect(loadExtensionSettings(storage)).resolves.toEqual({
      hanakoBaseUrl: "http://localhost:8787",
      queueContextMenusEnabled: true,
      targetLanguage: "en"
    });

    await saveExtensionSettings(storage, {
      hanakoBaseUrl: "http://tower.local:8787",
      queueContextMenusEnabled: false,
      targetLanguage: "ja"
    });

    await expect(loadExtensionSettings(storage)).resolves.toEqual({
      hanakoBaseUrl: "http://tower.local:8787",
      queueContextMenusEnabled: false,
      targetLanguage: "ja"
    });
  });

  it("validates Hanako base URLs with an explicit port", () => {
    expect(validateHanakoBaseUrl("http://localhost:8787")).toEqual({
      ok: true,
      value: "http://localhost:8787"
    });
    expect(validateHanakoBaseUrl("http://192.168.50.138:8787/")).toEqual({
      ok: true,
      value: "http://192.168.50.138:8787"
    });
    expect(validateHanakoBaseUrl("http://tower.local:8787")).toEqual({
      ok: true,
      value: "http://tower.local:8787"
    });
    expect(isValidHanakoBaseUrl("http://192.168.50.138")).toBe(false);
    expect(isValidHanakoBaseUrl("localhost:8787")).toBe(false);
    expect(isValidHanakoBaseUrl("not a url")).toBe(false);
  });

  it("does not overwrite saved settings with an invalid Hanako base URL", async () => {
    const storage = createMemoryStorage();
    await saveExtensionSettings(storage, {
      hanakoBaseUrl: "http://192.168.50.138:8787",
      queueContextMenusEnabled: false,
      targetLanguage: "ja"
    });

    await expect(
      saveExtensionSettings(storage, {
        hanakoBaseUrl: "http://192.168.50.138",
        queueContextMenusEnabled: true,
        targetLanguage: "ko"
      })
    ).rejects.toThrow("Hanako base URL must include http(s), host, and port");

    await expect(loadExtensionSettings(storage)).resolves.toEqual({
      hanakoBaseUrl: "http://192.168.50.138:8787",
      queueContextMenusEnabled: false,
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
