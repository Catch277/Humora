import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const spec = await readFile(
    join(process.cwd(), "public", "swagger.json"),
    "utf8",
  );

  return new NextResponse(spec, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
