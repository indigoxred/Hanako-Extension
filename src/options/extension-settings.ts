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

export interface HanakoBaseUrlValidationResult {
  error?: string;
  ok: boolean;
  value?: string;
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
  const validated = validateHanakoBaseUrl(settings.hanakoBaseUrl);

  if (!validated.ok || !validated.value) {
    throw new Error(validated.error);
  }

  await storage.set({
    hanakoBaseUrl: validated.value,
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

export function isValidHanakoBaseUrl(value: string): boolean {
  return validateHanakoBaseUrl(value).ok;
}

export function validateHanakoBaseUrl(
  value: string
): HanakoBaseUrlValidationResult {
  try {
    const url = new URL(value.trim());

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      !url.port
    ) {
      return {
        error: "Hanako base URL must include http(s), host, and port",
        ok: false
      };
    }

    url.pathname = "";
    url.search = "";
    url.hash = "";

    return { ok: true, value: url.toString().replace(/\/$/, "") };
  } catch {
    return {
      error: "Hanako base URL must include http(s), host, and port",
      ok: false
    };
  }
}
