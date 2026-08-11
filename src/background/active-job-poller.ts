import {
  setActionStatus as setBrowserActionStatus,
  type ActionStatus
} from "./action-status.js";
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
export const RENDERED_PAGE_DELIVERY_FAILED_MESSAGE =
  "Translation completed, but the rendered image could not be applied";

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
export interface ReplaceImagesResponse {
  applied: number;
  failed: number;
  ok: boolean;
}

export interface PollActiveExtensionJobsDependencies {
  executeContentScript?: (tabId: number) => Promise<void>;
  pollJobOnce?: (input: PollJobInput) => Promise<ExtensionJobPollDetail>;
  sendReplaceImagesMessage?: (
    tabId: number,
    input: ReplaceImagesMessageInput
  ) => Promise<ReplaceImagesResponse>;
  setActionStatus?: (status: ActionStatus, tabId: number) => Promise<void>;
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
  pollJobOnce = defaultPollJobOnce,
  sendReplaceImagesMessage = defaultSendReplaceImagesMessage,
  setActionStatus = defaultSetActionStatus,
  setTabJobState = defaultSetTabJobState,
  storage = chrome.storage.local
}: PollActiveExtensionJobsDependencies = {}): Promise<{ polled: number }> {
  const jobs = await getActiveExtensionJobs(storage);

  for (const job of jobs) {
    await pollActiveExtensionJob({
      executeContentScript,
      job,
      pollJobOnce,
      sendReplaceImagesMessage,
      setActionStatus,
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
  pollJobOnce: (pollInput: PollJobInput) => Promise<ExtensionJobPollDetail>;
  sendReplaceImagesMessage: (
    tabId: number,
    replacementInput: ReplaceImagesMessageInput
  ) => Promise<ReplaceImagesResponse>;
  setActionStatus: (status: ActionStatus, tabId: number) => Promise<void>;
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
    await input.setTabJobState(job.tabId, {
      jobId: job.jobId,
      message: "Waiting for Hanako job",
      phase: "waiting-for-job",
      status: "running"
    });
    return;
  }

  if (detail.job.status === "failed" || detail.job.status === "cancelled") {
    await finishActiveJob({
      actionStatus: "error",
      job,
      setActionStatus: input.setActionStatus,
      setTabJobState: input.setTabJobState,
      state: {
        jobId: job.jobId,
        message: detail.error?.message ?? "Hanako job failed",
        phase: "failed",
        status: "failed"
      },
      storage: input.storage
    });
    return;
  }

  if (detail.job.status !== "completed") {
    const phase = describeJobPhase(detail);
    await input.setTabJobState(job.tabId, {
      jobId: job.jobId,
      message: phase.message,
      phase: phase.phase,
      status: "running"
    });
    return;
  }

  const delivery = await attemptRenderedPageDelivery(job, detail, {
    executeContentScript: input.executeContentScript,
    sendReplaceImagesMessage: input.sendReplaceImagesMessage
  });

  if (delivery.delivered) {
    await finishActiveJob({
      actionStatus: "success",
      job,
      setActionStatus: input.setActionStatus,
      setTabJobState: input.setTabJobState,
      state: {
        jobId: job.jobId,
        message: `Replaced ${delivery.replacementCount} image${delivery.replacementCount === 1 ? "" : "s"}`,
        phase: "completed",
        status: "completed"
      },
      storage: input.storage
    });
    return;
  }

  await finishActiveJob({
    actionStatus: "error",
    job,
    setActionStatus: input.setActionStatus,
    setTabJobState: input.setTabJobState,
    state: {
      jobId: job.jobId,
      message: RENDERED_PAGE_DELIVERY_FAILED_MESSAGE,
      phase: "failed",
      status: "failed"
    },
    storage: input.storage
  });
}

async function finishActiveJob(input: {
  actionStatus: "error" | "success";
  job: ActiveExtensionJob;
  setActionStatus: (status: ActionStatus, tabId: number) => Promise<void>;
  setTabJobState: (
    tabId: number,
    state: Omit<StoredJobState, "updatedAt">
  ) => Promise<StoredJobState>;
  state: Omit<StoredJobState, "updatedAt">;
  storage: JobStateStorageArea;
}): Promise<void> {
  try {
    await Promise.all([
      input.setTabJobState(input.job.tabId, input.state),
      input.setActionStatus(input.actionStatus, input.job.tabId)
    ]);
  } finally {
    await clearActiveExtensionJob(input.storage, input.job.id);
  }
}

export async function attemptRenderedPageDelivery(
  job: TrackActiveExtensionJobInput,
  detail: ExtensionJobPollDetail,
  dependencies: {
    executeContentScript: (tabId: number) => Promise<void>;
    sendReplaceImagesMessage: (
      tabId: number,
      input: ReplaceImagesMessageInput
    ) => Promise<ReplaceImagesResponse>;
  }
): Promise<{ delivered: boolean; replacementCount: number }> {
  const replacements = buildReplacementInstructions(job, detail);

  if (
    replacements.length === 0 ||
    replacements.length !== job.replacements.length
  ) {
    return { delivered: false, replacementCount: 0 };
  }

  let response: ReplaceImagesResponse;

  try {
    await dependencies.executeContentScript(job.tabId);
    response = await dependencies.sendReplaceImagesMessage(job.tabId, {
      replacements
    });
  } catch {
    return { delivered: false, replacementCount: 0 };
  }

  if (
    !response.ok ||
    response.applied !== replacements.length ||
    response.failed !== 0
  ) {
    return { delivered: false, replacementCount: 0 };
  }

  return { delivered: true, replacementCount: response.applied };
}

function buildReplacementInstructions(
  job: TrackActiveExtensionJobInput,
  detail: ExtensionJobPollDetail
): ReplaceImagesMessageInput["replacements"] {
  return job.replacements.flatMap((target, index) => {
    const page = detail.pages?.[index];

    if (
      !page?.renderedAssetId ||
      (target.domIndex === undefined && !target.domId && !target.sourceUrl)
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

async function defaultExecuteContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    files: ["content/content-entry.js"],
    target: { tabId }
  });
}

async function defaultSendReplaceImagesMessage(
  tabId: number,
  input: ReplaceImagesMessageInput
): Promise<ReplaceImagesResponse> {
  return (await chrome.tabs.sendMessage(tabId, {
    ...input,
    type: "HANAKO_REPLACE_IMAGES"
  })) as ReplaceImagesResponse;
}

async function defaultSetTabJobState(
  tabId: number,
  state: Omit<StoredJobState, "updatedAt">
): Promise<StoredJobState> {
  return setBrowserTabJobState(chrome.storage.local, tabId, state);
}

async function defaultSetActionStatus(
  status: ActionStatus,
  tabId: number
): Promise<void> {
  await setBrowserActionStatus(chrome.action, status, tabId);
}

function hasBrowserJobStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.storage?.local) &&
    Boolean(chrome.alarms)
  );
}
