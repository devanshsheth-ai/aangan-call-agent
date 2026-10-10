import fs from "node:fs";
import path from "node:path";

// The Cut: pricing.md is deliberately never read. Only these two files reach any prompt.
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), "knowledge", file), "utf8");

export function knowledge() {
  return { qualified: read("qualified.md"), services: read("services.md") };
}
