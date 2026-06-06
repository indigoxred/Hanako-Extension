# Hanako Extension

Standalone Chromium Manifest V3 extension for Hanako.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

The build output is written to `dist/`. Load that directory through Chromium's
unpacked extension flow.

Because the extension fetches clicked image bytes in its service worker, queues
captured image bytes locally, and can submit jobs to any user-configured Hanako
server, the manifest declares host access for all URLs and `unlimitedStorage`.
After rebuilding a local unpacked install, reload the extension in
`chrome://extensions` before testing.

## Release Packages

Every push to `main` runs the merged `CI and Release` workflow. After build,
typecheck, lint, format, and tests pass, it zips the `dist/` directory as
`hanako-extension-chrome.zip` and publishes a GitHub Release tagged with the commit
short SHA, for example `sha-abc1234`. Pull requests run the same checks without
publishing a release.

## Hanako Connection

The extension defaults to `http://localhost:8787` and stores the configured
Hanako base URL plus target language in extension storage.

The Hanako base URL must include protocol, host, and port. Valid examples:

- `http://localhost:8787`
- `http://192.168.50.138:8787`

Invalid or portless values are rejected and do not overwrite the previous saved
server.

Normal translation flows do not force-open the Hanako WebUI. The popup still offers
an explicit WebUI link, but active-tab and context-menu translation submit auto-mode
jobs, poll until completion, and replace rendered images in-place.

## Context Menu

- `Translate with Hanako` translates the right-clicked image and replaces that
  image in the page after Hanako finishes rendering.
- `Queue to Hanako` stores the right-clicked image in the extension queue and
  increments the extension badge/menu counter.
- `Queue to Hanako > Send queue` sends queued images to Hanako as one normal
  multi-page job in queue order. Queue jobs do not replace browser images; use
  Hanako's WebUI/current job view to review and download the output.

The popup also exposes queue count, send queue, clear queue, clear translations,
and WebUI/current-job links.

Image forwarding prefers browser-side bytes:

- When the extension can fetch the image, it sends `bytesBase64` and `mediaType` to
  Hanako.
- If browser-side fetch fails, the extension stops before creating a job instead
  of sending a link-only request.
- Detected images use resolved `currentSrc` values and stable `data-hanako-dom-id`
  markers so replacement can survive relative URLs and reader DOM updates.

CI runs build, typecheck, lint, format, and tests on pushes and pull requests to
`main`; pushes to `main` also publish the Chrome extension release package.
