import { describe, expect, it } from "vitest";

import {
  clearTabJobState,
  getTabJobState,
  setTabJobState,
  type JobStateStorageArea
} from "../src/background/job-state.js";

describe("job state", () => {
  it("stores and clears the latest tab job state", async () => {
    const storage = createMemoryStorage();

    await setTabJobState(storage, 7, {
      jobId: "job_1",
      message: "Running",
      status: "running"
    });

    expect(await getTabJobState(storage, 7)).toMatchObject({
      jobId: "job_1",
      status: "running"
    });

    await clearTabJobState(storage, 7);
    expect(await getTabJobState(storage, 7)).toBeUndefined();
  });
});

function createMemoryStorage(): JobStateStorageArea {
  const data = new Map<string, unknown>();

  return {
    async get(keys) {
      const keyList = Array.isArray(keys) ? keys : Object.keys(keys);

      return Object.fromEntries(
        keyList.map((key) => [
          key,
          data.get(key) ?? (!Array.isArray(keys) ? keys[key] : undefined)
        ])
      );
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value);
      }
    }
  };
}
