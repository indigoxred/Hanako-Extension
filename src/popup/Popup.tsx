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
    phase?: string;
    status: string;
    updatedAt: string;
  };
}

interface SendQueueResult {
  error?: string;
  imageCount?: number;
  jobId?: string;
  jobUrl?: string;
  ok?: boolean;
  status?: "submitted";
}

const SUCCESS_STATUS_RESET_MS = 4000;

function PopupApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(
    DEFAULT_EXTENSION_SETTINGS
  );
  const [jobUrl, setJobUrl] = useState("");
  const [jobPhase, setJobPhase] = useState("");
  const [queueCount, setQueueCount] = useState(0);
  const [status, setStatus] = useState("Checking");

  useEffect(() => {
    let currentSettings = DEFAULT_EXTENSION_SETTINGS;
    let disposed = false;

    async function loadAndRefresh() {
      try {
        const loaded = await loadExtensionSettings();
        currentSettings = loaded;

        if (disposed) {
          return;
        }

        setSettings(loaded);
        const [ok, hasJobStatus] = await Promise.all([
          checkHanakoConnection({
            baseUrl: loaded.hanakoBaseUrl
          }),
          refreshJobStatus(loaded)
        ]);

        if (!disposed && !hasJobStatus) {
          setStatus(ok ? "Ready" : "Unavailable");
        }
      } catch {
        if (!disposed) {
          setStatus("Unavailable");
        }
      }
    }

    void loadAndRefresh();
    void refreshQueueCount();
    const refreshInterval = window.setInterval(() => {
      void refreshQueueCount();
      void refreshJobStatus(currentSettings);
    }, 1500);

    return () => {
      disposed = true;
      window.clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    if (!isTransientSuccessStatus(status)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setStatus("Ready");
    }, SUCCESS_STATUS_RESET_MS);

    return () => window.clearTimeout(timeout);
  }, [status]);

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
        setJobPhase(result.state.phase ?? "");

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
            result.jobUrl ??
              createOpenJobUrl({
                hanakoBaseUrl: settings.hanakoBaseUrl,
                jobId: result.jobId
              })
          );
          setStatus(`Queued ${result.imageCount ?? 0} pages in Hanako`);
          setJobPhase("submitted");
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
      {jobPhase ? <p>Current phase: {jobPhase}</p> : null}
      <p>Queued pages: {queueCount}</p>
      <button
        disabled={queueCount <= 0}
        type="button"
        onClick={() => sendQueue()}
      >
        Finalize Queue
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
        <div className="popup-link-row">
          <a href={jobUrl} target="_blank" rel="noreferrer">
            Open current job
          </a>
          <a
            href={createOpenWebUiUrl(settings)}
            target="_blank"
            rel="noreferrer"
          >
            Open WebUI
          </a>
        </div>
      ) : null}
      {!jobUrl ? (
        <div className="popup-link-row">
          <a
            href={createOpenWebUiUrl(settings)}
            target="_blank"
            rel="noreferrer"
          >
            Open WebUI
          </a>
        </div>
      ) : null}
    </main>
  );
}

function isTransientSuccessStatus(status: string): boolean {
  return (
    status === "Queue cleared" ||
    status.startsWith("Queued ") ||
    status.startsWith("Restored ")
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
