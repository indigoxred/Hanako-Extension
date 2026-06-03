import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { checkHanakoConnection } from "../background/hanako-client.js";
import {
  DEFAULT_EXTENSION_SETTINGS,
  loadExtensionSettings,
  type ExtensionSettings
} from "../options/extension-settings.js";
import { createOpenWebUiUrl } from "./popup-actions.js";

function PopupApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(
    DEFAULT_EXTENSION_SETTINGS
  );
  const [status, setStatus] = useState("Checking");

  useEffect(() => {
    void loadExtensionSettings()
      .then(async (loaded) => {
        setSettings(loaded);
        const ok = await checkHanakoConnection({
          baseUrl: loaded.hanakoBaseUrl
        });
        setStatus(ok ? "Ready" : "Unavailable");
      })
      .catch(() => setStatus("Unavailable"));
  }, []);

  return (
    <main>
      <h1>Hanako</h1>
      <p>{status}</p>
      <button
        type="button"
        onClick={() => {
          void chrome.runtime.sendMessage({ type: "HANAKO_DETECT_ACTIVE_TAB" });
        }}
      >
        Detect manga images
      </button>
      <a href={createOpenWebUiUrl(settings)} target="_blank" rel="noreferrer">
        Open WebUI
      </a>
    </main>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Popup root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
);
