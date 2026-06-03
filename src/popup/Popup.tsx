import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { checkHanakoConnection } from "../background/hanako-client.js";
import {
  DEFAULT_EXTENSION_SETTINGS,
  loadExtensionSettings,
  type ExtensionSettings
} from "../options/extension-settings.js";
import {
  createDetectActiveTabMessage,
  createOpenWebUiUrl,
  createTranslateActiveTabMessage
} from "./popup-actions.js";

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
          setStatus("Detecting");
          void chrome.runtime
            .sendMessage(createDetectActiveTabMessage())
            .then((result: { imageCount?: number; ok?: boolean }) => {
              setStatus(
                result.ok
                  ? `Found ${result.imageCount ?? 0} images`
                  : "Detection failed"
              );
            })
            .catch(() => setStatus("Detection failed"));
        }}
      >
        Detect manga images
      </button>
      <button
        type="button"
        onClick={() => {
          setStatus("Creating job");
          void chrome.runtime
            .sendMessage(createTranslateActiveTabMessage())
            .then(
              (result: {
                error?: string;
                imageCount?: number;
                ok?: boolean;
              }) => {
                setStatus(
                  result.ok
                    ? `Created job from ${result.imageCount ?? 0} images`
                    : (result.error ?? "Translation failed")
                );
              }
            )
            .catch(() => setStatus("Translation failed"));
        }}
      >
        Translate page
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
