import { describe, expect, it } from "vitest";

import { describeJobPhase } from "../src/background/job-poller.js";

describe("job phase descriptions", () => {
  it("uses the newest Hanako progress event as the current extension phase", () => {
    expect(
      describeJobPhase({
        job: { id: "job_1", status: "running" },
        progress: [
          {
            createdAt: "2026-06-07T00:00:00.000Z",
            label: "Import pages",
            message: "Imported 2 pages",
            status: "completed",
            step: "import_pages"
          },
          {
            createdAt: "2026-06-07T00:00:01.000Z",
            label: "Detect/OCR",
            message: "Detecting text regions and running OCR",
            status: "started",
            step: "detect_ocr"
          }
        ]
      })
    ).toEqual({
      message: "Detecting text regions and running OCR",
      phase: "detect_ocr"
    });
  });

  it("falls back to a status-based phase when no progress has been recorded", () => {
    expect(
      describeJobPhase({
        job: { id: "job_1", status: "rendering" }
      })
    ).toEqual({
      message: "Hanako job is rendering",
      phase: "rendering"
    });
  });
});
