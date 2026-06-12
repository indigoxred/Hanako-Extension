# Extension Glossary Settings Design

## Goal

Hanako-Extension should let the user choose which Hanako glossary groups are used by "Translate with Hanako" jobs. New glossary terms must default to `None (Disabled)` so extension-triggered translations do not create glossary entries unless the user explicitly chooses a storage group.

## Scope

This feature spans two repositories:

- `indigoxred/Hanako-Extension`: store glossary preferences, display available Hanako glossary groups in the options page, and include selected glossary fields in extension translation requests.
- `indigoxred/Hanako`: accept those fields on extension translation endpoints and store them in the created job settings so the existing job runner glossary behavior applies.

The feature does not add per-translation prompts, new glossary-management screens, or automatic group creation.

## Extension Settings

`ExtensionSettings` gains:

- `glossaryScopeIds: string[]`
- `autoGlossaryStorageScopeId: string | null`

Defaults:

- `glossaryScopeIds` is `[]`
- `autoGlossaryStorageScopeId` is `null`

Loading settings should tolerate old stored data and invalid shapes. Saving should trim and drop empty IDs, deduplicate selected group IDs, and save the new glossary-term target as `null` when disabled or blank.

## Options UI

The options page will fetch glossary scopes from the configured Hanako server using the current target language. It will show:

- a checklist labeled "Glossary groups"
- a select labeled "New glossary terms"
- the select's first option as `None (Disabled)`

Changing the target language clears selected glossary groups and resets new glossary terms to disabled, matching Hanako Web UI behavior. If the glossary fetch fails, the options page keeps the rest of the settings editable and shows a status message instead of blocking save.

## Translation Request Flow

Both extension translation paths use the saved glossary settings:

- active-page batch flow
- right-click single-image flow

`translateImage` and `translatePage` include `glossaryScopeIds` only when at least one group is selected. They include `autoGlossaryStorageScopeId` only when a group is selected for new glossary terms.

## Hanako API Flow

Hanako's extension request schemas accept optional `glossaryScopeIds` and `autoGlossaryStorageScopeId` fields. The extension routes pass them into `jobs.create({ settings })` so the existing Koharu job runner reads the same settings keys already used by Web UI jobs.

Existing extension requests without glossary fields remain valid and continue to create jobs with no glossary groups and disabled new-term storage.

## Error Handling

The extension should not fail to load options if Hanako is offline or the glossary endpoint fails. The page should preserve saved values and let the user adjust base URL or target language.

Hanako should validate glossary fields through the shared contract schema. Invalid blank IDs are rejected at request parsing time; omitted fields preserve backward compatibility.

## Testing

Extension tests cover:

- settings defaults and persistence for glossary fields
- fetching glossary scopes from Hanako
- client payloads for single-image and page-batch jobs
- active-page and context-menu flows forwarding saved glossary fields
- options UI defaulting new glossary terms to `None (Disabled)`

Hanako tests cover:

- extension request schemas accepting glossary fields
- single-image and page-batch extension routes storing glossary settings on created jobs
- old requests without glossary fields still working
