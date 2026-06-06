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
  phase?: string;
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
  const value = stored[JOB_STATE_STORAGE_KEY];
  return typeof value === "object" && value !== null
    ? (value as Record<string, StoredJobState>)
    : {};
}
