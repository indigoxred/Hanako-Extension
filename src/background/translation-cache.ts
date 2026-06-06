export async function createTranslationCacheKey(input: {
  baseUrl: string;
  bytesBase64: string;
  targetLanguage: string;
}): Promise<string> {
  const hash = await sha256(input.bytesBase64);
  return `${input.baseUrl}:${input.targetLanguage}:${hash}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
