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
