import { describe, expect, it, vi } from "vitest";

import {
  captureImageBitmapFromElement,
  captureImageBytesBySource,
  locateImageElementBySource,
  scrollImageElementIntoViewBySource
} from "../src/content/image-bitmap.js";

describe("content image bitmap capture", () => {
  it("draws an image element to a PNG byte payload", async () => {
    const drawCalls: unknown[] = [];
    let requestedType = "";
    const image = document.createElement("img");
    const documentRef = {
      createElement: (tagName: string) => {
        expect(tagName).toBe("canvas");
        return {
          getContext: () => ({
            drawImage: (...args: unknown[]) => drawCalls.push(args)
          }),
          height: 0,
          toBlob: (callback: BlobCallback, type?: string) => {
            requestedType = type ?? "";
            callback(new Blob([new Uint8Array([1, 2, 3])], { type }));
          },
          width: 0
        };
      },
      location: { href: "http://localhost:3000/" }
    } as unknown as Document;

    Object.defineProperty(image, "currentSrc", {
      configurable: true,
      value: "https://manga.example/page-1.jpg"
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 1200
    });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 800
    });

    await expect(
      captureImageBitmapFromElement(image, documentRef)
    ).resolves.toEqual({
      bytesBase64: "AQID",
      mediaType: "image/png",
      name: "page-1.jpg"
    });
    expect(requestedType).toBe("image/png");
    expect(drawCalls).toHaveLength(1);
  });

  it("bounds oversized image capture canvas dimensions", async () => {
    let canvasWidth = 0;
    let canvasHeight = 0;
    const image = document.createElement("img");
    const documentRef = {
      createElement: () => {
        const canvas = {
          getContext: () => ({
            drawImage: () => undefined
          }),
          get height() {
            return canvasHeight;
          },
          set height(value: number) {
            canvasHeight = value;
          },
          toBlob: (callback: BlobCallback, type?: string) => {
            callback(new Blob([new Uint8Array([1])], { type }));
          },
          get width() {
            return canvasWidth;
          },
          set width(value: number) {
            canvasWidth = value;
          }
        };
        return canvas;
      },
      location: { href: "http://localhost:3000/" }
    } as unknown as Document;

    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 2000
    });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 4000
    });

    await captureImageBitmapFromElement(image, documentRef);

    expect(canvasWidth).toBe(1800);
    expect(canvasHeight).toBe(900);
  });

  it("captures the matching image element for a source URL", async () => {
    document.body.innerHTML = `
      <img src="https://manga.example/page-1.jpg" width="800" height="1200">
    `;
    const image = document.querySelector("img");

    if (!image) {
      throw new Error("Expected test image");
    }

    Object.defineProperty(image, "currentSrc", {
      configurable: true,
      value: "https://manga.example/page-1.jpg"
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 1200
    });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 800
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () =>
        ({
          drawImage: () => undefined
        }) as unknown as CanvasRenderingContext2D
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (callback: BlobCallback, type?: string) => {
        callback(new Blob([new Uint8Array([4, 5, 6])], { type }));
      }
    });

    await expect(
      captureImageBytesBySource("https://manga.example/page-1.jpg", document)
    ).resolves.toMatchObject({
      bytesBase64: "BAUG",
      mediaType: "image/png"
    });
  });

  it("locates the matching image element rectangle for screenshot fallback", () => {
    document.body.innerHTML = `
      <img src="https://manga.example/page-1.jpg" width="640" height="960">
      <img src="https://manga.example/page-2.jpg" width="640" height="960">
    `;
    const image = document.querySelectorAll("img")[1];

    if (!image) {
      throw new Error("Expected test image");
    }

    Object.defineProperty(image, "currentSrc", {
      configurable: true,
      value: "https://manga.example/page-2.jpg"
    });
    image.getBoundingClientRect = () =>
      ({
        bottom: 460,
        height: 400,
        left: 25,
        right: 325,
        top: 60,
        width: 300,
        x: 25,
        y: 60
      }) as DOMRect;

    expect(
      locateImageElementBySource("https://manga.example/page-2.jpg", document)
    ).toMatchObject({
      domId: "hanako-context-img-1",
      domIndex: 1,
      height: 400,
      left: 25,
      top: 60,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: 300
    });
    expect(image.dataset.hanakoDomId).toBe("hanako-context-img-1");
  });

  it("scrolls the matching image into view and warns when the whole image cannot fit", async () => {
    document.body.innerHTML = `
      <img src="https://manga.example/page-1.jpg" width="700" height="1200">
    `;
    const image = document.querySelector("img");

    if (!image) {
      throw new Error("Expected test image");
    }

    const scrollIntoView = vi.fn();
    image.scrollIntoView = scrollIntoView;
    Object.defineProperty(image, "currentSrc", {
      configurable: true,
      value: "https://manga.example/page-1.jpg"
    });
    image.getBoundingClientRect = () =>
      ({
        bottom: 1200,
        height: 1200,
        left: 0,
        right: 700,
        top: 0,
        width: 700,
        x: 0,
        y: 0
      }) as DOMRect;

    await expect(
      scrollImageElementIntoViewBySource(
        "https://manga.example/page-1.jpg",
        document
      )
    ).resolves.toMatchObject({
      domId: "hanako-context-img-0",
      domIndex: 0,
      fullyVisible: false,
      height: 1200,
      warning:
        "Warning: screenshot fallback could only include the visible portion of the image."
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
      inline: "center"
    });
  });

  it("waits for the scroll frame before returning the screenshot rectangle", async () => {
    const calls: string[] = [];
    let scrolledFrameSettled = false;
    const image = {
      currentSrc: "https://manga.example/page-1.jpg",
      dataset: {} as DOMStringMap,
      getAttribute: (name: string) =>
        name === "src" ? "https://manga.example/page-1.jpg" : null,
      getBoundingClientRect: () => {
        calls.push(scrolledFrameSettled ? "rect:settled" : "rect:initial");
        return {
          bottom: scrolledFrameSettled ? 420 : 1220,
          height: 400,
          left: 25,
          right: 325,
          top: scrolledFrameSettled ? 20 : 820,
          width: 300,
          x: 25,
          y: scrolledFrameSettled ? 20 : 820
        } as DOMRect;
      },
      scrollIntoView: () => {
        calls.push("scroll");
      },
      src: "https://manga.example/page-1.jpg"
    } as unknown as HTMLImageElement;
    const documentRef = {
      defaultView: {
        innerHeight: 800,
        innerWidth: 1000,
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          calls.push("raf");
          scrolledFrameSettled = true;
          callback(0);
          return 1;
        }
      },
      location: { href: "https://manga.example/chapter" },
      querySelectorAll: (selector: string) =>
        selector === "img" ? [image] : []
    } as unknown as Document;

    const result = await scrollImageElementIntoViewBySource(
      "https://manga.example/page-1.jpg",
      documentRef
    );

    expect(result).toMatchObject({
      fullyVisible: true,
      scrollChanged: true,
      top: 20
    });
    expect(calls).toEqual([
      "rect:initial",
      "scroll",
      "raf",
      "raf",
      "rect:settled"
    ]);
  });
});
