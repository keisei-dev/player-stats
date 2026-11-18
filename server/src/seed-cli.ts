import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seed } from "./seed.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.resolve(root, ".env") });

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
