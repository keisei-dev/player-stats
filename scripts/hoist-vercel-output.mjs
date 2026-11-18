import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "web", ".vercel", "output");
const to = path.join(root, ".vercel", "output");

try {
  await stat(from);
} catch {
  console.error("Astro did not write web/.vercel/output. The Vercel adapter did not run.");
  process.exit(1);
}

await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });
console.log("Wrote .vercel/output");
