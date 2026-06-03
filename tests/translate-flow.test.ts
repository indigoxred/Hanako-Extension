import { describe, expect, it } from "vitest";

import { translateActiveTab } from "../src/background/translate-flow.js";

describe("extension translate flow", () => {
  it("detects active-tab images, creates a page job, and opens the WebUI job", async () => {
    const calls: string[] = [];
    const openedUrls: string[] = [];
    const result = await translateActiveTab({
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787/",
        targetLanguage: "ja"
      }),
      openTab: async (url) => {
        openedUrls.push(url);
      },
      queryActiveTab: async () => ({ id: 7 }),
      sendDetectImagesMessage: async (tabId) => {
        calls.push(`message:${tabId}`);
        return {
          images: [
            {
              domIndex: 0,
              height: 1200,
              pageUrl: "https://manga.example/chapter-1",
              url: "https://manga.example/page-1.png",
              width: 800
            }
          ],
          ok: true,
          pageUrl: "https://manga.example/chapter-1"
        };
      },
      executeContentScript: async (tabId) => {
        calls.push(`script:${tabId}`);
      },
      translatePage: async (input) => {
        expect(input).toMatchObject({
          baseUrl: "http://localhost:8787/",
          images: [
            {
              domIndex: 0,
              height: 1200,
              pageUrl: "https://manga.example/chapter-1",
              url: "https://manga.example/page-1.png",
              width: 800
            }
          ],
          targetLanguage: "ja"
        });
        return { job: { id: "job_1" } };
      }
    });

    expect(result).toEqual({ imageCount: 1, jobId: "job_1", ok: true });
    expect(calls).toEqual(["script:7", "message:7"]);
    expect(openedUrls).toEqual(["http://localhost:8787/jobs/job_1"]);
  });

  it("reports a failure when no active tab is available", async () => {
    const result = await translateActiveTab({
      loadSettings: async () => ({
        hanakoBaseUrl: "http://localhost:8787",
        targetLanguage: "en"
      }),
      openTab: async () => undefined,
      queryActiveTab: async () => ({}),
      sendDetectImagesMessage: async () => ({ images: [], ok: true }),
      executeContentScript: async () => undefined,
      translatePage: async () => ({ job: { id: "job_1" } })
    });

    expect(result).toEqual({
      error: "No active tab was available",
      ok: false
    });
  });
});
