import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { checkHanakoConnection } from "../background/hanako-client.js";
import {
  DEFAULT_EXTENSION_SETTINGS,
  loadExtensionSettings,
  type ExtensionSettings
} from "../options/extension-settings.js";
import {
  createClearQueueMessage,
  createClearTranslationsMessage,
  createGetActiveTabJobStateMessage,
  createGetQueueStatusMessage,
  createOpenJobUrl,
  createOpenWebUiUrl,
  createSendQueueMessage
} from "./popup-actions.js";

interface QueueStatusResult {
  count?: number;
  error?: string;
  ok?: boolean;
}

interface TabJobStateResult {
  error?: string;
  ok?: boolean;
  state?: {
    jobId?: string;
    message: string;
    status: string;
    updatedAt: string;
  };
}

interface SendQueueResult {
  error?: string;
  imageCount?: number;
  jobId?: string;
  ok?: boolean;
  status?: "submitted";
}

function PopupApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(
    DEFAULT_EXTENSION_SETTINGS
  );
  const [jobUrl, setJobUrl] = useState("");
  const [queueCount, setQueueCount] = useState(0);
  const [status, setStatus] = useState("Checking");

  useEffect(() => {
    void loadExtensionSettings()
      .then(async (loaded) => {
        setSettings(loaded);
        const [ok, hasJobStatus] = await Promise.all([
          checkHanakoConnection({
            baseUrl: loaded.hanakoBaseUrl
          }),
          refreshJobStatus(loaded)
        ]);
        if (!hasJobStatus) {
          setStatus(ok ? "Ready" : "Unavailable");
        }
      })
      .catch(() => setStatus("Unavailable"));
    void refreshQueueCount();
  }, []);

  function refreshQueueCount() {
    return chrome.runtime
      .sendMessage(createGetQueueStatusMessage())
      .then((result: QueueStatusResult) => {
        setQueueCount(result.count ?? 0);
        return result.count ?? 0;
      })
      .catch(() => {
        setQueueCount(0);
        return 0;
      });
  }

  function refreshJobStatus(currentSettings: ExtensionSettings) {
    return chrome.runtime
      .sendMessage(createGetActiveTabJobStateMessage())
      .then((result: TabJobStateResult) => {
        if (!result.ok || !result.state) {
          return false;
        }

        setStatus(result.state.message);

        if (result.state.jobId) {
          setJobUrl(
            createOpenJobUrl({
              hanakoBaseUrl: currentSettings.hanakoBaseUrl,
              jobId: result.state.jobId
            })
          );
        }

        return true;
      })
      .catch(() => false);
  }

  function sendQueue() {
    setStatus("Sending queue");
    void chrome.runtime
      .sendMessage(createSendQueueMessage())
      .then((result: SendQueueResult) => {
        if (result.ok && result.jobId) {
          setQueueCount(0);
          setJobUrl(
            createOpenJobUrl({
              hanakoBaseUrl: settings.hanakoBaseUrl,
              jobId: result.jobId
            })
          );
          setStatus(`Queued ${result.imageCount ?? 0} pages in Hanako`);
          return;
        }

        setStatus(result.error ?? "Queue send failed");
      })
      .catch(() => setStatus("Queue send failed"));
  }

  function clearQueue() {
    setStatus("Clearing queue");
    void chrome.runtime
      .sendMessage(createClearQueueMessage())
      .then((result: QueueStatusResult) => {
        setQueueCount(result.count ?? 0);
        setStatus(
          result.ok ? "Queue cleared" : (result.error ?? "Clear failed")
        );
      })
      .catch(() => setStatus("Clear failed"));
  }

  function clearTranslations() {
    setStatus("Clearing translations");
    void chrome.runtime
      .sendMessage(createClearTranslationsMessage())
      .then((result: { error?: string; ok?: boolean; restored?: number }) => {
        setStatus(
          result.ok
            ? `Restored ${result.restored ?? 0} images`
            : (result.error ?? "Clear translations failed")
        );
      })
      .catch(() => setStatus("Clear translations failed"));
  }

  return (
    <main>
      <h1>Hanako</h1>
      <p>{status}</p>
      <p>Queued pages: {queueCount}</p>
      <button
        disabled={queueCount <= 0}
        type="button"
        onClick={() => sendQueue()}
      >
        Send queue
      </button>
      <button
        disabled={queueCount <= 0}
        type="button"
        onClick={() => clearQueue()}
      >
        Clear queue
      </button>
      <button type="button" onClick={() => clearTranslations()}>
        Clear translations
      </button>
      {jobUrl ? (
        <a href={jobUrl} target="_blank" rel="noreferrer">
          Open current job
        </a>
      ) : null}
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
