import fs from "fs";
import path from "path";
import { getApiDocs } from "../lib/swagger";

const spec = getApiDocs() as unknown as { paths?: Record<string, unknown> };
const pathCount = Object.keys(spec.paths ?? {}).length;
console.log(`Số path tìm thấy: ${pathCount}`);

if (pathCount === 0) {
  console.error("Không tìm thấy path nào, dừng build.");
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "swagger.json"),
  JSON.stringify(spec, null, 2),
);
console.log("Generated public/swagger.json");
