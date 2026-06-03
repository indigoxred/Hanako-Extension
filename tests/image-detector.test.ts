import { describe, expect, it } from "vitest";

import { detectImages } from "../src/content/image-detector.js";

describe("detectImages", () => {
  it("returns page-sized image candidates and filters small images", () => {
    document.body.innerHTML = `
      <img src="tiny.png" width="10" height="10">
      <img src="page.png" width="640" height="960">
      <img width="800" height="1200">
    `;

    expect(detectImages(document)).toEqual([
      { src: "page.png", width: 640, height: 960, domIndex: 1 }
    ]);
  });
});
