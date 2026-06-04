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

## Release Packages

Publishing a GitHub Release runs the `Release Chrome extension` workflow. It builds
the extension, zips the `dist/` directory as `hanako-extension-chrome.zip`, and uploads
that package to the release. The same workflow can be run manually against an existing
release tag.

## Hanako Connection

The extension defaults to `http://localhost:8787` and stores the configured
Hanako base URL plus target language in extension storage.

Normal translation flows do not force-open the Hanako WebUI. The popup still offers
an explicit WebUI link, but active-tab and context-menu translation submit auto-mode
jobs, poll until completion, and replace rendered images in-place.

Image forwarding prefers browser-side bytes:

- When the extension can fetch the image, it sends `bytesBase64` and `mediaType` to
  Hanako.
- If browser-side fetch is blocked, Hanako falls back to the absolute image URL.
- Detected images use resolved `currentSrc` values and stable `data-hanako-dom-id`
  markers so replacement can survive relative URLs and reader DOM updates.

CI runs build, typecheck, lint, format, and tests on pushes and pull requests to
`main`.
