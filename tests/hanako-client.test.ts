import { describe, expect, it } from "vitest";

import {
  checkHanakoConnection,
  translateImage,
  translatePage
} from "../src/background/hanako-client.js";
import { pollJobOnce } from "../src/background/job-poller.js";

describe("Hanako extension client", () => {
  it("checks Hanako health against the configured base URL", async () => {
    const ok = await checkHanakoConnection({
      baseUrl: "http://hanako.test",
      fetch: async (input) => {
        expect(input).toBe("http://hanako.test/healthz");
        return new Response(
          JSON.stringify({ ok: true, service: "hanako-api" })
        );
      }
    });

    expect(ok).toBe(true);
  });

  it("polls extension jobs against the configured base URL", async () => {
    const result = await pollJobOnce({
      baseUrl: "http://hanako.test",
      jobId: "job_1",
      fetch: async (input) => {
        expect(input).toBe("http://hanako.test/api/extension/jobs/job_1");
        return new Response(JSON.stringify({ job: { id: "job_1" } }));
      }
    });

    expect(result).toEqual({ job: { id: "job_1" } });
  });

  it("creates a single-image extension job", async () => {
    const result = await translateImage({
      baseUrl: "http://hanako.test/",
      fetch: async (input, init) => {
        expect(input).toBe("http://hanako.test/api/extension/translate-image");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ "content-type": "application/json" });
        expect(JSON.parse(String(init?.body))).toEqual({
          image: {
            height: 1200,
            pageUrl: "https://manga.example/chapter-1",
            url: "https://manga.example/page-1.png",
            width: 800
          },
          targetLanguage: "en"
        });
        return new Response(JSON.stringify({ job: { id: "job_1" } }), {
          status: 201
        });
      },
      image: {
        height: 1200,
        pageUrl: "https://manga.example/chapter-1",
        url: "https://manga.example/page-1.png",
        width: 800
      },
      targetLanguage: "en"
    });

    expect(result).toEqual({ job: { id: "job_1" } });
  });

  it("creates a page-batch extension job", async () => {
    const result = await translatePage({
      baseUrl: "http://hanako.test",
      fetch: async (input, init) => {
        expect(input).toBe("http://hanako.test/api/extension/translate-page");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
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
        return new Response(JSON.stringify({ job: { id: "job_2" } }), {
          status: 201
        });
      },
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

    expect(result).toEqual({ job: { id: "job_2" } });
  });
});
