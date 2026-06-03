export const TRANSLATE_IMAGE_MENU_ID = "hanako-translate-image";

export function createContextMenu(chromeApi: Pick<typeof chrome, "contextMenus">) {
  chromeApi.contextMenus.create({
    contexts: ["image"],
    id: TRANSLATE_IMAGE_MENU_ID,
    title: "Translate with Hanako"
  });
}
