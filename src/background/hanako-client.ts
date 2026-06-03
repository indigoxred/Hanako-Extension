export interface ExtensionHanakoClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export async function checkHanakoConnection({
  baseUrl,
  fetch: fetcher = fetch
}: ExtensionHanakoClientOptions): Promise<boolean> {
  const response = await fetcher(`${normalizeBaseUrl(baseUrl)}/healthz`);
  return response.ok;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
