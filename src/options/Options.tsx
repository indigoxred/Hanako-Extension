import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  getGlossaryScopes,
  getSettingsProfiles,
  type GlossaryScope,
  type SettingsProfileSummary
} from "../background/hanako-client.js";
import {
  DEFAULT_EXTENSION_SETTINGS,
  getDefaultStorage,
  loadExtensionSettings,
  saveExtensionSettings,
  type ExtensionSettings
} from "./extension-settings.js";

function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(
    DEFAULT_EXTENSION_SETTINGS
  );
  const [glossaryScopes, setGlossaryScopes] = useState<GlossaryScope[]>([]);
  const [glossaryStatus, setGlossaryStatus] = useState("");
  const [profiles, setProfiles] = useState<SettingsProfileSummary[]>([]);
  const [profileStatus, setProfileStatus] = useState("");
  const [status, setStatus] = useState("Loading");

  useEffect(() => {
    void loadExtensionSettings()
      .then((loaded) => {
        setSettings(loaded);
        setStatus("");
      })
      .catch((error) =>
        setStatus(error instanceof Error ? error.message : "Load failed")
      );
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!settings.hanakoBaseUrl.trim()) {
      setProfiles([]);
      return;
    }

    setProfileStatus("Loading profiles");
    void getSettingsProfiles({ baseUrl: settings.hanakoBaseUrl })
      .then(({ profiles }) => {
        if (cancelled) {
          return;
        }

        const profileIds = new Set(profiles.map((profile) => profile.id));
        setProfiles(profiles);
        setProfileStatus("");
        setSettings((current) => ({
          ...current,
          profileId:
            current.profileId && profileIds.has(current.profileId)
              ? current.profileId
              : null
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setProfiles([]);
        setProfileStatus(
          error instanceof Error ? error.message : "Profiles unavailable"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [settings.hanakoBaseUrl]);

  useEffect(() => {
    let cancelled = false;

    if (!settings.hanakoBaseUrl.trim()) {
      setGlossaryScopes([]);
      return;
    }

    setGlossaryStatus("Loading glossary groups");
    void getGlossaryScopes({
      baseUrl: settings.hanakoBaseUrl,
      targetLanguage: settings.targetLanguage
    })
      .then(({ scopes }) => {
        if (cancelled) {
          return;
        }

        const scopeIds = new Set(scopes.map((scope) => scope.id));
        setGlossaryScopes(scopes);
        setGlossaryStatus("");
        setSettings((current) => ({
          ...current,
          autoGlossaryStorageScopeId:
            current.autoGlossaryStorageScopeId &&
            scopeIds.has(current.autoGlossaryStorageScopeId)
              ? current.autoGlossaryStorageScopeId
              : null,
          glossaryScopeIds: (current.glossaryScopeIds ?? []).filter((scopeId) =>
            scopeIds.has(scopeId)
          )
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setGlossaryScopes([]);
        setGlossaryStatus(
          error instanceof Error ? error.message : "Glossary groups unavailable"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [settings.hanakoBaseUrl, settings.targetLanguage]);

  return (
    <main>
      <h1>Hanako options</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveExtensionSettings(getDefaultStorage(), settings)
            .then(() => setStatus("Saved"))
            .catch((error) =>
              setStatus(error instanceof Error ? error.message : "Save failed")
            );
        }}
      >
        <label>
          Hanako base URL
          <input
            value={settings.hanakoBaseUrl}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                hanakoBaseUrl: event.target.value
              }))
            }
          />
        </label>
        <label>
          Hanako profile
          <select
            value={settings.profileId ?? ""}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                profileId: event.target.value || null
              }))
            }
          >
            <option value="">Default settings</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        {profileStatus ? <p role="status">{profileStatus}</p> : null}
        <label>
          Target language
          <input
            value={settings.targetLanguage}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                autoGlossaryStorageScopeId: null,
                glossaryScopeIds: [],
                targetLanguage: event.target.value
              }))
            }
          />
        </label>
        <label>
          <input
            checked={settings.queueContextMenusEnabled}
            type="checkbox"
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                queueContextMenusEnabled: event.target.checked
              }))
            }
          />
          Show queue context menu actions
        </label>
        <fieldset>
          <legend>Glossary groups</legend>
          {glossaryScopes.length > 0 ? (
            glossaryScopes.map((scope) => (
              <label key={scope.id}>
                <input
                  checked={(settings.glossaryScopeIds ?? []).includes(scope.id)}
                  type="checkbox"
                  onChange={() =>
                    setSettings((current) => ({
                      ...current,
                      glossaryScopeIds: toggleGlossaryScopeId(
                        current.glossaryScopeIds ?? [],
                        scope.id
                      )
                    }))
                  }
                />
                {scopeLabel(scope)}
              </label>
            ))
          ) : (
            <p>No glossary groups found</p>
          )}
        </fieldset>
        <label>
          New glossary terms
          <select
            value={settings.autoGlossaryStorageScopeId ?? ""}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                autoGlossaryStorageScopeId: event.target.value || null
              }))
            }
          >
            <option value="">None (Disabled)</option>
            {glossaryScopes.map((scope) => (
              <option key={scope.id} value={scope.id}>
                {scopeLabel(scope)}
              </option>
            ))}
          </select>
        </label>
        {glossaryStatus ? <p role="status">{glossaryStatus}</p> : null}
        <button type="submit">Save</button>
      </form>
      {status ? <p role="status">{status}</p> : null}
    </main>
  );
}

function toggleGlossaryScopeId(scopeIds: string[], scopeId: string): string[] {
  return scopeIds.includes(scopeId)
    ? scopeIds.filter((current) => current !== scopeId)
    : [...scopeIds, scopeId];
}

function scopeLabel(scope: GlossaryScope): string {
  return scope.parentId ? `  ${scope.name}` : scope.name;
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Options root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
