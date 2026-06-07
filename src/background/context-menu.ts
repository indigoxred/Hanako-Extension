export const TRANSLATE_IMAGE_MENU_ID = "hanako-translate-image";
export const QUEUE_IMAGE_MENU_ID = "hanako-queue-image";
export const SEND_QUEUE_MENU_ID = "hanako-send-queue";

export interface ContextMenuOptions {
  queueContextMenusEnabled?: boolean;
}

export function createContextMenu(
  chromeApi: Pick<typeof chrome, "contextMenus">,
  options: ContextMenuOptions = {}
) {
  chromeApi.contextMenus.create({
    contexts: ["image"],
    id: TRANSLATE_IMAGE_MENU_ID,
    title: "Translate with Hanako"
  });

  if (options.queueContextMenusEnabled === false) {
    return;
  }

  chromeApi.contextMenus.create({
    contexts: ["image"],
    id: QUEUE_IMAGE_MENU_ID,
    title: "Add to Queue"
  });
  chromeApi.contextMenus.create({
    contexts: ["image"],
    enabled: false,
    id: SEND_QUEUE_MENU_ID,
    title: "Finalize Queue"
  });
}

export async function resetContextMenu(
  chromeApi: Pick<typeof chrome, "contextMenus">,
  options: ContextMenuOptions = {}
): Promise<void> {
  await chromeApi.contextMenus.removeAll();
  createContextMenu(chromeApi, options);
}

export async function updateQueueMenuTitle(
  chromeApi: Pick<typeof chrome, "contextMenus">,
  count: number
): Promise<void> {
  const title = count > 0 ? `Add to Queue (${count})` : "Add to Queue";
  await Promise.allSettled([
    chromeApi.contextMenus.update(QUEUE_IMAGE_MENU_ID, { title }),
    chromeApi.contextMenus.update(SEND_QUEUE_MENU_ID, { enabled: count > 0 })
  ]);
}
