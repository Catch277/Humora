/**
 * Nạp kho tri thức cho trợ lý AI: đọc các file `.md` / `.txt` trong một thư mục, cắt thành đoạn,
 * nhúng vector bằng `gemini-embedding-001` (768 chiều, khớp cột `vector(768)` của database) rồi
 * sinh một file SQL để dán vào Supabase Dashboard → SQL Editor.
 *
 * Vì sao sinh SQL thay vì ghi trực tiếp: app này chỉ có anon key, RLS chặn ghi vào hai bảng đó, và
 * dự án cố ý **không** giữ service-role key ở đây. SQL Editor chạy bằng `postgres` (chủ bảng) nên
 * nạp được mà không cần thêm quyền gì.
 *
 * Cách dùng:
 *   npx tsx scripts/ingest-knowledge.ts                          # docs/ → supabase/sql/knowledge_seed.sql
 *   npx tsx scripts/ingest-knowledge.ts --source docs --out supabase/sql/knowledge_seed.sql
 *   npx tsx scripts/ingest-knowledge.ts --table user_contracts --user-id <uuid>
 *   npx tsx scripts/ingest-knowledge.ts --max-chars 1200 --batch 10
 *
 * Cần `GEMINI_API_KEY` (đọc từ `.env.local` nếu chưa có trong môi trường). Chạy lại là an toàn: file
 * SQL sinh ra xoá đúng những `title` có trong thư mục nguồn rồi chèn lại, nên sửa tài liệu rồi chạy
 * lại sẽ cập nhật chứ không nhân bản.
 */
import fs from "fs";
import path from "path";
import {
  GoogleGenerativeAI,
  type EmbedContentRequest,
} from "@google/generative-ai";

/** Phải khớp `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` trong `lib/infrastructure/GeminiLLMService.ts`. */
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

const DEFAULT_SOURCE = "docs";
const DEFAULT_OUT = "supabase/sql/knowledge_seed.sql";
const DEFAULT_MAX_CHARS = 1000;
const DEFAULT_BATCH = 20;
/** Nghỉ giữa các batch để không vượt giới hạn request/phút của gói miễn phí. */
const BATCH_PAUSE_MS = 1500;
/** Số dòng mỗi câu INSERT: giữ mỗi câu lệnh đủ nhỏ để SQL Editor xử lý. */
const ROWS_PER_INSERT = 25;
/** Đoạn ngắn hơn ngưỡng này là tiêu đề/mục lục vụn, không mang thông tin để tra cứu. */
const MIN_CHUNK_CHARS = 40;

type Options = {
  source: string;
  out: string;
  table: "company_documents" | "user_contracts";
  userId: string | null;
  maxChars: number;
  batch: number;
};

type Chunk = {
  title: string;
  content: string;
  file: string;
};

function parseOptions(argv: string[]): Options {
  const valueOf = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
  };

  const tableValue = valueOf("--table") ?? "company_documents";

  if (tableValue !== "company_documents" && tableValue !== "user_contracts") {
    throw new Error("--table chỉ nhận company_documents hoặc user_contracts");
  }

  const table: Options["table"] = tableValue;
  const userId = valueOf("--user-id");

  if (table === "user_contracts" && !userId) {
    throw new Error("--table user_contracts cần --user-id <uuid của nhân viên>");
  }

  const maxChars = Number(valueOf("--max-chars") ?? DEFAULT_MAX_CHARS);
  const batch = Number(valueOf("--batch") ?? DEFAULT_BATCH);

  if (!Number.isFinite(maxChars) || maxChars < 200) {
    throw new Error("--max-chars phải là số ≥ 200");
  }

  if (!Number.isInteger(batch) || batch < 1 || batch > 100) {
    throw new Error("--batch phải là số nguyên trong khoảng 1..100");
  }

  return {
    source: valueOf("--source") ?? DEFAULT_SOURCE,
    out: valueOf("--out") ?? DEFAULT_OUT,
    table,
    userId,
    maxChars,
    batch,
  };
}

/** `GEMINI_API_KEY` từ môi trường, nếu chưa có thì đọc `.env.local` (định dạng KEY=value). */
function loadApiKey(): string {
  const apiKey = envValue("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error(
      "Thiếu GEMINI_API_KEY: đặt trong .env.local hoặc biến môi trường trước khi chạy.",
    );
  }

  return apiKey;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Đọc một biến từ `.env.local` (dùng để kiểm tra cột trước khi gọi Gemini). */
function envValue(name: string): string | null {
  if (process.env[name]) {
    return process.env[name] as string;
  }

  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    return null;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");

    if (index > 0 && line.slice(0, index).trim() === name) {
      return line.slice(index + 1).trim();
    }
  }

  return null;
}

/**
 * Kiểm tra trước rằng bảng đích có đủ cột sắp ghi, để hỏng vì schema thì hỏng **trước khi** gọi
 * Gemini (đỡ tốn tiền và đỡ mất thời gian). Dùng anon key: RLS có thể giấu dòng, nhưng tên cột sai thì
 * PostgREST trả `42703` và bảng thiếu thì trả `PGRST205` ngay khi phân tích câu lệnh.
 */
async function assertTargetColumns(
  table: string,
  columns: string[],
): Promise<void> {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    console.log(
      "  (bỏ qua kiểm tra cột: không thấy NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
    return;
  }

  const response = await fetch(
    `${url}/rest/v1/${table}?select=${columns.join(",")}&limit=0`,
    {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    },
  );

  if (!response.ok) {
    const body = (await response.text()).slice(0, 240);
    throw new Error(
      `Không xác nhận được cột của public.${table} (${columns.join(", ")}): ${body}`,
    );
  }

  console.log(`  cột ${columns.join(", ")} có trên public.${table}`);
}

function vectorLiteral(values: number[]): string {
  return `'[${values.join(",")}]'::vector`;
}

/** Liệt kê đệ quy các file `.md` / `.txt`, sắp xếp để kết quả sinh ra ổn định giữa các lần chạy. */
function listSourceFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.(md|txt)$/i.test(entry.name)) {
      files.push(full);
    }
  }

  return files.sort();
}

/**
 * `README.md` nằm ngay trong thư mục nguồn là hướng dẫn cho người đọc, không phải tài liệu của công
 * ty — bỏ qua để nó không lọt vào kho tri thức và bị trích dẫn như một quy chế.
 */
function isFolderReadme(file: string, source: string): boolean {
  return (
    path.dirname(file) === source && /^readme\.(md|txt)$/i.test(path.basename(file))
  );
}

/**
 * Tiêu đề tài liệu: heading `#` đầu tiên, nếu không có thì lấy tên file. Đây chính là giá trị xuất
 * hiện trong phần "Trích dẫn tài liệu" của câu trả lời, nên nó phải đọc lên là hiểu.
 */
function documentTitle(content: string, file: string): string {
  const heading = content.match(/^#\s+(.+)$/m);

  return (heading?.[1] ?? path.basename(file, path.extname(file))).trim();
}

/** Cắt một khối quá dài theo dòng, để không bao giờ cắt giữa câu. */
function splitLongBlock(block: string, maxChars: number): string[] {
  const parts: string[] = [];
  let current = "";

  for (const line of block.split(/\r?\n/)) {
    if (current !== "" && current.length + line.length + 1 > maxChars) {
      parts.push(current);
      current = line;
    } else {
      current = current === "" ? line : `${current}\n${line}`;
    }
  }

  if (current !== "") {
    parts.push(current);
  }

  return parts;
}

/**
 * Cắt nội dung thành các đoạn ≤ `maxChars` với ranh giới là dòng trống (đoạn văn / mục markdown).
 *
 * Không chồng lấn giữa các đoạn: mỗi đoạn là một đơn vị nội dung trọn vẹn, và đoạn quá ngắn
 * (< MIN_CHUNK_CHARS) bị bỏ vì chỉ là tiêu đề mục, không mang thông tin để tra cứu.
 */
function chunkContent(content: string, maxChars: number): string[] {
  const blocks = content
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "");
  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    if (block.length > maxChars) {
      if (current !== "") {
        chunks.push(current);
        current = "";
      }

      chunks.push(...splitLongBlock(block, maxChars));
      continue;
    }

    if (current === "") {
      current = block;
    } else if (current.length + block.length + 2 <= maxChars) {
      current = `${current}\n\n${block}`;
    } else {
      chunks.push(current);
      current = block;
    }
  }

  if (current !== "") {
    chunks.push(current);
  }

  return chunks.filter((chunk) => chunk.length >= MIN_CHUNK_CHARS);
}

/** Nhúng một batch đoạn văn, mỗi vector đúng `EMBEDDING_DIMENSIONS` chiều. */
async function embedBatch(
  client: GoogleGenerativeAI,
  texts: string[],
): Promise<number[][]> {
  const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });

  // SDK `@google/generative-ai` 0.24.1 chưa khai báo `outputDimensionality`, nhưng chỉ thêm `model`
  // vào từng phần tử rồi gửi nguyên object lên API, nên chỉ cần mở rộng kiểu — không cần cast.
  const requests: (EmbedContentRequest & { outputDimensionality?: number })[] =
    texts.map((text) => ({
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }));

  const result = await model.batchEmbedContents({ requests });

  return result.embeddings.map((embedding) => embedding.values);
}

/** Sinh file SQL: xoá đúng các `title` có trong thư mục nguồn rồi chèn lại (chạy lại là an toàn). */
function buildSql(
  options: Options,
  chunks: (Chunk & { embedding: number[] })[],
): string {
  const titles = [...new Set(chunks.map((chunk) => chunk.title))].sort();
  const columns = options.userId
    ? "(title, content, embedding, user_id)"
    : "(title, content, embedding)";
  const lines: string[] = [
    "-- Sinh bởi scripts/ingest-knowledge.ts — không sửa tay.",
    `-- Nguồn: ${options.source} · ${titles.length} tài liệu · ${chunks.length} đoạn · ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} chiều).`,
    "-- Kiểm tra số chiều của cột trước khi chạy:",
    `--   select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.${options.table}'::regclass and attname = 'embedding';`,
    "-- Chạy lại file này là an toàn: nó chỉ xoá các title liệt kê dưới đây.",
    "",
    "begin;",
    "",
    `delete from public.${options.table}`,
    "where title in (",
    `  ${titles.map(sqlLiteral).join(",\n  ")}`,
    `)${options.userId ? ` and user_id = ${sqlLiteral(options.userId)}` : ""};`,
    "",
  ];

  for (let index = 0; index < chunks.length; index += ROWS_PER_INSERT) {
    const values = chunks
      .slice(index, index + ROWS_PER_INSERT)
      .map((chunk) => {
        const parts = [
          sqlLiteral(chunk.title),
          sqlLiteral(chunk.content),
          vectorLiteral(chunk.embedding),
        ];

        if (options.userId) {
          parts.push(sqlLiteral(options.userId));
        }

        return `  (${parts.join(", ")})`;
      });

    lines.push(`insert into public.${options.table} ${columns} values`);
    lines.push(`${values.join(",\n")};`);
    lines.push("");
  }

  lines.push("commit;", "");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const apiKey = loadApiKey();

  if (!fs.existsSync(options.source)) {
    throw new Error(
      `Không thấy thư mục nguồn "${options.source}" — tạo thư mục rồi bỏ file .md/.txt vào đó.`,
    );
  }

  // The folder's own README is documentation, not corpus content.
  const files = listSourceFiles(options.source).filter(
    (file) => !isFolderReadme(file, options.source),
  );

  if (files.length === 0) {
    throw new Error(
      `Không có file .md/.txt nào trong "${options.source}" (README của thư mục bị bỏ qua).`,
    );
  }

  console.log(
    `Đọc ${files.length} file từ ${options.source} (đích: ${options.table}, ${EMBEDDING_DIMENSIONS} chiều)`,
  );

  const chunks: Chunk[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const title = documentTitle(content, file);
    const pieces = chunkContent(content, options.maxChars);

    for (const piece of pieces) {
      chunks.push({ title, content: piece, file });
    }

    console.log(`  ${file} → "${title}" · ${pieces.length} đoạn`);
  }

  if (chunks.length === 0) {
    throw new Error(
      "Không cắt được đoạn nào — nội dung tài liệu quá ngắn hoặc thư mục rỗng.",
    );
  }

  const client = new GoogleGenerativeAI(apiKey);
  const embedded: (Chunk & { embedding: number[] })[] = [];

  await assertTargetColumns(
    options.table,
    options.userId
      ? ["title", "content", "embedding", "user_id"]
      : ["title", "content", "embedding"],
  );

  for (let index = 0; index < chunks.length; index += options.batch) {
    const batch = chunks.slice(index, index + options.batch);
    const vectors = await embedBatch(
      client,
      batch.map((chunk) => chunk.content),
    );

    if (vectors.length !== batch.length) {
      throw new Error(
        `Batch trả về ${vectors.length}/${batch.length} vector — dừng để không ghi thiếu đoạn.`,
      );
    }

    batch.forEach((chunk, position) => {
      const values = vectors[position];

      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding có ${values.length} chiều, cần ${EMBEDDING_DIMENSIONS}.`,
        );
      }

      embedded.push({ ...chunk, embedding: values });
    });

    console.log(`  đã nhúng ${embedded.length}/${chunks.length} đoạn`);

    if (index + options.batch < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }
  }

  const sql = buildSql(options, embedded);
  // `path.resolve` rather than `path.join`: an absolute `--out` must not be appended to the cwd.
  const outPath = path.resolve(process.cwd(), options.out);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sql, "utf8");

  const sizeKb = Math.round(Buffer.byteLength(sql, "utf8") / 1024);
  const documentCount = new Set(embedded.map((chunk) => chunk.title)).size;

  console.log(
    `\nĐã ghi ${options.out}: ${documentCount} tài liệu, ${embedded.length} đoạn, ${sizeKb} KB.`,
  );
  console.log(
    "Dán file đó vào Supabase Dashboard → SQL Editor rồi Run, sau đó mở /chat xem panel \"Nguồn tri thức\".",
  );
}

main().catch((error: unknown) => {
  console.error(
    `\nLỗi: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
