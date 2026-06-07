import { describe, expect, it, vi } from "vitest";

import {
  calculateVisibleCrop,
  captureVisibleElementBitmap
} from "../src/background/visible-tab-capture.js";

describe("visible tab image capture", () => {
  it("calculates a clipped crop in captured screenshot pixels", () => {
    expect(
      calculateVisibleCrop({
        bitmapHeight: 1600,
        bitmapWidth: 2000,
        rect: {
          height: 120,
          left: -10,
          top: 20,
          viewportHeight: 800,
          viewportWidth: 1000,
          width: 200
        }
      })
    ).toEqual({
      outputHeight: 240,
      outputWidth: 380,
      sourceHeight: 240,
      sourceWidth: 380,
      sourceX: 0,
      sourceY: 40
    });
  });

  it("bounds oversized output dimensions while preserving source crop dimensions", () => {
    expect(
      calculateVisibleCrop({
        bitmapHeight: 4000,
        bitmapWidth: 4000,
        rect: {
          height: 1000,
          left: 0,
          top: 0,
          viewportHeight: 1000,
          viewportWidth: 1000,
          width: 1000
        }
      })
    ).toEqual({
      outputHeight: 1800,
      outputWidth: 1800,
      sourceHeight: 4000,
      sourceWidth: 4000,
      sourceX: 0,
      sourceY: 0
    });
  });

  it("crops the visible tab screenshot into PNG bytes", async () => {
    const drawCalls: unknown[][] = [];
    const result = await captureVisibleElementBitmap(
      {
        rect: {
          height: 120,
          left: 10,
          top: 20,
          viewportHeight: 800,
          viewportWidth: 1000,
          width: 200
        },
        sourceUrl: "https://manga.example/page-1.jpg",
        windowId: 9
      },
      {
        captureVisibleTab: async (windowId) => {
          expect(windowId).toBe(9);
          return "data:image/png;base64,c2NyZWVuc2hvdA==";
        },
        createCanvas: (width, height) => {
          expect(width).toBe(400);
          expect(height).toBe(240);
          return {
            convertToBlob: async ({ type }) =>
              new Blob([new Uint8Array([7, 8, 9])], { type }),
            getContext: () => ({
              drawImage: (...args: unknown[]) => drawCalls.push(args)
            })
          };
        },
        createImageBitmapFromBlob: async () => ({
          close: () => undefined,
          height: 1600,
          width: 2000
        }),
        fetchDataUrl: async (dataUrl) => {
          expect(dataUrl).toBe("data:image/png;base64,c2NyZWVuc2hvdA==");
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }
      }
    );

    expect(result).toEqual({
      bytesBase64: "BwgJ",
      mediaType: "image/png",
      name: "page-1.jpg"
    });
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0]?.slice(1)).toEqual([20, 40, 400, 240, 0, 0, 400, 240]);
  });

  it("crops a provided visible-tab screenshot without capturing again", async () => {
    const dataUrl = "data:image/png;base64,cG9zdC1zY3JvbGw=";
    const captureVisibleTab = vi.fn();
    const fetchedDataUrls: string[] = [];

    const result = await captureVisibleElementBitmap(
      {
        dataUrl,
        rect: {
          height: 120,
          left: 10,
          top: 20,
          viewportHeight: 800,
          viewportWidth: 1000,
          width: 200
        },
        sourceUrl: "https://manga.example/page-1.jpg",
        windowId: 9
      },
      {
        captureVisibleTab,
        createCanvas: () => ({
          convertToBlob: async ({ type }) =>
            new Blob([new Uint8Array([7, 8, 9])], { type }),
          getContext: () => ({ drawImage: () => undefined })
        }),
        createImageBitmapFromBlob: async () => ({
          close: () => undefined,
          height: 1600,
          width: 2000
        }),
        fetchDataUrl: async (dataUrl) => {
          fetchedDataUrls.push(String(dataUrl));
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }
      }
    );

    expect(result).toMatchObject({
      bytesBase64: "BwgJ",
      mediaType: "image/png"
    });
    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(fetchedDataUrls).toEqual([dataUrl]);
  });
});
