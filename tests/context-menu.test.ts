import { describe, expect, it } from "vitest";

import {
  QUEUE_IMAGE_MENU_ID,
  SEND_QUEUE_MENU_ID,
  TRANSLATE_IMAGE_MENU_ID,
  createContextMenu,
  resetContextMenu,
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
        enabled: false,
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
          async update(id: string | number, input: Record<string, unknown>) {
            updates.push([id, input]);
          }
        }
      } as Pick<typeof chrome, "contextMenus">,
      2
    );

    expect(updates).toEqual([
      [QUEUE_IMAGE_MENU_ID, { title: "Queue to Hanako (2)" }],
      [SEND_QUEUE_MENU_ID, { enabled: true }]
    ]);
  });

  it("removes stale extension menu items before recreating the current menu", async () => {
    const calls: string[] = [];
    await resetContextMenu({
      contextMenus: {
        create() {
          calls.push("create");
        },
        async removeAll() {
          calls.push("removeAll");
        }
      }
    } as unknown as Pick<typeof chrome, "contextMenus">);

    expect(calls).toEqual(["removeAll", "create", "create", "create"]);
  });
});
