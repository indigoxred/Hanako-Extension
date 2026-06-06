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

  it("requires image bytes before the extension sends a translation job", async () => {
    await expect(
      withRequiredImageBytes(
        { url: "https://pbs.twimg.com/media/HJ4cDDWbgAALVyK?format=jpg" },
        async () => undefined
      )
    ).rejects.toThrow("The extension could not extract bytes for this image");
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
