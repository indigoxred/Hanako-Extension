# Hanako-Extension Queue Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ichigo-inspired extension orchestration to Hanako-Extension, including explicit single-image translation, queued multi-image Hanako projects, visible status, restore controls, and guarded settings saves.

**Architecture:** Keep Hanako as the translation/rendering source of truth. The extension will add background orchestration modules for queue state, action status, and job management, then route popup/context-menu actions through those modules. The existing capture/send/replace flows remain the base implementation for single-image and active-tab translation.

**Tech Stack:** Chrome Manifest V3, TypeScript, React popup/options, Vite, Vitest, happy-dom, existing Hanako extension REST endpoints.

---

## File Structure

- Create `src/background/action-status.ts`: action badge/status helper with testable dependency injection around `chrome.action`.
- Create `src/background/job-state.ts`: typed storage helpers for latest job/status per tab.
- Create `src/background/queue-state.ts`: typed storage helpers for queued image items, count, clear, and ordered reads.
- Create `src/background/queue-flow.ts`: right-click image capture into queue and queue submission as one Hanako page job.
- Create `src/background/job-manager.ts`: high-level orchestration for duplicate protection, status transitions, queue send, and badge updates.
- Modify `src/background/context-menu.ts`: create exactly the image context actions `Translate with Hanako` and `Queue to Hanako`, plus `Send queue` as a child of `Queue to Hanako`.
- Modify `src/background/service-worker.ts`: dispatch context menu and popup messages through the job manager.
- Modify `src/content/dom-replacer.ts`: add clear/restore behavior for replaced images and picture sources.
- Modify `src/content/content-entry.ts`: handle `HANAKO_CLEAR_TRANSLATIONS` and stop stale mutation reapply after clearing.
- Modify `src/options/extension-settings.ts`: validate Hanako base URL before saving.
- Modify `src/options/Options.tsx`: show validation failures without overwriting valid saved settings.
- Modify `src/popup/popup-actions.ts`: add clear, queue status, send queue, clear queue, and current job messages.
- Modify `src/popup/Popup.tsx`: show queue count, current job/status, send/clear queue controls, and clear translations control.
- Modify `src/manifest.ts`: keep current permissions unless implementation proves another permission is required.
- Add/update tests under `tests/*.test.ts` for each new behavior.
- Update `README.md` with context-menu behavior, queue workflow, and URL validation.

## Task 1: Guard Hanako Base URL Saves

**Files:**

- Modify: `src/options/extension-settings.ts`
- Modify: `src/options/Options.tsx`
- Test: `tests/extension-settings.test.ts`

- [ ] **Step 1: Write failing URL validation tests**

Add these cases to `tests/extension-settings.test.ts`:

```ts
import {
  DEFAULT_EXTENSION_SETTINGS,
  isValidHanakoBaseUrl,
  loadExtensionSettings,
  saveExtensionSettings,
  validateHanakoBaseUrl,
  type ExtensionStorageArea
} from "../src/options/extension-settings.js";

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
    targetLanguage: "ja"
  });

  await expect(
    saveExtensionSettings(storage, {
      hanakoBaseUrl: "http://192.168.50.138",
      targetLanguage: "ko"
    })
  ).rejects.toThrow("Hanako base URL must include http(s), host, and port");

  await expect(loadExtensionSettings(storage)).resolves.toEqual({
    hanakoBaseUrl: "http://192.168.50.138:8787",
    targetLanguage: "ja"
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test tests/extension-settings.test.ts`

Expected: FAIL because `validateHanakoBaseUrl` and `isValidHanakoBaseUrl` are not exported yet.

- [ ] **Step 3: Implement URL validation**

Update `src/options/extension-settings.ts`:

```ts
export interface HanakoBaseUrlValidationResult {
  ok: boolean;
  error?: string;
  value?: string;
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
```

- [ ] **Step 4: Wire validation into the options UI**

Update `src/options/Options.tsx` so save failures show a message and do not overwrite settings:

```tsx
const [message, setMessage] = useState("");

void saveExtensionSettings(getDefaultStorage(), settings)
  .then(() => setMessage("Saved"))
  .catch((error: unknown) => {
    setMessage(
      error instanceof Error ? error.message : "Settings were not saved"
    );
  });
```

Render the message near the Save button:

```tsx
{
  message ? <p role="status">{message}</p> : null;
}
```

- [ ] **Step 5: Verify Task 1**

Run:

```bash
pnpm test tests/extension-settings.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 2: Add Queue State Storage

**Files:**

- Create: `src/background/queue-state.ts`
- Test: `tests/queue-state.test.ts`

- [ ] **Step 1: Write failing queue state tests**

Create `tests/queue-state.test.ts`:

```ts
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
      mediaType: "image/png",
      pageUrl: "https://manga.example/chapter",
      sourceUrl: "https://manga.example/1.png",
      width: 800,
      height: 1200
    });
    await addQueuedImage(storage, {
      bytesBase64: "page-2",
      mediaType: "image/png",
      pageUrl: "https://manga.example/chapter",
      sourceUrl: "https://manga.example/2.png",
      width: 800,
      height: 1200
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
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    }
  };
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test tests/queue-state.test.ts`

Expected: FAIL because `src/background/queue-state.ts` does not exist.

- [ ] **Step 3: Implement queue state**

Create `src/background/queue-state.ts`:

```ts
export interface QueuedImageInput {
  bytesBase64: string;
  mediaType: string;
  pageUrl?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  domIndex?: number;
  domId?: string;
}

export interface QueuedImage extends QueuedImageInput {
  id: string;
  queuedAt: string;
}

export interface QueueStorageArea {
  get(
    keys: string[] | Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const QUEUE_STORAGE_KEY = "hanakoQueuedImages";
export const MAX_QUEUE_ITEMS = 100;

export async function addQueuedImage(
  storage: QueueStorageArea = getDefaultQueueStorage(),
  input: QueuedImageInput
): Promise<{ count: number; item: QueuedImage }> {
  const items = await listQueuedImages(storage);
  if (items.length >= MAX_QUEUE_ITEMS) {
    throw new Error(`Hanako queue is limited to ${MAX_QUEUE_ITEMS} images`);
  }

  const item: QueuedImage = {
    ...input,
    id: createQueueItemId(),
    queuedAt: new Date().toISOString()
  };
  const next = [...items, item];
  await storage.set({ [QUEUE_STORAGE_KEY]: next });
  return { count: next.length, item };
}

export async function listQueuedImages(
  storage: QueueStorageArea = getDefaultQueueStorage()
): Promise<QueuedImage[]> {
  const stored = await storage.get({ [QUEUE_STORAGE_KEY]: [] });
  return Array.isArray(stored[QUEUE_STORAGE_KEY])
    ? (stored[QUEUE_STORAGE_KEY] as QueuedImage[])
    : [];
}

export async function getQueuedImageCount(
  storage: QueueStorageArea = getDefaultQueueStorage()
): Promise<number> {
  return (await listQueuedImages(storage)).length;
}

export async function clearQueuedImages(
  storage: QueueStorageArea = getDefaultQueueStorage()
): Promise<void> {
  await storage.set({ [QUEUE_STORAGE_KEY]: [] });
}

export function getDefaultQueueStorage(): QueueStorageArea {
  return chrome.storage.local;
}

function createQueueItemId(): string {
  return `queue_${crypto.randomUUID()}`;
}
```

- [ ] **Step 4: Verify Task 2**

Run:

```bash
pnpm test tests/queue-state.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 3: Add Action Badge Status Helpers

**Files:**

- Create: `src/background/action-status.ts`
- Test: `tests/action-status.test.ts`

- [ ] **Step 1: Write failing action status tests**

Create `tests/action-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  setActionStatus,
  updateQueueBadge
} from "../src/background/action-status.js";

describe("action status", () => {
  it("shows queued image count on the action badge", async () => {
    const calls: unknown[] = [];
    const action = createActionRecorder(calls);

    await updateQueueBadge(action, 3);

    expect(calls).toEqual([
      ["setBadgeText", { text: "3" }],
      ["setBadgeBackgroundColor", { color: "#2563eb" }]
    ]);
  });

  it("shows running and error states", async () => {
    const calls: unknown[] = [];
    const action = createActionRecorder(calls);

    await setActionStatus(action, "running");
    await setActionStatus(action, "error");

    expect(calls).toEqual([
      ["setBadgeText", { text: "..." }],
      ["setBadgeBackgroundColor", { color: "#7c3aed" }],
      ["setBadgeText", { text: "!" }],
      ["setBadgeBackgroundColor", { color: "#dc2626" }]
    ]);
  });
});

function createActionRecorder(calls: unknown[]) {
  return {
    async setBadgeBackgroundColor(
      input: chrome.action.BadgeBackgroundColorDetails
    ) {
      calls.push(["setBadgeBackgroundColor", input]);
    },
    async setBadgeText(input: chrome.action.BadgeTextDetails) {
      calls.push(["setBadgeText", input]);
    }
  };
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test tests/action-status.test.ts`

Expected: FAIL because `action-status.ts` does not exist.

- [ ] **Step 3: Implement action status helpers**

Create `src/background/action-status.ts`:

```ts
export type ActionStatus = "idle" | "running" | "success" | "error";

export interface ActionApi {
  setBadgeText(input: chrome.action.BadgeTextDetails): Promise<void> | void;
  setBadgeBackgroundColor(
    input: chrome.action.BadgeBackgroundColorDetails
  ): Promise<void> | void;
}

export async function setActionStatus(
  action: ActionApi = chrome.action,
  status: ActionStatus
): Promise<void> {
  const details = {
    idle: { text: "", color: "#64748b" },
    running: { text: "...", color: "#7c3aed" },
    success: { text: "OK", color: "#16a34a" },
    error: { text: "!", color: "#dc2626" }
  } satisfies Record<ActionStatus, { text: string; color: string }>;
  await action.setBadgeText({ text: details[status].text });
  await action.setBadgeBackgroundColor({ color: details[status].color });
}

export async function updateQueueBadge(
  action: ActionApi = chrome.action,
  count: number
): Promise<void> {
  if (count <= 0) {
    await setActionStatus(action, "idle");
    return;
  }
  await action.setBadgeText({ text: String(count) });
  await action.setBadgeBackgroundColor({ color: "#2563eb" });
}
```

- [ ] **Step 4: Verify Task 3**

Run:

```bash
pnpm test tests/action-status.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 4: Implement Context Menu Shape

**Files:**

- Modify: `src/background/context-menu.ts`
- Test: `tests/context-menu.test.ts`

- [ ] **Step 1: Write failing context menu tests**

Create `tests/context-menu.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  QUEUE_IMAGE_MENU_ID,
  SEND_QUEUE_MENU_ID,
  TRANSLATE_IMAGE_MENU_ID,
  createContextMenu,
  updateQueueMenuTitle
} from "../src/background/context-menu.js";

describe("context menus", () => {
  it("creates translate, queue, and send queue image menu items", () => {
    const created: unknown[] = [];
    createContextMenu({
      contextMenus: {
        create(input: chrome.contextMenus.CreateProperties) {
          created.push(input);
        }
      }
    } as Pick<typeof chrome, "contextMenus">);

    expect(created).toEqual([
      {
        contexts: ["image"],
        id: TRANSLATE_IMAGE_MENU_ID,
        title: "Translate with Hanako"
      },
      {
        contexts: ["image"],
        id: QUEUE_IMAGE_MENU_ID,
        title: "Queue to Hanako"
      },
      {
        contexts: ["image"],
        id: SEND_QUEUE_MENU_ID,
        parentId: QUEUE_IMAGE_MENU_ID,
        title: "Send queue"
      }
    ]);
  });

  it("updates the queue menu title with the current count", async () => {
    const updates: unknown[] = [];
    await updateQueueMenuTitle(
      {
        contextMenus: {
          async update(
            id: string | number,
            input: chrome.contextMenus.UpdateProperties
          ) {
            updates.push([id, input]);
          }
        }
      } as Pick<typeof chrome, "contextMenus">,
      2
    );

    expect(updates).toEqual([
      [QUEUE_IMAGE_MENU_ID, { title: "Queue to Hanako (2)" }]
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test tests/context-menu.test.ts`

Expected: FAIL because queue IDs and updater do not exist yet.

- [ ] **Step 3: Implement context menus**

Update `src/background/context-menu.ts`:

```ts
export const TRANSLATE_IMAGE_MENU_ID = "hanako-translate-image";
export const QUEUE_IMAGE_MENU_ID = "hanako-queue-image";
export const SEND_QUEUE_MENU_ID = "hanako-send-queue";

export function createContextMenu(
  chromeApi: Pick<typeof chrome, "contextMenus">
) {
  chromeApi.contextMenus.create({
    contexts: ["image"],
    id: TRANSLATE_IMAGE_MENU_ID,
    title: "Translate with Hanako"
  });
  chromeApi.contextMenus.create({
    contexts: ["image"],
    id: QUEUE_IMAGE_MENU_ID,
    title: "Queue to Hanako"
  });
  chromeApi.contextMenus.create({
    contexts: ["image"],
    id: SEND_QUEUE_MENU_ID,
    parentId: QUEUE_IMAGE_MENU_ID,
    title: "Send queue"
  });
}

export async function updateQueueMenuTitle(
  chromeApi: Pick<typeof chrome, "contextMenus">,
  count: number
): Promise<void> {
  const title = count > 0 ? `Queue to Hanako (${count})` : "Queue to Hanako";
  await chromeApi.contextMenus.update(QUEUE_IMAGE_MENU_ID, { title });
}
```

- [ ] **Step 4: Verify Task 4**

Run:

```bash
pnpm test tests/context-menu.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 5: Add Queue Flow

**Files:**

- Create: `src/background/queue-flow.ts`
- Test: `tests/queue-flow.test.ts`

- [ ] **Step 1: Write failing queue flow tests**

Create `tests/queue-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  queueContextMenuImage,
  sendQueuedImages
} from "../src/background/queue-flow.js";
import type { QueueStorageArea } from "../src/background/queue-state.js";

describe("queue flow", () => {
  it("captures the clicked image into the local queue", async () => {
    const storage = createMemoryStorage();
    const result = await queueContextMenuImage({
      captureImageBytes: async () => ({
        bytesBase64: "page-1",
        mediaType: "image/png",
        width: 800,
        height: 1200
      }),
      context: {
        pageUrl: "https://manga.example/chapter",
        srcUrl: "https://manga.example/page-1.png",
        tabId: 5
      },
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
      storage
    });
    await queueContextMenuImage({
      captureImageBytes: async () => ({
        bytesBase64: "page-2",
        mediaType: "image/png"
      }),
      context: { srcUrl: "https://manga.example/2.png", tabId: 5 },
      storage
    });

    const result = await sendQueuedImages({
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      storage,
      translatePage: async (input) => {
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
      ok: true,
      status: "submitted"
    });
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
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    }
  };
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test tests/queue-flow.test.ts`

Expected: FAIL because `queue-flow.ts` does not exist.

- [ ] **Step 3: Implement queue flow**

Create `src/background/queue-flow.ts`:

```ts
import {
  translatePage as defaultTranslatePage,
  type TranslatePageInput
} from "./hanako-client.js";
import {
  type CaptureContextImageInput,
  type ContextMenuImageContext
} from "./context-menu-flow.js";
import {
  addQueuedImage,
  clearQueuedImages,
  listQueuedImages,
  type QueueStorageArea
} from "./queue-state.js";
import { loadExtensionSettings } from "../options/extension-settings.js";

import type { ImageBytesPayload } from "./image-bytes.js";
import type { ExtensionSettings } from "../options/extension-settings.js";

export type QueueImageResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export type SendQueueResult =
  | { ok: true; imageCount: number; jobId: string; status: "submitted" }
  | { ok: false; error: string };

export interface QueueContextMenuImageInput {
  captureImageBytes: (
    input: CaptureContextImageInput
  ) => Promise<ImageBytesPayload | undefined>;
  context: ContextMenuImageContext;
  storage?: QueueStorageArea;
}

export interface SendQueuedImagesInput {
  loadSettings?: () => Promise<ExtensionSettings>;
  storage?: QueueStorageArea;
  translatePage?: (
    input: TranslatePageInput
  ) => Promise<{ job: { id: string } }>;
}

export async function queueContextMenuImage({
  captureImageBytes,
  context,
  storage
}: QueueContextMenuImageInput): Promise<QueueImageResult> {
  if (!context.srcUrl)
    return { error: "No clicked image URL was available", ok: false };
  if (!context.tabId)
    return { error: "No source tab was available", ok: false };

  const captured = await captureImageBytes({
    ...(context.pageUrl ? { pageUrl: context.pageUrl } : {}),
    sourceUrl: context.srcUrl,
    tabId: context.tabId,
    ...(context.windowId === undefined ? {} : { windowId: context.windowId })
  }).catch(() => undefined);

  if (!captured?.bytesBase64 || !captured.mediaType) {
    return {
      error: "The extension could not extract bytes for this image",
      ok: false
    };
  }

  const queued = await addQueuedImage(storage, {
    ...captured,
    ...(context.pageUrl ? { pageUrl: context.pageUrl } : {}),
    sourceUrl: context.srcUrl
  });
  return { count: queued.count, ok: true };
}

export async function sendQueuedImages({
  loadSettings = loadExtensionSettings,
  storage,
  translatePage = defaultTranslatePage
}: SendQueuedImagesInput = {}): Promise<SendQueueResult> {
  const queued = await listQueuedImages(storage);
  if (queued.length === 0) {
    return { error: "Hanako queue is empty", ok: false };
  }

  const settings = await loadSettings();
  const detail = await translatePage({
    baseUrl: settings.hanakoBaseUrl,
    images: queued.map((item) => ({
      bytesBase64: item.bytesBase64,
      mediaType: item.mediaType,
      ...(item.pageUrl ? { pageUrl: item.pageUrl } : {}),
      ...(item.sourceUrl ? { url: item.sourceUrl } : { url: item.id }),
      ...(item.width === undefined ? {} : { width: item.width }),
      ...(item.height === undefined ? {} : { height: item.height })
    })),
    mode: "review",
    targetLanguage: settings.targetLanguage
  });

  await clearQueuedImages(storage);
  return {
    imageCount: queued.length,
    jobId: detail.job.id,
    ok: true,
    status: "submitted"
  };
}
```

- [ ] **Step 4: Verify Task 5**

Run:

```bash
pnpm test tests/queue-flow.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 6: Add Restore/Clear Translation Flow

**Files:**

- Modify: `src/content/dom-replacer.ts`
- Modify: `src/content/content-entry.ts`
- Test: `tests/dom-replacer.test.ts`

- [ ] **Step 1: Write failing restore tests**

Add to `tests/dom-replacer.test.ts`:

```ts
import {
  clearDetectedImageReplacements,
  reapplyStoredReplacements,
  replaceDetectedImages
} from "../src/content/dom-replacer.js";

it("restores original image sources and picture sources", () => {
  const documentRef = document.implementation.createHTMLDocument();
  documentRef.body.innerHTML = `
    <picture>
      <source srcset="https://manga.example/page-1-large.webp 2x" />
      <img src="https://manga.example/page-1.png" srcset="https://manga.example/page-1-large.png 2x" />
    </picture>
  `;

  replaceDetectedImages(
    [{ domIndex: 0, renderedUrl: "http://localhost:8787/rendered.png" }],
    documentRef
  );

  expect(clearDetectedImageReplacements(documentRef)).toEqual({ restored: 1 });
  const image = documentRef.querySelector("img");
  const source = documentRef.querySelector("source");
  expect(image?.getAttribute("src")).toBe("https://manga.example/page-1.png");
  expect(image?.getAttribute("srcset")).toBe(
    "https://manga.example/page-1-large.png 2x"
  );
  expect(source?.getAttribute("srcset")).toBe(
    "https://manga.example/page-1-large.webp 2x"
  );
  expect(reapplyStoredReplacements(documentRef)).toEqual({ replaced: 0 });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test tests/dom-replacer.test.ts`

Expected: FAIL because `clearDetectedImageReplacements` is not exported.

- [ ] **Step 3: Implement restore function**

Add to `src/content/dom-replacer.ts`:

```ts
export interface ImageRestoreResult {
  restored: number;
}

export function clearDetectedImageReplacements(
  documentRef: Document = document
): ImageRestoreResult {
  let restored = 0;

  for (const image of Array.from(documentRef.querySelectorAll("img"))) {
    if (!image.dataset.hanakoRenderedSrc) continue;

    if (image.dataset.hanakoOriginalSrc) {
      image.src = image.dataset.hanakoOriginalSrc;
    }

    if (image.dataset.hanakoOriginalSrcset) {
      image.setAttribute("srcset", image.dataset.hanakoOriginalSrcset);
    } else {
      image.removeAttribute("srcset");
    }

    restorePictureSources(image);
    delete image.dataset.hanakoOriginalSrc;
    delete image.dataset.hanakoOriginalSrcset;
    delete image.dataset.hanakoRenderedSrc;
    restored += 1;
  }

  return { restored };
}

function restorePictureSources(image: HTMLImageElement): void {
  const picture = image.closest("picture");
  if (!picture) return;

  for (const source of Array.from(picture.querySelectorAll("source"))) {
    if (source.dataset.hanakoOriginalSrcset) {
      source.setAttribute("srcset", source.dataset.hanakoOriginalSrcset);
    }
    delete source.dataset.hanakoOriginalSrcset;
  }
}
```

- [ ] **Step 4: Handle content clear message**

Update `src/content/content-entry.ts`:

```ts
if (isClearTranslationsMessage(message)) {
  replacementObserver?.disconnect();
  replacementObserver = undefined;
  const result = clearDetectedImageReplacements();
  showOverlay(`Restored ${result.restored} images`);
  sendResponse({ ok: true, restored: result.restored });
  return true;
}

function isClearTranslationsMessage(
  message: unknown
): message is { type: "HANAKO_CLEAR_TRANSLATIONS" } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "HANAKO_CLEAR_TRANSLATIONS"
  );
}
```

- [ ] **Step 5: Verify Task 6**

Run:

```bash
pnpm test tests/dom-replacer.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 7: Add Job State And Job Manager

**Files:**

- Create: `src/background/job-state.ts`
- Create: `src/background/job-manager.ts`
- Modify: `src/background/service-worker.ts`
- Test: `tests/job-state.test.ts`
- Test: `tests/job-manager.test.ts`

- [ ] **Step 1: Write failing job state tests**

Create `tests/job-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  clearTabJobState,
  getTabJobState,
  setTabJobState,
  type JobStateStorageArea
} from "../src/background/job-state.js";

describe("job state", () => {
  it("stores and clears the latest tab job state", async () => {
    const storage = createMemoryStorage();

    await setTabJobState(storage, 7, {
      jobId: "job_1",
      message: "Running",
      status: "running"
    });

    expect(await getTabJobState(storage, 7)).toMatchObject({
      jobId: "job_1",
      status: "running"
    });

    await clearTabJobState(storage, 7);
    expect(await getTabJobState(storage, 7)).toBeUndefined();
  });
});

function createMemoryStorage(): JobStateStorageArea {
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
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    }
  };
}
```

- [ ] **Step 2: Implement job state**

Create `src/background/job-state.ts`:

```ts
export type StoredJobStatus =
  | "idle"
  | "queued"
  | "running"
  | "submitted"
  | "completed"
  | "failed"
  | "timeout";

export interface StoredJobState {
  jobId?: string;
  message: string;
  status: StoredJobStatus;
  updatedAt: string;
}

export interface JobStateStorageArea {
  get(
    keys: string[] | Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const JOB_STATE_STORAGE_KEY = "hanakoTabJobState";

export async function getTabJobState(
  storage: JobStateStorageArea = chrome.storage.local,
  tabId: number
): Promise<StoredJobState | undefined> {
  const all = await getAllJobState(storage);
  return all[String(tabId)];
}

export async function setTabJobState(
  storage: JobStateStorageArea = chrome.storage.local,
  tabId: number,
  state: Omit<StoredJobState, "updatedAt"> | StoredJobState
): Promise<StoredJobState> {
  const all = await getAllJobState(storage);
  const next = {
    ...state,
    updatedAt: "updatedAt" in state ? state.updatedAt : new Date().toISOString()
  };
  await storage.set({
    [JOB_STATE_STORAGE_KEY]: { ...all, [String(tabId)]: next }
  });
  return next;
}

export async function clearTabJobState(
  storage: JobStateStorageArea = chrome.storage.local,
  tabId: number
): Promise<void> {
  const all = await getAllJobState(storage);
  delete all[String(tabId)];
  await storage.set({ [JOB_STATE_STORAGE_KEY]: all });
}

async function getAllJobState(
  storage: JobStateStorageArea
): Promise<Record<string, StoredJobState>> {
  const stored = await storage.get({ [JOB_STATE_STORAGE_KEY]: {} });
  return typeof stored[JOB_STATE_STORAGE_KEY] === "object" &&
    stored[JOB_STATE_STORAGE_KEY] !== null
    ? (stored[JOB_STATE_STORAGE_KEY] as Record<string, StoredJobState>)
    : {};
}
```

- [ ] **Step 3: Write failing job manager tests**

Create `tests/job-manager.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createJobManager } from "../src/background/job-manager.js";

describe("job manager", () => {
  it("deduplicates an active tab translation", async () => {
    let calls = 0;
    const manager = createJobManager({
      setActionStatus: async () => undefined,
      translateActiveTab: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
          imageCount: 1,
          jobId: "job_1",
          ok: true,
          replacementCount: 1,
          status: "completed"
        };
      }
    });

    await Promise.all([
      manager.translateActiveTab(),
      manager.translateActiveTab()
    ]);

    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 4: Implement job manager**

Create `src/background/job-manager.ts`:

```ts
import {
  setActionStatus as defaultSetActionStatus,
  updateQueueBadge
} from "./action-status.js";
import { translateContextMenuImage as defaultTranslateContextMenuImage } from "./context-menu-flow.js";
import {
  sendQueuedImages as defaultSendQueuedImages,
  queueContextMenuImage as defaultQueueContextMenuImage
} from "./queue-flow.js";
import { translateActiveTab as defaultTranslateActiveTab } from "./translate-flow.js";

import type {
  ContextMenuImageContext,
  ContextMenuTranslationResult
} from "./context-menu-flow.js";
import type { QueueImageResult, SendQueueResult } from "./queue-flow.js";
import type { TranslateActiveTabResult } from "./translate-flow.js";

export interface JobManagerDependencies {
  queueContextMenuImage?: (input: {
    context: ContextMenuImageContext;
  }) => Promise<QueueImageResult>;
  sendQueuedImages?: () => Promise<SendQueueResult>;
  setActionStatus?: typeof defaultSetActionStatus;
  translateActiveTab?: () => Promise<TranslateActiveTabResult>;
  translateContextMenuImage?: (input: {
    context: ContextMenuImageContext;
  }) => Promise<ContextMenuTranslationResult>;
  updateQueueBadge?: typeof updateQueueBadge;
}

export function createJobManager(dependencies: JobManagerDependencies = {}) {
  const inFlight = new Map<string, Promise<unknown>>();

  async function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = run().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  return {
    translateActiveTab: () =>
      dedupe("active-tab", async () => {
        await (dependencies.setActionStatus ?? defaultSetActionStatus)(
          undefined,
          "running"
        );
        const result = await (
          dependencies.translateActiveTab ?? defaultTranslateActiveTab
        )();
        await (dependencies.setActionStatus ?? defaultSetActionStatus)(
          undefined,
          result.ok ? "success" : "error"
        );
        return result;
      }),
    translateContextMenuImage: (context: ContextMenuImageContext) =>
      dedupe(
        `context:${context.tabId ?? "none"}:${context.srcUrl ?? "none"}`,
        async () => {
          await (dependencies.setActionStatus ?? defaultSetActionStatus)(
            undefined,
            "running"
          );
          const result = await (
            dependencies.translateContextMenuImage ??
            defaultTranslateContextMenuImage
          )({ context });
          await (dependencies.setActionStatus ?? defaultSetActionStatus)(
            undefined,
            result.ok ? "success" : "error"
          );
          return result;
        }
      ),
    queueContextMenuImage: async (context: ContextMenuImageContext) => {
      const result = await (
        dependencies.queueContextMenuImage ??
        ((input) => defaultQueueContextMenuImage(input))
      )({ context });
      if (result.ok) {
        await (dependencies.updateQueueBadge ?? updateQueueBadge)(
          undefined,
          result.count
        );
      }
      return result;
    },
    sendQueuedImages: () =>
      dedupe("send-queue", async () => {
        await (dependencies.setActionStatus ?? defaultSetActionStatus)(
          undefined,
          "running"
        );
        const result = await (
          dependencies.sendQueuedImages ?? defaultSendQueuedImages
        )();
        await (dependencies.setActionStatus ?? defaultSetActionStatus)(
          undefined,
          result.ok ? "success" : "error"
        );
        return result;
      })
  };
}
```

- [ ] **Step 5: Route service worker messages and context menu clicks**

Update `src/background/service-worker.ts` to create one manager and route:

```ts
import {
  QUEUE_IMAGE_MENU_ID,
  SEND_QUEUE_MENU_ID,
  TRANSLATE_IMAGE_MENU_ID,
  createContextMenu
} from "./context-menu.js";
import { createJobManager } from "./job-manager.js";

const jobManager = createJobManager();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const context = {
    ...(info.pageUrl ? { pageUrl: info.pageUrl } : {}),
    ...(info.srcUrl ? { srcUrl: info.srcUrl } : {}),
    ...(tab?.id ? { tabId: tab.id } : {}),
    ...(tab?.windowId === undefined ? {} : { windowId: tab.windowId })
  };

  if (info.menuItemId === TRANSLATE_IMAGE_MENU_ID) {
    void jobManager.translateContextMenuImage(context);
  }
  if (info.menuItemId === QUEUE_IMAGE_MENU_ID) {
    void jobManager.queueContextMenuImage(context);
  }
  if (info.menuItemId === SEND_QUEUE_MENU_ID) {
    void jobManager.sendQueuedImages();
  }
});
```

- [ ] **Step 6: Verify Task 7**

Run:

```bash
pnpm test tests/job-state.test.ts tests/job-manager.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 8: Add Popup Queue And Status Controls

**Files:**

- Modify: `src/popup/popup-actions.ts`
- Modify: `src/popup/Popup.tsx`
- Test: `tests/popup-actions.test.ts`

- [ ] **Step 1: Write failing popup action tests**

Add to `tests/popup-actions.test.ts`:

```ts
import {
  createClearQueueMessage,
  createClearTranslationsMessage,
  createGetQueueStatusMessage,
  createSendQueueMessage
} from "../src/popup/popup-actions.js";

it("builds queue and clear runtime messages", () => {
  expect(createGetQueueStatusMessage()).toEqual({
    type: "HANAKO_GET_QUEUE_STATUS"
  });
  expect(createSendQueueMessage()).toEqual({ type: "HANAKO_SEND_QUEUE" });
  expect(createClearQueueMessage()).toEqual({ type: "HANAKO_CLEAR_QUEUE" });
  expect(createClearTranslationsMessage()).toEqual({
    type: "HANAKO_CLEAR_TRANSLATIONS_ACTIVE_TAB"
  });
});
```

- [ ] **Step 2: Implement popup message helpers**

Add to `src/popup/popup-actions.ts`:

```ts
export interface GetQueueStatusMessage {
  type: "HANAKO_GET_QUEUE_STATUS";
}

export interface SendQueueMessage {
  type: "HANAKO_SEND_QUEUE";
}

export interface ClearQueueMessage {
  type: "HANAKO_CLEAR_QUEUE";
}

export interface ClearTranslationsActiveTabMessage {
  type: "HANAKO_CLEAR_TRANSLATIONS_ACTIVE_TAB";
}

export function createGetQueueStatusMessage(): GetQueueStatusMessage {
  return { type: "HANAKO_GET_QUEUE_STATUS" };
}

export function createSendQueueMessage(): SendQueueMessage {
  return { type: "HANAKO_SEND_QUEUE" };
}

export function createClearQueueMessage(): ClearQueueMessage {
  return { type: "HANAKO_CLEAR_QUEUE" };
}

export function createClearTranslationsMessage(): ClearTranslationsActiveTabMessage {
  return { type: "HANAKO_CLEAR_TRANSLATIONS_ACTIVE_TAB" };
}
```

- [ ] **Step 3: Update popup UI**

Update `src/popup/Popup.tsx` to:

```tsx
const [queueCount, setQueueCount] = useState(0);
const [jobUrl, setJobUrl] = useState("");

useEffect(() => {
  void chrome.runtime
    .sendMessage(createGetQueueStatusMessage())
    .then((result: { count?: number }) => setQueueCount(result.count ?? 0))
    .catch(() => setQueueCount(0));
}, []);
```

Add controls:

```tsx
<p>Queued pages: {queueCount}</p>
<button type="button" onClick={sendQueue}>Send queue</button>
<button type="button" onClick={clearQueue}>Clear queue</button>
<button type="button" onClick={clearTranslations}>Clear translations</button>
{jobUrl ? <a href={jobUrl} target="_blank" rel="noreferrer">Open current job</a> : null}
```

- [ ] **Step 4: Verify Task 8**

Run:

```bash
pnpm test tests/popup-actions.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 9: Add Image Resize And Translation Cache Helpers

**Files:**

- Create: `src/background/image-resize.ts`
- Create: `src/background/translation-cache.ts`
- Modify: `src/content/image-bitmap.ts`
- Modify: `src/background/visible-tab-capture.ts`
- Test: `tests/image-resize.test.ts`
- Test: `tests/translation-cache.test.ts`
- Test: `tests/image-bitmap.test.ts`
- Test: `tests/visible-tab-capture.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/translation-cache.test.ts`:

```ts
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
```

Create `tests/image-resize.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { calculateBoundedImageSize } from "../src/background/image-resize.js";

describe("image resize", () => {
  it("keeps images within the max dimension while preserving aspect ratio", () => {
    expect(
      calculateBoundedImageSize({
        width: 4000,
        height: 2000,
        maxDimension: 1800
      })
    ).toEqual({
      width: 1800,
      height: 900
    });
  });
});
```

- [ ] **Step 2: Implement helpers**

Create `src/background/translation-cache.ts`:

```ts
export async function createTranslationCacheKey(input: {
  baseUrl: string;
  bytesBase64: string;
  targetLanguage: string;
}): Promise<string> {
  const hash = await sha256(input.bytesBase64);
  return `${input.baseUrl}:${input.targetLanguage}:${hash}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

Create `src/background/image-resize.ts`:

```ts
export function calculateBoundedImageSize(input: {
  width: number;
  height: number;
  maxDimension?: number;
}): { width: number; height: number } {
  const maxDimension = input.maxDimension ?? 1800;
  const largest = Math.max(input.width, input.height);
  if (largest <= maxDimension) {
    return { width: input.width, height: input.height };
  }
  const scale = maxDimension / largest;
  return {
    width: Math.round(input.width * scale),
    height: Math.round(input.height * scale)
  };
}
```

- [ ] **Step 3: Wire resize into content-side canvas capture**

Update `src/content/image-bitmap.ts` inside `captureImageBitmapFromElement`:

```ts
import { calculateBoundedImageSize } from "../background/image-resize.js";

const sourceWidth = image.naturalWidth || image.width;
const sourceHeight = image.naturalHeight || image.height;

if (sourceWidth <= 0 || sourceHeight <= 0) {
  return undefined;
}

const { width, height } = calculateBoundedImageSize({
  width: sourceWidth,
  height: sourceHeight
});

const canvas = documentRef.createElement("canvas");
canvas.width = width;
canvas.height = height;

const context = canvas.getContext("2d");
context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
```

Update `tests/image-bitmap.test.ts` with a case that stubs an oversized image and asserts the created canvas dimensions are bounded to `1800` on the largest side.

- [ ] **Step 4: Wire resize into visible-tab screenshot crops**

Update `src/background/visible-tab-capture.ts` so `calculateVisibleCrop` preserves source crop dimensions but bounds the output canvas dimensions:

```ts
import { calculateBoundedImageSize } from "./image-resize.js";

const output = calculateBoundedImageSize({
  width: sourceWidth,
  height: sourceHeight
});

return {
  outputHeight: output.height,
  outputWidth: output.width,
  sourceHeight,
  sourceWidth,
  sourceX,
  sourceY
};
```

Update `tests/visible-tab-capture.test.ts` with a case for a crop larger than `1800` pixels and assert `outputWidth`/`outputHeight` are bounded while `sourceWidth`/`sourceHeight` stay equal to the visible crop size.

- [ ] **Step 5: Limit cache helper use to deterministic key creation**

Use `createTranslationCacheKey` in queue/job manager code only to identify duplicate queued payloads during a single extension session. Do not skip Hanako requests based on old rendered URLs in this task. The cache helper should only prevent adding the exact same image bytes twice to the queue when the target language and base URL match.

- [ ] **Step 6: Verify Task 9**

Run:

```bash
pnpm test tests/image-resize.test.ts tests/translation-cache.test.ts tests/image-bitmap.test.ts tests/visible-tab-capture.test.ts
pnpm typecheck
```

Expected: PASS.

## Task 10: Documentation And Full Verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update README**

Document:

```md
## Context Menu

- `Translate with Hanako` translates the right-clicked image and replaces that image in the page.
- `Queue to Hanako` stores the right-clicked image in the extension queue.
- `Queue to Hanako > Send queue` sends queued images to Hanako as one normal multi-page job. Queue jobs do not replace browser images.

## Settings

The Hanako base URL must include protocol, host, and port, for example `http://localhost:8787` or `http://192.168.50.138:8787`.
```

- [ ] **Step 2: Run focused test suite**

Run:

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Run static checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm format
pnpm build
```

Expected: all commands pass.

- [ ] **Step 4: Manual QA with Chrome**

Load the built extension from `dist`, point it to Tower Hanako, then verify:

- `Translate with Hanako` still swaps a right-clicked image in-place.
- `Queue to Hanako` increments the badge/menu count.
- `Queue to Hanako > Send queue` creates one multi-page Hanako project and does not replace page images.
- Invalid settings URLs do not save.
- Popup queue count and controls work after closing/reopening the popup.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git status --short
git add README.md src tests docs/superpowers/plans/2026-06-06-hanako-extension-queue-orchestration-plan.md
git commit -m "Add queued Hanako image projects to extension"
```

Expected: one implementation commit with source, tests, docs, and plan.

## Self-Review

- Spec coverage: context menu shape, explicit-only execution, queued multi-image project submission, no browser replacement for queue jobs, queue count badge/menu, URL save validation, restore flow, status helpers, and tests are covered.
- Red-flag scan: no unfinished work markers or open-ended "handle later" steps remain.
- Type consistency: queue types use `QueuedImageInput`/`QueuedImage`, job state uses `StoredJobState`, action status uses `ActionStatus`, and popup messages use `HANAKO_*` names consistently.
