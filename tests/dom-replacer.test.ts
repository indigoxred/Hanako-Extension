import { describe, expect, it } from "vitest";

import {
  clearDetectedImageReplacements,
  reapplyStoredReplacements,
  replaceDetectedImages
} from "../src/content/dom-replacer.js";

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

  it("prefers stable Hanako DOM IDs and disables competing responsive sources", () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <picture>
        <source srcset="https://manga.example/page-1-large.webp 2x" />
        <img
          data-hanako-dom-id="hanako-img-1"
          src="https://manga.example/page-1.png"
          srcset="https://manga.example/page-1-large.png 2x"
          width="800"
          height="1200"
        />
      </picture>
      <img data-hanako-dom-id="hanako-img-2" src="https://manga.example/page-2.png" width="800" height="1200" />
    `;

    const result = replaceDetectedImages(
      [
        {
          domId: "hanako-img-2",
          domIndex: 0,
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
  });

  it("reapplies stored replacements when reader pages recycle image nodes", () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img
        data-hanako-original-src="https://manga.example/page-1.png"
        data-hanako-rendered-src="http://hanako.test/rendered.png"
        src="https://manga.example/page-1.png"
        width="800"
        height="1200"
      />
    `;

    expect(reapplyStoredReplacements(documentRef)).toEqual({ replaced: 1 });
    expect(documentRef.querySelector("img")?.getAttribute("src")).toBe(
      "http://hanako.test/rendered.png"
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

  it("restores original image sources and picture sources", () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <picture>
        <source srcset="https://manga.example/page-1-large.webp 2x" />
        <img
          src="https://manga.example/page-1.png"
          srcset="https://manga.example/page-1-large.png 2x"
        />
      </picture>
    `;

    replaceDetectedImages(
      [{ domIndex: 0, renderedUrl: "http://localhost:8787/rendered.png" }],
      documentRef
    );

    expect(clearDetectedImageReplacements(documentRef)).toEqual({
      restored: 1
    });
    const image = documentRef.querySelector("img");
    const source = documentRef.querySelector("source");
    expect(image?.getAttribute("src")).toBe("https://manga.example/page-1.png");
    expect(image?.getAttribute("srcset")).toBe(
      "https://manga.example/page-1-large.png 2x"
    );
    expect(source?.getAttribute("srcset")).toBe(
      "https://manga.example/page-1-large.webp 2x"
    );
    expect(reapplyStoredReplacements(documentRef)).toEqual({ replaced: 0 });
  });
});
