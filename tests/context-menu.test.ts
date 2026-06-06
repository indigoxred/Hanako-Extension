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
          async update(id: string | number, input: { title: string }) {
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
