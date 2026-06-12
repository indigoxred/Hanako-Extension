export interface ExtensionSettings {
  autoGlossaryStorageScopeId: string | null;
  glossaryScopeIds: string[];
  hanakoBaseUrl: string;
  queueContextMenusEnabled?: boolean;
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

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  autoGlossaryStorageScopeId: null,
  glossaryScopeIds: [],
  hanakoBaseUrl: "http://localhost:8787",
  queueContextMenusEnabled: true,
  targetLanguage: "en"
};

export async function loadExtensionSettings(
  storage = getDefaultStorage()
): Promise<ExtensionSettings> {
  const stored = await storage.get({ ...DEFAULT_EXTENSION_SETTINGS });

  return {
    autoGlossaryStorageScopeId: stringOrNull(
      stored.autoGlossaryStorageScopeId
    ),
    glossaryScopeIds: arrayOfStrings(stored.glossaryScopeIds),
    hanakoBaseUrl: stringOrDefault(
      stored.hanakoBaseUrl,
      DEFAULT_EXTENSION_SETTINGS.hanakoBaseUrl
    ),
    queueContextMenusEnabled: booleanOrDefault(
      stored.queueContextMenusEnabled,
      DEFAULT_EXTENSION_SETTINGS.queueContextMenusEnabled ?? true
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
    autoGlossaryStorageScopeId: stringOrNull(
      settings.autoGlossaryStorageScopeId
    ),
    glossaryScopeIds: arrayOfStrings(settings.glossaryScopeIds),
    hanakoBaseUrl: validated.value,
    queueContextMenusEnabled: settings.queueContextMenusEnabled !== false,
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

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.flatMap((item) => stringOrNull(item) ?? []))];
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
