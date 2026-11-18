import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { Express, NextFunction, Request as ExpressRequest, Response as ExpressResponse } from "express";

// The Vercel deployment serves this Express app from an Astro server route,
// which speaks Fetch. Translate one request and capture the Node response.
export function dispatchExpress(app: Express, request: Request): Promise<Response> {
  return new Promise(async (resolve, reject) => {
    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const body =
        method === "GET" || method === "HEAD"
          ? Buffer.alloc(0)
          : Buffer.from(await request.arrayBuffer());

      const socket = new Socket();
      const req = new IncomingMessage(socket);
      req.method = request.method;
      req.url = `${url.pathname}${url.search}`;
      req.httpVersion = "1.1";
      req.httpVersionMajor = 1;
      req.httpVersionMinor = 1;

      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      if (!headers.host) headers.host = url.host;
      if (body.length > 0 && headers["content-length"] === undefined) {
        headers["content-length"] = String(body.length);
      }
      req.headers = headers;

      const res = new ServerResponse(req);
      const chunks: Buffer[] = [];
      let settled = false;

      const settle = () => {
        if (settled) return;
        settled = true;
        const status = res.statusCode || 200;
        const noBody = status === 204 || status === 205 || status === 304;
        const payload =
          noBody || chunks.length === 0 ? null : Buffer.concat(chunks);
        resolve(new Response(payload, { status, headers: headersFrom(res) }));
      };

      res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
        const extra = takeChunk(chunk, encoding);
        if (extra) chunks.push(extra);
        callOptional(encoding, cb);
        return true;
      }) as ServerResponse["write"];

      res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
        const extra = takeChunk(chunk, encoding);
        if (extra) chunks.push(extra);
        callOptional(encoding, cb);
        settle();
        return res;
      }) as ServerResponse["end"];

      const next: NextFunction = (err?: unknown) => {
        if (!err || settled) return;
        console.error(err);
        if (res.statusCode < 400) res.statusCode = 500;
        settle();
      };

      app(req as unknown as ExpressRequest, res as unknown as ExpressResponse, next);

      queueMicrotask(() => {
        if (body.length > 0) req.push(body);
        req.push(null);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function headersFrom(res: ServerResponse): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.getHeaders())) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, String(item));
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

function takeChunk(chunk: unknown, encoding?: unknown): Buffer | null {
  if (chunk == null || typeof chunk === "function") return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  if (typeof chunk === "string") {
    const enc = typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8";
    return Buffer.from(chunk, enc);
  }
  return null;
}

function callOptional(encoding?: unknown, cb?: unknown) {
  if (typeof encoding === "function") encoding();
  else if (typeof cb === "function") cb();
}
