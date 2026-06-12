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
      autoGlossaryStorageScopeId: null,
      glossaryScopeIds: [],
      hanakoBaseUrl: "http://localhost:8787",
      queueContextMenusEnabled: true,
      targetLanguage: "en"
    });

    await saveExtensionSettings(storage, {
      autoGlossaryStorageScopeId: " scope_new ",
      glossaryScopeIds: [" scope_1 ", "", "scope_1", "scope_2"],
      hanakoBaseUrl: "http://tower.local:8787",
      queueContextMenusEnabled: false,
      targetLanguage: "ja"
    });

    await expect(loadExtensionSettings(storage)).resolves.toEqual({
      autoGlossaryStorageScopeId: "scope_new",
      glossaryScopeIds: ["scope_1", "scope_2"],
      hanakoBaseUrl: "http://tower.local:8787",
      queueContextMenusEnabled: false,
      targetLanguage: "ja"
    });
  });

  it("loads invalid glossary settings as disabled defaults", async () => {
    const storage = createMemoryStorage();
    await storage.set({
      autoGlossaryStorageScopeId: " ",
      glossaryScopeIds: ["", 3, " scope_1 ", "scope_1", "scope_2"]
    });

    await expect(loadExtensionSettings(storage)).resolves.toMatchObject({
      autoGlossaryStorageScopeId: null,
      glossaryScopeIds: ["scope_1", "scope_2"]
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
      autoGlossaryStorageScopeId: null,
      glossaryScopeIds: [],
      hanakoBaseUrl: "http://192.168.50.138:8787",
      queueContextMenusEnabled: false,
      targetLanguage: "ja"
    });

    await expect(
      saveExtensionSettings(storage, {
        autoGlossaryStorageScopeId: "scope_new",
        glossaryScopeIds: ["scope_1"],
        hanakoBaseUrl: "http://192.168.50.138",
        queueContextMenusEnabled: true,
        targetLanguage: "ko"
      })
    ).rejects.toThrow("Hanako base URL must include http(s), host, and port");

    await expect(loadExtensionSettings(storage)).resolves.toEqual({
      autoGlossaryStorageScopeId: null,
      glossaryScopeIds: [],
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
