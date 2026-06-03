export interface ExtensionSettings {
  hanakoBaseUrl: string;
  targetLanguage: string;
}

export interface ExtensionStorageArea {
  get(
    keys: string[] | Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const DEFAULT_EXTENSION_SETTINGS = {
  hanakoBaseUrl: "http://localhost:8787",
  targetLanguage: "en"
} satisfies ExtensionSettings;

export async function loadExtensionSettings(
  storage = getDefaultStorage()
): Promise<ExtensionSettings> {
  const stored = await storage.get(DEFAULT_EXTENSION_SETTINGS);

  return {
    hanakoBaseUrl: stringOrDefault(
      stored.hanakoBaseUrl,
      DEFAULT_EXTENSION_SETTINGS.hanakoBaseUrl
    ),
    targetLanguage: stringOrDefault(
      stored.targetLanguage,
      DEFAULT_EXTENSION_SETTINGS.targetLanguage
    )
  };
}

export async function saveExtensionSettings(
  storage: ExtensionStorageArea,
  settings: ExtensionSettings
): Promise<void> {
  await storage.set({
    hanakoBaseUrl:
      settings.hanakoBaseUrl.trim() || DEFAULT_EXTENSION_SETTINGS.hanakoBaseUrl,
    targetLanguage:
      settings.targetLanguage.trim() ||
      DEFAULT_EXTENSION_SETTINGS.targetLanguage
  });
}

export function getDefaultStorage(): ExtensionStorageArea {
  return chrome.storage.sync ?? chrome.storage.local;
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}
