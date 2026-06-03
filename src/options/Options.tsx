import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

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
          Target language
          <input
            value={settings.targetLanguage}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                targetLanguage: event.target.value
              }))
            }
          />
        </label>
        <button type="submit">Save</button>
      </form>
      {status ? <p>{status}</p> : null}
    </main>
  );
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
