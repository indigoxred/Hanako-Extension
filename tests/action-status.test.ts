import { describe, expect, it } from "vitest";

import {
  setActionStatus,
  updateQueueBadge
} from "../src/background/action-status.js";

describe("action status", () => {
  it("shows queued image count on the action badge", async () => {
    const calls: unknown[] = [];
    const action = createActionRecorder(calls);

    await updateQueueBadge(action, 3);

    expect(calls).toEqual([
      ["setBadgeText", { text: "3" }],
      ["setBadgeBackgroundColor", { color: "#2563eb" }]
    ]);
  });

  it("shows running and error states", async () => {
    const calls: unknown[] = [];
    const action = createActionRecorder(calls);

    await setActionStatus(action, "running");
    await setActionStatus(action, "error");

    expect(calls).toEqual([
      ["setBadgeText", { text: "..." }],
      ["setBadgeBackgroundColor", { color: "#7c3aed" }],
      ["setBadgeText", { text: "!" }],
      ["setBadgeBackgroundColor", { color: "#dc2626" }]
    ]);
  });
});

function createActionRecorder(calls: unknown[]) {
  return {
    async setBadgeBackgroundColor(input: { color: string }) {
      calls.push(["setBadgeBackgroundColor", input]);
    },
    async setBadgeText(input: { text: string }) {
      calls.push(["setBadgeText", input]);
    }
  };
}
