import {
  setActionStatus as setBrowserActionStatus,
  updateQueueBadge as updateBrowserQueueBadge,
  type ActionStatus
} from "./action-status.js";
import {
  type ContextMenuImageContext,
  type ContextMenuTranslationPhase,
  type ContextMenuTranslationResult,
  translateContextMenuImage as defaultTranslateContextMenuImage
} from "./context-menu-flow.js";
import { updateQueueMenuTitle as updateBrowserQueueMenuTitle } from "./context-menu.js";
import {
  setTabJobState as setBrowserTabJobState,
  type StoredJobState
} from "./job-state.js";
import {
  queueContextMenuImage as defaultQueueContextMenuImage,
  sendQueuedImages as defaultSendQueuedImages,
  type QueueImageResult,
  type SendQueueResult
} from "./queue-flow.js";
import {
  clearQueuedImages as defaultClearQueuedImages,
  getQueuedImageCount as defaultGetQueuedImageCount
} from "./queue-state.js";
import {
  translateActiveTab as defaultTranslateActiveTab,
  type TranslateActiveTabResult
} from "./translate-flow.js";

export interface JobManagerDependencies {
  clearQueuedImages?: () => Promise<void>;
  getQueuedImageCount?: () => Promise<number>;
  queueContextMenuImage?: (input: {
    context: ContextMenuImageContext;
  }) => Promise<QueueImageResult>;
  sendQueuedImages?: (input?: {
    context?: ContextMenuImageContext;
  }) => Promise<SendQueueResult>;
  openTab?: (url: string) => Promise<void>;
  setActionStatus?: (status: ActionStatus) => Promise<void>;
  setTabJobState?: (
    tabId: number,
    state: Omit<StoredJobState, "updatedAt">
  ) => Promise<StoredJobState>;
  translateActiveTab?: () => Promise<TranslateActiveTabResult>;
  translateContextMenuImage?: (input: {
    context: ContextMenuImageContext;
  }) => Promise<ContextMenuTranslationResult>;
  updateQueueBadge?: (count: number) => Promise<void>;
  updateQueueMenuTitle?: (count: number) => Promise<void>;
}

export function createJobManager(dependencies: JobManagerDependencies = {}) {
  const inFlight = new Map<string, Promise<unknown>>();
  const setActionStatus =
    dependencies.setActionStatus ??
    ((status: ActionStatus) => setBrowserActionStatus(chrome.action, status));
  const updateQueueBadge =
    dependencies.updateQueueBadge ??
    ((count: number) => updateBrowserQueueBadge(chrome.action, count));
  const updateQueueMenuTitle =
    dependencies.updateQueueMenuTitle ??
    ((count: number) => updateBrowserQueueMenuTitle(chrome, count));
  const setTabJobState =
    dependencies.setTabJobState ??
    ((tabId: number, state: Omit<StoredJobState, "updatedAt">) =>
      setBrowserTabJobState(chrome.storage.local, tabId, state));
  const openTab =
    dependencies.openTab ??
    ((url: string) => chrome.tabs.create({ url }).then(() => undefined));

  async function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key) as Promise<T> | undefined;

    if (existing) {
      return existing;
    }

    const promise = run().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  return {
    clearQueue: async () => {
      await (dependencies.clearQueuedImages ?? defaultClearQueuedImages)();
      await Promise.all([updateQueueBadge(0), updateQueueMenuTitle(0)]);
      return { count: 0, ok: true };
    },
    getQueueStatus: async () => {
      const count = await (
        dependencies.getQueuedImageCount ?? defaultGetQueuedImageCount
      )();
      return { count, ok: true };
    },
    queueContextMenuImage: async (context: ContextMenuImageContext) => {
      let result: QueueImageResult;

      try {
        result = await (
          dependencies.queueContextMenuImage ??
          ((input) => defaultQueueContextMenuImage(input))
        )({ context });
      } catch (error) {
        result = { error: errorMessage(error, "Queue add failed"), ok: false };
      }

      if (result.ok) {
        await Promise.all([
          updateQueueBadge(result.count),
          updateQueueMenuTitle(result.count),
          setContextTabJobState(context, {
            message: `Queued ${result.count} page${result.count === 1 ? "" : "s"} for Hanako`,
            status: "queued"
          })
        ]);
      } else {
        await setContextTabJobState(context, {
          message: result.error,
          status: "failed"
        });
        await setActionStatus("error");
      }

      return result;
    },
    sendQueuedImages: (context?: ContextMenuImageContext) =>
      dedupe("send-queue", async () => {
        await setActionStatus("running");
        await setContextTabJobState(context, {
          message: "Finalizing queue",
          phase: "finalizing-queue",
          status: "running"
        });
        let result: SendQueueResult;

        try {
          result = dependencies.sendQueuedImages
            ? await dependencies.sendQueuedImages({
                ...(context ? { context } : {})
              })
            : await defaultSendQueuedImages();
        } catch (error) {
          result = {
            error: errorMessage(error, "Queue send failed"),
            ok: false
          };
        }

        if (result.ok) {
          await Promise.all([
            updateQueueBadge(0),
            updateQueueMenuTitle(0),
            setContextTabJobState(context, {
              jobId: result.jobId,
              message: `Submitted ${result.imageCount} queued page${
                result.imageCount === 1 ? "" : "s"
              } to Hanako`,
              phase: "submitted",
              status: "submitted"
            }),
            openJobTab(result.jobUrl)
          ]);
          await setActionStatus("success");
        } else {
          await setContextTabJobState(context, {
            message: result.error,
            phase: "failed",
            status: "failed"
          });
          await setActionStatus("error");
        }

        return result;
      }),
    translateActiveTab: () =>
      dedupe("active-tab", async () => {
        await setActionStatus("running");
        const result = await (
          dependencies.translateActiveTab ?? defaultTranslateActiveTab
        )().catch((error: unknown) => ({
          error: errorMessage(error, "Translation failed"),
          ok: false as const
        }));
        await setActionStatus(result.ok ? "success" : "error");
        return result;
      }),
    translateContextMenuImage: (context: ContextMenuImageContext) =>
      dedupe(
        `context:${context.tabId ?? "none"}:${context.srcUrl ?? "none"}`,
        async () => {
          await setActionStatus("running");
          await setContextTabJobState(context, {
            message: "Translating clicked image",
            phase: "starting",
            status: "running"
          });
          const result = await (
            dependencies.translateContextMenuImage ??
            defaultTranslateContextMenuImage
          )({
            context,
            onPhase: async (phase) => {
              await setContextTabJobState(
                context,
                jobStateFromContextPhase(phase)
              );
            }
          }).catch((error: unknown) => ({
            error: errorMessage(error, "Translation failed"),
            ok: false as const
          }));
          await setContextTabJobState(
            context,
            contextJobStateFromResult(result)
          );
          await setActionStatus(result.ok ? "success" : "error");
          return result;
        }
      )
  };

  function setContextTabJobState(
    context: ContextMenuImageContext | undefined,
    state: Omit<StoredJobState, "updatedAt">
  ): Promise<StoredJobState | undefined> {
    if (!context || context.tabId === undefined) {
      return Promise.resolve(undefined);
    }

    try {
      return Promise.resolve(setTabJobState(context.tabId, state)).catch(
        () => undefined
      );
    } catch {
      return Promise.resolve(undefined);
    }
  }

  function openJobTab(url: string): Promise<void> {
    try {
      return Promise.resolve(openTab(url)).catch(() => undefined);
    } catch {
      return Promise.resolve();
    }
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function contextJobStateFromResult(
  result: ContextMenuTranslationResult
): Omit<StoredJobState, "updatedAt"> {
  if (!result.ok) {
    return {
      ...(result.jobId ? { jobId: result.jobId } : {}),
      message: result.error,
      phase: "failed",
      status: "failed"
    };
  }

  if (result.status === "timeout") {
    return {
      jobId: result.jobId,
      message: "Hanako job is still processing",
      phase: "timeout",
      status: "timeout"
    };
  }

  return {
    jobId: result.jobId,
    message: `Replaced ${result.replacementCount} image${
      result.replacementCount === 1 ? "" : "s"
    }`,
    phase: "completed",
    status: "completed"
  };
}

function jobStateFromContextPhase(
  phase: ContextMenuTranslationPhase
): Omit<StoredJobState, "updatedAt"> {
  return {
    ...(phase.jobId ? { jobId: phase.jobId } : {}),
    message: phase.message,
    phase: phase.phase,
    status:
      phase.phase === "completed"
        ? "completed"
        : phase.phase === "failed"
          ? "failed"
          : phase.phase === "timeout"
            ? "timeout"
            : "running"
  };
}
