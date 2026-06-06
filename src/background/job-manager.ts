import {
  setActionStatus as setBrowserActionStatus,
  updateQueueBadge as updateBrowserQueueBadge,
  type ActionStatus
} from "./action-status.js";
import {
  type ContextMenuImageContext,
  type ContextMenuTranslationResult,
  translateContextMenuImage as defaultTranslateContextMenuImage
} from "./context-menu-flow.js";
import { updateQueueMenuTitle as updateBrowserQueueMenuTitle } from "./context-menu.js";
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
  sendQueuedImages?: () => Promise<SendQueueResult>;
  setActionStatus?: (status: ActionStatus) => Promise<void>;
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
          updateQueueMenuTitle(result.count)
        ]);
      } else {
        await setActionStatus("error");
      }

      return result;
    },
    sendQueuedImages: () =>
      dedupe("send-queue", async () => {
        await setActionStatus("running");
        let result: SendQueueResult;

        try {
          result = await (
            dependencies.sendQueuedImages ?? defaultSendQueuedImages
          )();
        } catch (error) {
          result = {
            error: errorMessage(error, "Queue send failed"),
            ok: false
          };
        }

        if (result.ok) {
          await Promise.all([updateQueueBadge(0), updateQueueMenuTitle(0)]);
          await setActionStatus("success");
        } else {
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
          const result = await (
            dependencies.translateContextMenuImage ??
            defaultTranslateContextMenuImage
          )({ context }).catch((error: unknown) => ({
            error: errorMessage(error, "Translation failed"),
            ok: false as const
          }));
          await setActionStatus(result.ok ? "success" : "error");
          return result;
        }
      )
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
