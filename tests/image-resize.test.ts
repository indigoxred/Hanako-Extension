import { describe, expect, it } from "vitest";

import { calculateBoundedImageSize } from "../src/background/image-resize.js";

describe("image resize", () => {
  it("keeps images within the max dimension while preserving aspect ratio", () => {
    expect(
      calculateBoundedImageSize({
        height: 2000,
        maxDimension: 1800,
        width: 4000
      })
    ).toEqual({
      height: 900,
      width: 1800
    });
  });

  it("keeps smaller images unchanged", () => {
    expect(calculateBoundedImageSize({ height: 1200, width: 800 })).toEqual({
      height: 1200,
      width: 800
    });
  });
});
