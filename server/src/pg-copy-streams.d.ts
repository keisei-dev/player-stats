declare module "pg-copy-streams" {
  import type { Readable, Writable } from "node:stream";

  export function from(queryText: string): Writable;
  export function to(queryText: string): Readable;
}
