export interface QueuedImageInput {
  bytesBase64: string;
  mediaType: string;
  pageUrl?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  domIndex?: number;
  domId?: string;
  cacheKey?: string;
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
export const MAX_QUEUE_BYTES = 250_000_000;

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

  if (estimateQueueBytes(next) > MAX_QUEUE_BYTES) {
    throw new Error("Hanako queue is too large; send or clear it first");
  }

  await storage.set({ [QUEUE_STORAGE_KEY]: next });
  return { count: next.length, item };
}

export async function listQueuedImages(
  storage: QueueStorageArea = getDefaultQueueStorage()
): Promise<QueuedImage[]> {
  const stored = await storage.get({ [QUEUE_STORAGE_KEY]: [] });
  const items = stored[QUEUE_STORAGE_KEY];
  return Array.isArray(items) ? (items as QueuedImage[]) : [];
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

function estimateQueueBytes(items: QueuedImage[]): number {
  return items.reduce((total, item) => total + item.bytesBase64.length, 0);
}
