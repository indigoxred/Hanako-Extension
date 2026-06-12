# Extension Glossary Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hanako glossary-group selection to Hanako-Extension translation jobs, with new glossary terms disabled by default.

**Architecture:** The extension persists glossary settings in `extension-settings.ts`, fetches glossary scopes through `hanako-client.ts`, and forwards selected values from every translation submission path. Hanako accepts those values on extension endpoints and stores them as normal job settings so the existing Koharu runner glossary code applies.

**Tech Stack:** TypeScript, React, Vitest, Fastify, Zod contracts, pnpm.

---

## File Structure

- Extension settings: `src/options/extension-settings.ts` owns saved defaults, migration tolerance, and normalization.
- Extension client: `src/background/hanako-client.ts` owns Hanako HTTP calls, glossary scope fetching, and translation payload shape.
- Extension UI: `src/options/Options.tsx` owns glossary controls and non-blocking scope-load status.
- Extension flows: `src/background/translate-flow.ts`, `src/background/context-menu-flow.ts`, and `src/background/queue-flow.ts` forward saved glossary settings.
- Extension tests: `tests/extension-settings.test.ts`, `tests/hanako-client.test.ts`, `tests/translate-flow.test.ts`, `tests/context-menu-flow.test.ts`, `tests/queue-flow.test.ts`, plus a source-level options UI test.
- Hanako contracts: `packages/contracts/src/extension.schema.ts` owns extension request validation.
- Hanako API: `apps/api/src/routes/extension.routes.ts` stores request glossary fields on job settings.
- Hanako tests: `packages/contracts/tests/contracts.test.ts` and `apps/api/tests/server.test.ts`.

### Task 1: Extension Settings

**Files:**

- Modify: `src/options/extension-settings.ts`
- Test: `tests/extension-settings.test.ts`

- [ ] **Step 1: Write the failing settings tests**

Add expectations that defaults include empty glossary groups and disabled storage, saved values are normalized, and invalid stored shapes load safely.

```ts
await expect(loadExtensionSettings(storage)).resolves.toEqual({
  autoGlossaryStorageScopeId: null,
  glossaryScopeIds: [],
  hanakoBaseUrl: "http://localhost:8787",
  queueContextMenusEnabled: true,
  targetLanguage: "en"
});

await saveExtensionSettings(storage, {
  autoGlossaryStorageScopeId: " scope_new ",
  glossaryScopeIds: [" scope_1 ", "", "scope_1", "scope_2"],
  hanakoBaseUrl: "http://tower.local:8787",
  queueContextMenusEnabled: false,
  targetLanguage: "ja"
});

await expect(loadExtensionSettings(storage)).resolves.toMatchObject({
  autoGlossaryStorageScopeId: "scope_new",
  glossaryScopeIds: ["scope_1", "scope_2"]
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm test -- tests/extension-settings.test.ts`
Expected: FAIL because `ExtensionSettings` has no glossary fields.

- [ ] **Step 3: Implement settings normalization**

Add `glossaryScopeIds` and `autoGlossaryStorageScopeId` defaults, normalize arrays with trimmed unique non-empty strings, and normalize storage scope to `null` when blank.

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `pnpm test -- tests/extension-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `Add extension glossary settings`

### Task 2: Extension Hanako Client

**Files:**

- Modify: `src/background/hanako-client.ts`
- Test: `tests/hanako-client.test.ts`

- [ ] **Step 1: Write failing client tests**

Add tests for `getGlossaryScopes`, `translateImage` with glossary fields, and `translatePage` omitting empty glossary values.

```ts
const scopes = await getGlossaryScopes({
  baseUrl: "http://hanako.test",
  fetch: async (input) => {
    expect(input).toBe(
      "http://hanako.test/api/glossary/scopes?targetLanguage=ja"
    );
    return new Response(
      JSON.stringify({ scopes: [{ id: "scope_1", name: "Main" }] })
    );
  },
  targetLanguage: "ja"
});
expect(scopes.scopes).toEqual([{ id: "scope_1", name: "Main" }]);
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm test -- tests/hanako-client.test.ts`
Expected: FAIL because `getGlossaryScopes` and payload fields do not exist.

- [ ] **Step 3: Implement client support**

Add `GlossaryScope`, `GlossaryScopesResponse`, `getGlossaryScopes`, `glossaryScopeIds`, and `autoGlossaryStorageScopeId` to translation input types and POST bodies. Only include non-empty glossary arrays and non-null storage scope IDs.

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `pnpm test -- tests/hanako-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `Send glossary settings to Hanako`

### Task 3: Extension Flow Forwarding

**Files:**

- Modify: `src/background/translate-flow.ts`
- Modify: `src/background/context-menu-flow.ts`
- Modify: `src/background/queue-flow.ts`
- Test: `tests/translate-flow.test.ts`
- Test: `tests/context-menu-flow.test.ts`
- Test: `tests/queue-flow.test.ts`

- [ ] **Step 1: Write failing flow tests**

For each flow, return settings with:

```ts
{
  autoGlossaryStorageScopeId: "scope_new",
  glossaryScopeIds: ["scope_1"],
  hanakoBaseUrl: "http://localhost:8787",
  targetLanguage: "en"
}
```

Assert that the injected `translateImage` or `translatePage` receives both glossary fields.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `pnpm test -- tests/translate-flow.test.ts tests/context-menu-flow.test.ts tests/queue-flow.test.ts`
Expected: FAIL because the flows do not forward glossary settings.

- [ ] **Step 3: Implement flow forwarding**

Pass `settings.glossaryScopeIds` and `settings.autoGlossaryStorageScopeId` to `translateImage` and `translatePage` in all three flows.

- [ ] **Step 4: Run the tests and confirm GREEN**

Run: `pnpm test -- tests/translate-flow.test.ts tests/context-menu-flow.test.ts tests/queue-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `Forward glossary settings from extension flows`

### Task 4: Options UI Glossary Controls

**Files:**

- Modify: `src/options/Options.tsx`
- Test: `tests/options-ui.test.ts`

- [ ] **Step 1: Write failing source-level UI tests**

Add tests that `Options.tsx` imports `getGlossaryScopes`, renders `Glossary groups`, renders `New glossary terms`, includes `None (Disabled)`, and clears glossary selections when target language changes.

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm test -- tests/options-ui.test.ts`
Expected: FAIL because the options UI has no glossary controls.

- [ ] **Step 3: Implement UI controls**

Fetch glossary scopes after settings load and whenever base URL or target language changes. Render checkbox controls for selected groups and a select for `autoGlossaryStorageScopeId`, with an empty value labeled `None (Disabled)`.

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `pnpm test -- tests/options-ui.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `Add extension glossary options`

### Task 5: Hanako Extension API

**Files:**

- Modify: `packages/contracts/src/extension.schema.ts`
- Modify: `packages/contracts/tests/contracts.test.ts`
- Modify: `apps/api/src/routes/extension.routes.ts`
- Modify: `apps/api/tests/server.test.ts`

- [ ] **Step 1: Write failing Hanako contract and API tests**

Contract test parses:

```ts
ExtensionTranslateImageRequestSchema.parse({
  autoGlossaryStorageScopeId: "scope_new",
  glossaryScopeIds: ["scope_1"],
  image: { url: "https://manga.example/page.png" },
  targetLanguage: "en"
});
```

API tests submit glossary fields to `/api/extension/translate-image` and `/api/extension/translate-page`, then assert response job settings include `glossaryScopeIds` and `autoGlossaryStorageScopeId`.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `pnpm --filter @hanako/contracts test -- extension`
Run: `pnpm --filter @hanako/api test -- server`
Expected: FAIL because extension request schemas/routes ignore or reject glossary fields.

- [ ] **Step 3: Implement Hanako API support**

Add optional glossary fields to both extension request schemas and include them in `createExtensionJob` settings alongside `requestedBy` and `autoResume`.

- [ ] **Step 4: Run the tests and confirm GREEN**

Run: `pnpm --filter @hanako/contracts test`
Run: `pnpm --filter @hanako/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `Accept glossary settings from extension jobs`

### Task 6: Final Verification and Publishing

**Files:**

- All changed files in both repositories.

- [ ] **Step 1: Run extension verification**

Run: `pnpm typecheck`
Run: `pnpm lint`
Run: `pnpm test`
Run: `pnpm build`
Expected: all PASS.

- [ ] **Step 2: Run Hanako verification**

Run: `pnpm --filter @hanako/contracts typecheck`
Run: `pnpm --filter @hanako/contracts test`
Run: `pnpm --filter @hanako/api typecheck`
Run: `pnpm --filter @hanako/api lint`
Run: `pnpm --filter @hanako/api test`
Expected: all PASS.

- [ ] **Step 3: Publish and merge**

Create PRs for Hanako and Hanako-Extension, merge them into `main`, then delete stale feature branches.
