import { describe, expect, it, vi } from "vitest";

import {
  clearDetectedImageReplacements,
  reapplyStoredReplacements,
  replaceDetectedImages
} from "../src/content/dom-replacer.js";
function acknowledgeRenderedImages(documentRef: Document): void {
  for (const image of Array.from(documentRef.querySelectorAll("img"))) {
    Object.defineProperty(image, "decode", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    image.dispatchEvent(new Event("load"));
  }
}

describe("content DOM replacer", () => {
  it("reports failed delivery when the rendered image emits an error", async () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img src="https://manga.example/page-1.png" />
    `;
    const image = documentRef.querySelector("img")!;
    Object.defineProperty(image, "decode", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });

    const resultPromise = Promise.resolve(
      replaceDetectedImages(
        [
          {
            domIndex: 0,
            renderedUrl: "http://hanako.test/rendered.png"
          }
        ],
        documentRef
      )
    );
    image.dispatchEvent(new Event("error"));

    await expect(resultPromise).resolves.toEqual({ applied: 0, failed: 1 });
  });

  it("acknowledges delivery after the rendered image loads and decodes", async () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img src="https://manga.example/page-1.png" />
    `;
    const image = documentRef.querySelector("img")!;
    const decode = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(image, "decode", {
      configurable: true,
      value: decode
    });

    const resultPromise = Promise.resolve(
      replaceDetectedImages(
        [
          {
            domIndex: 0,
            renderedUrl: "http://hanako.test/rendered.png"
          }
        ],
        documentRef
      )
    );
    image.dispatchEvent(new Event("load"));

    await expect(resultPromise).resolves.toEqual({ applied: 1, failed: 0 });
    expect(decode).toHaveBeenCalledOnce();
  });

  it("reports failed delivery when image decoding rejects", async () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img src="https://manga.example/page-1.png" />
    `;
    const image = documentRef.querySelector("img")!;
    Object.defineProperty(image, "decode", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("decode failed"))
    });

    const resultPromise = replaceDetectedImages(
      [
        {
          domIndex: 0,
          renderedUrl: "http://hanako.test/rendered.png"
        }
      ],
      documentRef
    );
    image.dispatchEvent(new Event("load"));

    await expect(resultPromise).resolves.toEqual({ applied: 0, failed: 1 });
  });

  it("times out a rendered image that never loads", async () => {
    vi.useFakeTimers();

    try {
      const documentRef = document.implementation.createHTMLDocument();
      documentRef.body.innerHTML = `
        <img src="https://manga.example/page-1.png" />
      `;
      const image = documentRef.querySelector("img")!;
      Object.defineProperty(image, "decode", {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined)
      });

      const resultPromise = replaceDetectedImages(
        [
          {
            domIndex: 0,
            renderedUrl: "http://hanako.test/rendered.png"
          }
        ],
        documentRef
      );
      await vi.advanceTimersByTimeAsync(15_000);

      await expect(resultPromise).resolves.toEqual({ applied: 0, failed: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces detected image sources by DOM index", async () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img src="https://manga.example/page-1.png" width="800" height="1200" />
      <img src="https://manga.example/page-2.png" width="800" height="1200" />
    `;

    const resultPromise = replaceDetectedImages(
      [
        {
          domIndex: 1,
          renderedUrl: "http://hanako.test/api/jobs/job_1/pages/page_2/rendered"
        }
      ],
      documentRef
    );
    acknowledgeRenderedImages(documentRef);
    const result = await resultPromise;
    const images = Array.from(documentRef.querySelectorAll("img"));

    expect(result).toEqual({ applied: 1, failed: 0 });
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

  it("prefers stable Hanako DOM IDs and disables competing responsive sources", async () => {
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

    const resultPromise = replaceDetectedImages(
      [
        {
          domId: "hanako-img-2",
          domIndex: 0,
          renderedUrl: "http://hanako.test/api/jobs/job_1/pages/page_2/rendered"
        }
      ],
      documentRef
    );
    acknowledgeRenderedImages(documentRef);
    const result = await resultPromise;
    const images = Array.from(documentRef.querySelectorAll("img"));

    expect(result).toEqual({ applied: 1, failed: 0 });
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

  it("updates X-style visual background image layers that sit beside the img", async () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <div aria-label="Image">
        <div
          data-testid="x-visual-layer"
          style='filter: brightness(1); background-image: url("https://pbs.twimg.com/media/HKHoz35aAAEUr8K?format=jpg&name=4096x4096");'
        ></div>
        <img
          alt="Image"
          data-hanako-dom-id="hanako-context-img-0"
          src="https://pbs.twimg.com/media/HKHoz35aAAEUr8K?format=jpg&name=4096x4096"
          class="css-9pa8cd"
        />
      </div>
    `;

    const resultPromise = replaceDetectedImages(
      [
        {
          domId: "hanako-context-img-0",
          renderedUrl: "http://hanako.test/rendered.png",
          sourceUrl:
            "https://pbs.twimg.com/media/HKHoz35aAAEUr8K?format=jpg&name=4096x4096"
        }
      ],
      documentRef
    );
    acknowledgeRenderedImages(documentRef);
    const result = await resultPromise;

    const visualLayer = documentRef.querySelector<HTMLElement>(
      "[data-testid='x-visual-layer']"
    );
    const image = documentRef.querySelector("img");

    expect(result).toEqual({ applied: 1, failed: 0 });
    expect(image?.getAttribute("src")).toBe("http://hanako.test/rendered.png");
    expect(visualLayer?.style.backgroundImage).toContain(
      "http://hanako.test/rendered.png"
    );
    expect(visualLayer?.dataset.hanakoOriginalBackgroundImage).toContain(
      "HKHoz35aAAEUr8K"
    );

    visualLayer!.style.backgroundImage =
      'url("https://pbs.twimg.com/media/HKHoz35aAAEUr8K?format=jpg&name=4096x4096")';

    expect(reapplyStoredReplacements(documentRef)).toEqual({ replaced: 1 });
    expect(visualLayer?.style.backgroundImage).toContain(
      "http://hanako.test/rendered.png"
    );
    expect(
      documentRef
        .querySelector<HTMLImageElement>("[data-hanako-visual-replacement]")
        ?.getAttribute("src")
    ).toBe("http://hanako.test/rendered.png");

    expect(clearDetectedImageReplacements(documentRef)).toEqual({
      restored: 1
    });
    expect(visualLayer?.style.backgroundImage).toContain("HKHoz35aAAEUr8K");
    expect(
      documentRef.querySelector("[data-hanako-visual-replacement]")
    ).toBeNull();
  });

  it("keeps an explicit visual replacement layer on X-style media containers", async () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <div aria-label="Image" style="position: relative;">
        <div
          data-testid="x-visual-layer"
          style='background-image: url("https://pbs.twimg.com/media/original.jpg"); opacity: 0;'
        ></div>
        <img
          alt="Image"
          data-hanako-dom-id="hanako-context-img-0"
          src="https://pbs.twimg.com/media/original.jpg"
          style="opacity: 0;"
        />
      </div>
    `;

    const resultPromise = replaceDetectedImages(
      [
        {
          domId: "hanako-context-img-0",
          renderedUrl: "http://hanako.test/rendered.png",
          sourceUrl: "https://pbs.twimg.com/media/original.jpg"
        }
      ],
      documentRef
    );
    acknowledgeRenderedImages(documentRef);
    await resultPromise;

    const overlay = documentRef.querySelector<HTMLImageElement>(
      "[data-hanako-visual-replacement]"
    );

    expect(overlay).toBeTruthy();
    expect(overlay?.getAttribute("src")).toBe(
      "http://hanako.test/rendered.png"
    );
    expect(overlay?.style.position).toBe("absolute");
    expect(overlay?.style.opacity).toBe("1");
    expect(overlay?.style.visibility).toBe("visible");
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

  it("does not reapply while the src attribute already points at the rendered image", () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img
        data-hanako-original-src="https://manga.example/page-1.png"
        data-hanako-rendered-src="http://hanako.test/rendered.png"
        src="http://hanako.test/rendered.png"
        width="800"
        height="1200"
      />
    `;
    const image = documentRef.querySelector("img");
    Object.defineProperty(image, "currentSrc", {
      configurable: true,
      value: "https://manga.example/page-1.png"
    });

    expect(reapplyStoredReplacements(documentRef)).toEqual({ replaced: 0 });
    expect(image?.getAttribute("src")).toBe("http://hanako.test/rendered.png");
  });

  it("ignores replacement instructions for missing DOM indexes", async () => {
    const documentRef = document.implementation.createHTMLDocument();
    documentRef.body.innerHTML = `
      <img src="https://manga.example/page-1.png" width="800" height="1200" />
    `;

    const result = await replaceDetectedImages(
      [{ domIndex: 3, renderedUrl: "http://hanako.test/rendered.png" }],
      documentRef
    );

    expect(result).toEqual({ applied: 0, failed: 1 });
    expect(documentRef.querySelector("img")?.getAttribute("src")).toBe(
      "https://manga.example/page-1.png"
    );
  });

  it("restores original image sources and picture sources", async () => {
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

    const resultPromise = replaceDetectedImages(
      [{ domIndex: 0, renderedUrl: "http://localhost:8787/rendered.png" }],
      documentRef
    );
    acknowledgeRenderedImages(documentRef);
    await resultPromise;

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
