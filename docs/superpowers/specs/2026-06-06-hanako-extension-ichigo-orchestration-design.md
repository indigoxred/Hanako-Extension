# Hanako-Extension Ichigo-Orchestration Design

## Goal

Make Hanako-Extension feel like a complete browser extension by adopting the relevant orchestration patterns from the known-good Ichigo extension while keeping Hanako's server-side translation, OCR, provider settings, and rendering as the source of truth.

Image capture and submission already work. This pass focuses on the extension features around that pipeline: explicit user actions, single-image replacement, queued multi-image project submission, status, duplicate protection, restore/clear behavior, and safer payload handling.

## Non-Goals

- Do not auto-translate pages on load. Translation starts only from explicit user actions.
- Do not copy Ichigo's local text-overlay renderer, font controls, account/auth flow, paid model selection, or website-specific product flow.
- Do not move translation logic out of Hanako. The extension sends browser images to Hanako and applies Hanako-rendered output.

## User-Facing Behavior

The popup should become the main control surface for the current tab:

- Show Hanako connection status and the current site's extension state.
- Let the user explicitly run page translation.
- Let the user clear/restore translations on the current page.
- Show the latest tab job state, including queued/running/completed/failed/timeout.
- Offer a direct link to the current Hanako job when one exists.
- Keep the existing WebUI link.

The context menu should stay focused on image actions:

- `Translate with Hanako` for the existing right-click single-image workflow. This sends the clicked image to Hanako, waits for the rendered output, and swaps the translated image in-place.
- `Queue to Hanako` for adding the clicked image to the extension queue. The menu title should show the current queued page count, such as `Queue to Hanako (2)`.
- `Queue to Hanako` should have a submenu item named `Send queue`. Hovering over `Queue to Hanako` exposes `Send queue`; clicking `Send queue` submits the queued images to Hanako as one project.

Queued jobs are distinct from single-image translation:

- Queued images are sent together in the order the user queued them.
- Sending the queue creates one normal Hanako project/job.
- Queue jobs do not replace images in the browser page.
- After sending, the user uses Hanako's current job tab/WebUI to review and download the output.
- After a successful queue send, the extension clears the queue.

The browser action should expose lightweight state:

- Idle/ready state when Hanako is reachable.
- Running state while an explicit translation action is in progress.
- Success state when replacements were applied.
- Error state when the job fails or the extension cannot reach Hanako.
- Queue count state when pages are queued. The badge text should show `1`, `2`, `3`, and so on for the current queued page count.

This can use action badges first, so the feature does not depend on a separate icon asset pass.

## Extension State

Add a storage-backed state layer using `chrome.storage.local` for runtime state and `chrome.storage.sync` for user settings.

Runtime state should include:

- Latest job per tab.
- Latest status per tab.
- In-flight action keys to block duplicate submissions.
- Recent translation cache entries keyed by image hash, target language, and Hanako base URL.

User settings should remain simple:

- Hanako base URL.
- Target language.

The settings page should only save the Hanako base URL when it has a valid server address and explicit port. Accepted formats should include local development and Tower-style URLs, such as `http://localhost:8787` and `http://192.168.50.138:8787`. Invalid or portless values should be rejected with a visible validation message and should not overwrite the previous working setting.

Additional settings are out of scope unless required by the implementation.

Queued image state should include:

- Queue item ID.
- Source page URL.
- Source image URL when available.
- Captured image bytes or a cache reference to captured image bytes.
- Media type.
- Width and height.
- Original DOM metadata for ordering/debugging, but not for replacement.
- Queued timestamp.

The queue should be stored locally so closing and reopening the popup does not lose queued pages. Queue storage should avoid unbounded growth by enforcing a practical maximum item count and payload size.

## Job Manager

Add a background job manager that coordinates popup and context-menu requests.

Responsibilities:

- Serialize repeated clicks for the same tab/action key.
- Prevent duplicate page jobs while one is already running for the same tab.
- Add right-clicked images to the queue without creating a Hanako job.
- Submit queued images as one Hanako project/job when `Send queue` is clicked.
- Keep single-image context-menu jobs separate from queued project jobs.
- Persist job status transitions so the popup can reopen and show what happened.
- Normalize errors from capture, Hanako upload, polling, replacement, and timeout.
- Update action badge state after each transition.

The manager should wrap the existing `translateActiveTab` and `translateContextMenuImage` flows rather than replacing them wholesale, and should add a new queue submission path that calls Hanako's page/project endpoint with all queued images.

## Content Restore Flow

Extend the content script with a clear/restore message:

- Restore original `img.src`.
- Restore original `img.srcset` where present.
- Restore original `<picture><source srcset>` values.
- Remove Hanako replacement dataset markers.
- Stop reapplying stale translated image URLs after a clear.

This builds on the existing replacement metadata written by `dom-replacer.ts`.

## Image Payload Hardening

Keep the current browser-side bitmap extraction and screenshot-crop fallback as the primary image path.

Add two hardening pieces inspired by Ichigo:

- Resize very large captured images before upload to keep payloads and jobs reasonable.
- Hash image bytes plus settings so repeated explicit actions can reuse recent successful results when appropriate.

Referer-aware site fetching and `declarativeNetRequest` should be deferred unless a real site cannot be handled by the current bitmap/screenshot approach. The current working bitmap path avoids many CORS problems without extra permissions.

## Architecture

New or expanded modules:

- `src/background/job-manager.ts`: orchestrates explicit translation actions, duplicate protection, runtime state, and status updates.
- `src/background/job-state.ts`: typed storage helpers for tab job state.
- `src/background/action-status.ts`: badge/status helpers.
- `src/background/queue-state.ts`: typed storage helpers for queued image items and queue counts.
- `src/background/queue-flow.ts`: captures right-clicked images into queue items and submits the queue as a single Hanako project/job.
- `src/background/translation-cache.ts`: small hash-based cache for recent rendered outputs.
- `src/content/dom-replacer.ts`: add clear/restore behavior.
- `src/content/content-entry.ts`: handle `HANAKO_CLEAR_TRANSLATIONS`.
- `src/popup/Popup.tsx`: show status, queue count, send queue, clear queue, and current job controls.
- `src/popup/popup-actions.ts`: add messages for clear/current job/status and queue operations.
- `src/background/context-menu.ts`: keep `Translate with Hanako`, add `Queue to Hanako`, and add `Send queue` as its submenu item.
- `src/background/service-worker.ts`: route all popup/context menu actions through the job manager.

Existing modules should remain the source of truth for:

- Detecting images.
- Capturing browser-side bitmap bytes.
- Submitting Hanako jobs.
- Polling Hanako completion.
- Building rendered image replacement URLs.

## Error Handling

Errors should be user-visible and testable:

- Hanako unavailable: show connection failure and keep actions available for retry.
- Duplicate action: return the active job/status instead of creating another job.
- Capture failure: explain that the image bytes could not be extracted.
- Queue add failure: explain that the image could not be captured and was not queued.
- Queue send with no items: show that the queue is empty and do not create a Hanako job.
- Queue send failure: preserve the queue so the user can retry.
- Hanako job failed: surface the job error message and link the job where available.
- Timeout: show that the job is still processing and keep the WebUI/job link.
- Replacement failure: show the job completed but page replacement failed.

All background async handlers should catch failures and return structured responses so extension console logs do not end at unhandled `Failed to fetch` errors.

## Testing

Add focused tests for:

- Job manager duplicate protection and state transitions.
- Popup actions for translate, clear, status, and current job.
- Context menu creation and dispatch, including `Queue to Hanako` and its `Send queue` submenu.
- Queue state add, count, clear, ordering, and send behavior.
- Queue jobs create one Hanako project and do not send replacement messages to the content script.
- Hanako base URL validation requires a valid server address and explicit port before saving.
- Clear/restore behavior for normal images, `srcset`, and `<picture>` sources.
- Action badge status helpers.
- Translation cache keying by image hash, target language, and Hanako base URL.
- Image resize helper behavior.
- Existing active-tab and right-click capture/send flows remain passing.

Manual QA after implementation:

- Load unpacked extension in Chrome.
- Point it at the Tower Hanako WebUI.
- Right-click translate a test image.
- Queue several right-clicked images one by one and confirm the badge/menu counter increments.
- Send the queue and confirm Hanako receives one multi-page project in queue order.
- Confirm queue project output is accessed from Hanako WebUI and no browser images are replaced.
- Use popup page translation on a manga/image tab.
- Confirm duplicate clicks do not create duplicate jobs.
- Confirm popup status survives closing/reopening the popup.
- Confirm clear translations restores original images.
- Confirm failures are visible in popup/status instead of only the extension console.
