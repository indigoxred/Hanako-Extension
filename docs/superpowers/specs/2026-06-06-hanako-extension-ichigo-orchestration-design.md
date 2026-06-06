# Hanako-Extension Ichigo-Orchestration Design

## Goal

Make Hanako-Extension feel like a complete browser extension by adopting the relevant orchestration patterns from the known-good Ichigo extension while keeping Hanako's server-side translation, OCR, provider settings, and rendering as the source of truth.

Image capture and submission already work. This pass focuses on the extension features around that pipeline: explicit user actions, status, duplicate protection, restore/clear behavior, and safer payload handling.

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

The context menu should expose explicit commands:

- `Translate image with Hanako` for right-click image translation.
- `Translate page with Hanako` for the current page.
- `Clear Hanako translations` for restoring original page images.

The browser action should expose lightweight state:

- Idle/ready state when Hanako is reachable.
- Running state while an explicit translation action is in progress.
- Success state when replacements were applied.
- Error state when the job fails or the extension cannot reach Hanako.

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

Additional settings are out of scope unless required by the implementation.

## Job Manager

Add a background job manager that coordinates popup and context-menu requests.

Responsibilities:

- Serialize repeated clicks for the same tab/action key.
- Prevent duplicate page jobs while one is already running for the same tab.
- Persist job status transitions so the popup can reopen and show what happened.
- Normalize errors from capture, Hanako upload, polling, replacement, and timeout.
- Update action badge state after each transition.

The manager should wrap the existing `translateActiveTab` and `translateContextMenuImage` flows rather than replacing them wholesale.

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
- `src/background/translation-cache.ts`: small hash-based cache for recent rendered outputs.
- `src/content/dom-replacer.ts`: add clear/restore behavior.
- `src/content/content-entry.ts`: handle `HANAKO_CLEAR_TRANSLATIONS`.
- `src/popup/Popup.tsx`: show status and controls.
- `src/popup/popup-actions.ts`: add messages for clear/current job/status.
- `src/background/context-menu.ts`: add page translate and clear menu items.
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
- Hanako job failed: surface the job error message and link the job where available.
- Timeout: show that the job is still processing and keep the WebUI/job link.
- Replacement failure: show the job completed but page replacement failed.

All background async handlers should catch failures and return structured responses so extension console logs do not end at unhandled `Failed to fetch` errors.

## Testing

Add focused tests for:

- Job manager duplicate protection and state transitions.
- Popup actions for translate, clear, status, and current job.
- Context menu creation and dispatch.
- Clear/restore behavior for normal images, `srcset`, and `<picture>` sources.
- Action badge status helpers.
- Translation cache keying by image hash, target language, and Hanako base URL.
- Image resize helper behavior.
- Existing active-tab and right-click capture/send flows remain passing.

Manual QA after implementation:

- Load unpacked extension in Chrome.
- Point it at the Tower Hanako WebUI.
- Right-click translate a test image.
- Use popup page translation on a manga/image tab.
- Confirm duplicate clicks do not create duplicate jobs.
- Confirm popup status survives closing/reopening the popup.
- Confirm clear translations restores original images.
- Confirm failures are visible in popup/status instead of only the extension console.
