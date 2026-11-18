type QueryParams = Record<string, string | number | undefined | null>;

function configuredBase(): string {
  const value = import.meta.env.PUBLIC_API_BASE_URL;
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/$/, "");
}

// Empty string means "same host" (the Vercel deployment serves /api itself).
export function clientApiBase(): string {
  const configured = configuredBase();
  if (configured) return configured;
  if (process.env["VERCEL"]) return "";
  return "http://localhost:3000";
}

export function apiUrl(path: string, params?: QueryParams) {
  const url = new URL(path, clientApiBase() || "http://localhost:3000");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function applyParams(url: URL, params?: QueryParams) {
  if (!params) return url;
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function apiGetInProcess(path: string, params?: QueryParams) {
  const url = applyParams(new URL(path, "http://app.internal"), params);
  const [{ app }, { dispatchExpress }] = await Promise.all([
    import("../../../server/src/app.js"),
    import("../../../server/src/dispatch.js"),
  ]);
  const res = await dispatchExpress(app, new Request(url));
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return res.json();
}

export async function apiGet(path: string, params?: QueryParams) {
  if (!clientApiBase()) return apiGetInProcess(path, params);
  const res = await fetch(apiUrl(path, params));
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return res.json();
}
