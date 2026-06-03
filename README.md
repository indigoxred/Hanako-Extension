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

## Hanako Connection

The extension defaults to `http://localhost:8787` and stores the configured
Hanako base URL plus target language in extension storage.
