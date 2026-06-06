export type ActionStatus = "idle" | "running" | "success" | "error";

export interface ActionApi {
  setBadgeText(input: { text: string }): Promise<void> | void;
  setBadgeBackgroundColor(input: { color: string }): Promise<void> | void;
}

export async function setActionStatus(
  action: ActionApi = chrome.action,
  status: ActionStatus
): Promise<void> {
  const details = {
    error: { color: "#dc2626", text: "!" },
    idle: { color: "#64748b", text: "" },
    running: { color: "#7c3aed", text: "..." },
    success: { color: "#16a34a", text: "OK" }
  } satisfies Record<ActionStatus, { color: string; text: string }>;

  await action.setBadgeText({ text: details[status].text });
  await action.setBadgeBackgroundColor({ color: details[status].color });
}

export async function updateQueueBadge(
  action: ActionApi = chrome.action,
  count: number
): Promise<void> {
  if (count <= 0) {
    await setActionStatus(action, "idle");
    return;
  }

  await action.setBadgeText({ text: String(count) });
  await action.setBadgeBackgroundColor({ color: "#2563eb" });
}
