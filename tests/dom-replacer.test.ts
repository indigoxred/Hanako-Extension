import { describe, expect, it } from "vitest";

import { replaceDetectedImages } from "../src/content/dom-replacer.js";

describe("content DOM replacer", () => {
  it("replaces detected image sources by DOM index", () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img src="https://manga.example/page-1.png" width="800" height="1200" />
      <img src="https://manga.example/page-2.png" width="800" height="1200" />
    `;

    const result = replaceDetectedImages(
      [
        {
          domIndex: 1,
          renderedUrl: "http://hanako.test/api/jobs/job_1/pages/page_2/rendered"
        }
      ],
      documentRef
    );
    const images = Array.from(documentRef.querySelectorAll("img"));

    expect(result).toEqual({ replaced: 1 });
    expect(images[0]?.getAttribute("src")).toBe(
      "https://manga.example/page-1.png"
    );
    expect(images[1]?.getAttribute("src")).toBe(
      "http://hanako.test/api/jobs/job_1/pages/page_2/rendered"
    );
    expect(images[1]?.dataset.hanakoOriginalSrc).toBe(
      "https://manga.example/page-2.png"
    );
    expect(images[1]?.dataset.hanakoRenderedSrc).toBe(
      "http://hanako.test/api/jobs/job_1/pages/page_2/rendered"
    );
  });

  it("ignores replacement instructions for missing DOM indexes", () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img src="https://manga.example/page-1.png" width="800" height="1200" />
    `;

    const result = replaceDetectedImages(
      [{ domIndex: 3, renderedUrl: "http://hanako.test/rendered.png" }],
      documentRef
    );

    expect(result).toEqual({ replaced: 0 });
    expect(documentRef.querySelector("img")?.getAttribute("src")).toBe(
      "https://manga.example/page-1.png"
    );
  });
});
