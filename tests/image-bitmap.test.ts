import { describe, expect, it } from "vitest";

import {
  captureImageBitmapFromElement,
  captureImageBytesBySource,
  locateImageElementBySource
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
      <img src="https://manga.example/page-2.jpg" width="640" height="960">
    `;
    const image = document.querySelector("img");

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
      height: 400,
      left: 25,
      top: 60,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: 300
    });
  });
});
