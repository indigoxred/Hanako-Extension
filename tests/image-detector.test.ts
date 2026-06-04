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
      {
        domId: expect.stringMatching(/^hanako-img-/),
        domIndex: 1,
        src: "http://localhost:3000/page.png",
        width: 640,
        height: 960
      }
    ]);
    expect(document.querySelectorAll("img")[1]?.dataset.hanakoDomId).toMatch(
      /^hanako-img-/
    );
  });

  it("prefers resolved currentSrc over raw relative src attributes", () => {
    document.body.innerHTML = `
      <img src="../relative/page.png" width="640" height="960">
    `;
    const image = document.querySelector("img");

    if (!image) {
      throw new Error("Expected test image");
    }

    Object.defineProperty(image, "currentSrc", {
      configurable: true,
      value: "https://cdn.example/chapter/page.png"
    });

    expect(detectImages(document)[0]).toMatchObject({
      src: "https://cdn.example/chapter/page.png"
    });
  });
});
