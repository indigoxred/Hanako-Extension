import { describe, expect, it } from "vitest";

import {
  fetchImageBytes,
  withRequiredImageBytes
} from "../src/background/image-bytes.js";

describe("image byte extraction", () => {
  it("fetches remote image bytes without credentialed CORS requests", async () => {
    const payload = await fetchImageBytes(
      { url: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg" },
      async (input, init) => {
        expect(input).toBe(
          "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg"
        );
        expect(init).toMatchObject({
          credentials: "omit",
          redirect: "follow"
        });

        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/jpeg; charset=binary" },
          status: 200
        });
      }
    );

    expect(payload).toEqual({
      bytesBase64: "AQID",
      mediaType: "image/jpeg",
      name: "HJ4cDDWbgAALVyK"
    });
  });

  it("passes page URL as referrer context for background image fetches", async () => {
    await fetchImageBytes(
      {
        pageUrl: "https://x.com/WwQel/status/2063186089964408919/photo/1",
        url: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg"
      },
      async (_input, init) => {
        expect(init).toMatchObject({
          credentials: "omit",
          redirect: "follow",
          referrer: "https://x.com/WwQel/status/2063186089964408919/photo/1",
          referrerPolicy: "no-referrer-when-downgrade"
        });

        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/jpeg" },
          status: 200
        });
      }
    );
  });

  it("requires image bytes before the extension sends a translation job", async () => {
    await expect(
      withRequiredImageBytes(
        { url: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg" },
        async () => undefined
      )
    ).rejects.toThrow("The extension could not extract bytes for this image");
  });

  it("uses already captured image bytes without fetching the source URL", async () => {
    await expect(
      withRequiredImageBytes(
        {
          bytesBase64: "AQID",
          mediaType: "image/png",
          url: "https://manga.example/page-1.png"
        },
        async () => {
          throw new Error("Already captured bytes should not be fetched again");
        }
      )
    ).resolves.toEqual({
      bytesBase64: "AQID",
      mediaType: "image/png",
      url: "https://manga.example/page-1.png"
    });
  });

  it("ignores unsupported image media types before upload", async () => {
    const svgPayload = await fetchImageBytes(
      { url: "https://manga.example/icon.svg" },
      async () =>
        new Response(new TextEncoder().encode("<svg />"), {
          headers: { "content-type": "image/svg+xml" },
          status: 200
        })
    );
    const avifPayload = await fetchImageBytes(
      { url: "https://manga.example/page.avif" },
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/avif" },
          status: 200
        })
    );

    expect(svgPayload).toBeUndefined();
    expect(avifPayload).toBeUndefined();
  });
});
