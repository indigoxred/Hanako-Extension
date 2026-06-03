export function showOverlay(
  message: string,
  documentRef: Document = document
): HTMLElement {
  const existing = documentRef.querySelector<HTMLElement>(
    "[data-hanako-overlay]"
  );

  if (existing) {
    existing.textContent = message;
    return existing;
  }

  const overlay = documentRef.createElement("div");
  overlay.dataset.hanakoOverlay = "true";
  overlay.textContent = message;
  overlay.style.position = "fixed";
  overlay.style.right = "16px";
  overlay.style.bottom = "16px";
  overlay.style.zIndex = "2147483647";
  overlay.style.background = "#172026";
  overlay.style.color = "#ffffff";
  overlay.style.padding = "8px 10px";
  overlay.style.borderRadius = "6px";
  documentRef.body.append(overlay);
  return overlay;
}
