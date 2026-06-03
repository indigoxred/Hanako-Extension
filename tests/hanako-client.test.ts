import { describe, expect, it } from "vitest";

import { checkHanakoConnection } from "../src/background/hanako-client.js";
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
});
