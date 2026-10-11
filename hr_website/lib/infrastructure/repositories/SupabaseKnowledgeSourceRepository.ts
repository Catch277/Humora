import type {
  KnowledgeCorpus,
  KnowledgeSources,
} from "@/lib/domain/entities/KnowledgeSource";
import type { IKnowledgeSourceRepository } from "@/lib/domain/repositories/IKnowledgeSourceRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * Số dòng tối đa đọc để kê tài liệu theo tiêu đề.
 *
 * PostgREST không có GROUP BY, nên bảng kê được gộp trong ứng dụng; đọc quá giới hạn này thì
 * `truncated` = true và số đoạn mỗi tài liệu chỉ còn là cận dưới (tổng số đoạn vẫn chính xác vì lấy
 * từ `count: "exact"`).
 */
const BREAKDOWN_LIMIT = 500;

/** Bảng kê chỉ cần cột `title` để gộp theo tài liệu. */
type TitleRow = { title: string | null };

function groupByTitle(totalChunks: number, rows: TitleRow[]): KnowledgeCorpus {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const title = (row.title ?? "").trim() || "Không có tiêu đề";
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }

  return {
    totalChunks,
    documents: [...counts.entries()]
      .map(([title, chunks]) => ({ title, chunks }))
      .sort((a, b) => b.chunks - a.chunks || a.title.localeCompare(b.title)),
    truncated: rows.length >= BREAKDOWN_LIMIT,
  };
}

export class SupabaseKnowledgeSourceRepository
  implements IKnowledgeSourceRepository
{
  async listForUser(userId: string): Promise<KnowledgeSources> {
    const supabase = await createSupabaseServerClient();

    const [companyCount, companyTitles, contractCount, contractTitles] =
      await Promise.all([
        supabase
          .from("company_documents")
          .select("id", { count: "exact", head: true }),
        supabase.from("company_documents").select("title").limit(BREAKDOWN_LIMIT),
        supabase
          .from("user_contracts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("user_contracts")
          .select("title")
          .eq("user_id", userId)
          .limit(BREAKDOWN_LIMIT),
      ]);

    if (companyCount.error) {
      throw new Error(
        `Unable to count company documents: ${companyCount.error.message}`,
      );
    }

    if (companyTitles.error) {
      throw new Error(
        `Unable to list company documents: ${companyTitles.error.message}`,
      );
    }

    if (contractCount.error) {
      throw new Error(
        `Unable to count user contracts: ${contractCount.error.message}`,
      );
    }

    if (contractTitles.error) {
      throw new Error(
        `Unable to list user contracts: ${contractTitles.error.message}`,
      );
    }

    // The client has no generated Database type, so a plain `select("title")` row type is not usable
    // for the grouping helper; the rows are normalised through the declared `TitleRow` type instead
    // (the same pattern the other repositories use for untyped selects).
    const companyRows = (companyTitles.data ?? []) as unknown as TitleRow[];
    const contractRows = (contractTitles.data ?? []) as unknown as TitleRow[];

    return {
      companyDocuments: groupByTitle(companyCount.count ?? 0, companyRows),
      userContracts: groupByTitle(contractCount.count ?? 0, contractRows),
    };
  }
}
