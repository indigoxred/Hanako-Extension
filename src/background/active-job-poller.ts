import {
  createRenderedPageUrl,
  describeJobPhase,
  pollJobOnce as defaultPollJobOnce,
  type ExtensionJobPollDetail,
  type PollJobInput
} from "./job-poller.js";
import {
  setTabJobState as setBrowserTabJobState,
  type JobStateStorageArea,
  type StoredJobState
} from "./job-state.js";

export const ACTIVE_EXTENSION_JOB_ALARM_NAME = "hanako-active-job-poll";
export const ACTIVE_EXTENSION_JOB_POLL_PERIOD_MINUTES = 0.5;

const ACTIVE_EXTENSION_JOBS_STORAGE_KEY = "hanakoActiveExtensionJobs";

export interface ActiveJobReplacementTarget {
  domId?: string;
  domIndex?: number;
  sourceUrl?: string;
}

export interface TrackActiveExtensionJobInput {
  baseUrl: string;
  imageCount: number;
  jobId: string;
  replacements: ActiveJobReplacementTarget[];
  tabId: number;
}

export interface ActiveExtensionJob extends TrackActiveExtensionJobInput {
  createdAt: string;
  id: string;
  pollAttempts: number;
  updatedAt: string;
}

export interface ReplaceImagesMessageInput {
  replacements: Array<
    ActiveJobReplacementTarget & {
      renderedUrl: string;
    }
  >;
}

export interface PollActiveExtensionJobsDependencies {
  executeContentScript?: (tabId: number) => Promise<void>;
  now?: () => Date;
  pollJobOnce?: (input: PollJobInput) => Promise<ExtensionJobPollDetail>;
  sendReplaceImagesMessage?: (
    tabId: number,
    input: ReplaceImagesMessageInput
  ) => Promise<{ ok: boolean; replaced: number }>;
  setTabJobState?: (
    tabId: number,
    state: Omit<StoredJobState, "updatedAt">
  ) => Promise<StoredJobState>;
  storage?: JobStateStorageArea;
}

export interface ActiveJobAlarmApi {
  clear(name: string): Promise<boolean> | boolean;
  create(
    name: string,
    alarmInfo: { periodInMinutes: number }
  ): Promise<void> | void;
}

export async function trackActiveExtensionJob(
  storage: JobStateStorageArea,
  input: TrackActiveExtensionJobInput,
  now: () => Date = () => new Date()
): Promise<ActiveExtensionJob> {
  const all = await getActiveExtensionJobMap(storage);
  const id = createActiveExtensionJobId(input.tabId, input.jobId);
  const timestamp = now().toISOString();
  const previous = all[id];
  const next: ActiveExtensionJob = {
    ...input,
    createdAt: previous?.createdAt ?? timestamp,
    id,
    pollAttempts: previous?.pollAttempts ?? 0,
    updatedAt: timestamp
  };

  await storage.set({
    [ACTIVE_EXTENSION_JOBS_STORAGE_KEY]: { ...all, [id]: next }
  });
  return next;
}

export async function clearActiveExtensionJob(
  storage: JobStateStorageArea,
  id: string
): Promise<void> {
  const all = await getActiveExtensionJobMap(storage);
  delete all[id];
  await storage.set({ [ACTIVE_EXTENSION_JOBS_STORAGE_KEY]: all });
}

export async function getActiveExtensionJobs(
  storage: JobStateStorageArea
): Promise<ActiveExtensionJob[]> {
  return Object.values(await getActiveExtensionJobMap(storage));
}

export function createActiveExtensionJobId(
  tabId: number,
  jobId: string
): string {
  return `${tabId}:${jobId}`;
}

export async function pollActiveExtensionJobsOnce({
  executeContentScript = defaultExecuteContentScript,
  now = () => new Date(),
  pollJobOnce = defaultPollJobOnce,
  sendReplaceImagesMessage = defaultSendReplaceImagesMessage,
  setTabJobState = defaultSetTabJobState,
  storage = chrome.storage.local
}: PollActiveExtensionJobsDependencies = {}): Promise<{ polled: number }> {
  const jobs = await getActiveExtensionJobs(storage);

  for (const job of jobs) {
    await pollActiveExtensionJob({
      executeContentScript,
      job,
      now,
      pollJobOnce,
      sendReplaceImagesMessage,
      setTabJobState,
      storage
    });
  }

  return { polled: jobs.length };
}

export async function trackBrowserActiveExtensionJob(
  input: TrackActiveExtensionJobInput
): Promise<void> {
  if (!hasBrowserJobStorage()) {
    return;
  }

  await trackActiveExtensionJob(chrome.storage.local, input);
  await syncActiveExtensionJobPollingAlarm();
}

export async function clearBrowserActiveExtensionJob(input: {
  jobId: string;
  tabId: number;
}): Promise<void> {
  if (!hasBrowserJobStorage()) {
    return;
  }

  await clearActiveExtensionJob(
    chrome.storage.local,
    createActiveExtensionJobId(input.tabId, input.jobId)
  );
  await syncActiveExtensionJobPollingAlarm();
}

export async function syncActiveExtensionJobPollingAlarm(
  input: {
    alarms?: ActiveJobAlarmApi;
    storage?: JobStateStorageArea;
  } = {}
): Promise<void> {
  if (!hasBrowserJobStorage() && !input.storage) {
    return;
  }

  const storage = input.storage ?? chrome.storage.local;
  const alarms = input.alarms ?? chrome.alarms;
  const jobs = await getActiveExtensionJobs(storage);

  if (jobs.length > 0) {
    await alarms.create(ACTIVE_EXTENSION_JOB_ALARM_NAME, {
      periodInMinutes: ACTIVE_EXTENSION_JOB_POLL_PERIOD_MINUTES
    });
    return;
  }

  await alarms.clear(ACTIVE_EXTENSION_JOB_ALARM_NAME);
}

async function pollActiveExtensionJob(input: {
  executeContentScript: (tabId: number) => Promise<void>;
  job: ActiveExtensionJob;
  now: () => Date;
  pollJobOnce: (pollInput: PollJobInput) => Promise<ExtensionJobPollDetail>;
  sendReplaceImagesMessage: (
    tabId: number,
    replacementInput: ReplaceImagesMessageInput
  ) => Promise<{ ok: boolean; replaced: number }>;
  setTabJobState: (
    tabId: number,
    state: Omit<StoredJobState, "updatedAt">
  ) => Promise<StoredJobState>;
  storage: JobStateStorageArea;
}): Promise<void> {
  const { job } = input;
  let detail: ExtensionJobPollDetail;

  try {
    detail = await input.pollJobOnce({
      baseUrl: job.baseUrl,
      jobId: job.jobId
    });
  } catch {
    await updateActiveJob(input.storage, {
      ...job,
      pollAttempts: job.pollAttempts + 1,
      updatedAt: input.now().toISOString()
    });
    await input.setTabJobState(job.tabId, {
      jobId: job.jobId,
      message: "Waiting for Hanako job",
      phase: "waiting-for-job",
      status: "running"
    });
    return;
  }

  if (detail.job.status === "failed" || detail.job.status === "cancelled") {
    await clearActiveExtensionJob(input.storage, job.id);
    await input.setTabJobState(job.tabId, {
      jobId: job.jobId,
      message: detail.error?.message ?? "Hanako job failed",
      phase: "failed",
      status: "failed"
    });
    return;
  }

  if (detail.job.status !== "completed") {
    const phase = describeJobPhase(detail);
    await updateActiveJob(input.storage, {
      ...job,
      pollAttempts: job.pollAttempts + 1,
      updatedAt: input.now().toISOString()
    });
    await input.setTabJobState(job.tabId, {
      jobId: job.jobId,
      message: phase.message,
      phase: phase.phase,
      status: "running"
    });
    return;
  }

  const replacements = buildReplacementInstructions(job, detail);

  if (replacements.length > 0) {
    await input.executeContentScript(job.tabId);
    const replaced = await input.sendReplaceImagesMessage(job.tabId, {
      replacements
    });
    await clearActiveExtensionJob(input.storage, job.id);
    await input.setTabJobState(job.tabId, {
      jobId: job.jobId,
      message: `Replaced ${replaced.replaced} image${
        replaced.replaced === 1 ? "" : "s"
      }`,
      phase: "completed",
      status: "completed"
    });
    return;
  }

  if (!hasExpectedRenderedPages(job, detail)) {
    const phase = describeJobPhase(detail);
    await updateActiveJob(input.storage, {
      ...job,
      pollAttempts: job.pollAttempts + 1,
      updatedAt: input.now().toISOString()
    });
    await input.setTabJobState(job.tabId, {
      jobId: job.jobId,
      message: "Waiting for Hanako rendered pages",
      phase: phase.phase === "completed" ? "render_pages" : phase.phase,
      status: "running"
    });
    return;
  }

  await clearActiveExtensionJob(input.storage, job.id);
  await input.setTabJobState(job.tabId, {
    jobId: job.jobId,
    message: "Hanako job completed without rendered pages",
    phase: "failed",
    status: "failed"
  });
}

function hasExpectedRenderedPages(
  job: ActiveExtensionJob,
  detail: ExtensionJobPollDetail
): boolean {
  return (
    (detail.pages ?? []).filter((page) => Boolean(page.renderedAssetId))
      .length >= job.replacements.length
  );
}

function buildReplacementInstructions(
  job: ActiveExtensionJob,
  detail: ExtensionJobPollDetail
): ReplaceImagesMessageInput["replacements"] {
  return job.replacements.flatMap((target, index) => {
    const page = detail.pages?.[index];

    if (
      !page?.renderedAssetId ||
      (target.domIndex === undefined && !target.domId)
    ) {
      return [];
    }

    return [
      {
        ...(target.domId ? { domId: target.domId } : {}),
        ...(target.domIndex === undefined ? {} : { domIndex: target.domIndex }),
        renderedUrl: createRenderedPageUrl({
          baseUrl: job.baseUrl,
          jobId: job.jobId,
          pageId: page.id
        }),
        ...(target.sourceUrl ? { sourceUrl: target.sourceUrl } : {})
      }
    ];
  });
}

async function getActiveExtensionJobMap(
  storage: JobStateStorageArea
): Promise<Record<string, ActiveExtensionJob>> {
  const stored = await storage.get({ [ACTIVE_EXTENSION_JOBS_STORAGE_KEY]: {} });
  const value = stored[ACTIVE_EXTENSION_JOBS_STORAGE_KEY];
  return typeof value === "object" && value !== null
    ? (value as Record<string, ActiveExtensionJob>)
    : {};
}

async function updateActiveJob(
  storage: JobStateStorageArea,
  job: ActiveExtensionJob
): Promise<void> {
  const all = await getActiveExtensionJobMap(storage);
  await storage.set({
    [ACTIVE_EXTENSION_JOBS_STORAGE_KEY]: { ...all, [job.id]: job }
  });
}

async function defaultExecuteContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId }
  });
}

async function defaultSendReplaceImagesMessage(
  tabId: number,
  input: ReplaceImagesMessageInput
): Promise<{ ok: boolean; replaced: number }> {
  return (await chrome.tabs.sendMessage(tabId, {
    ...input,
    type: "HANAKO_REPLACE_IMAGES"
  })) as { ok: boolean; replaced: number };
}

async function defaultSetTabJobState(
  tabId: number,
  state: Omit<StoredJobState, "updatedAt">
): Promise<StoredJobState> {
  return setBrowserTabJobState(chrome.storage.local, tabId, state);
}

function hasBrowserJobStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.storage?.local) &&
    Boolean(chrome.alarms)
  );
}
