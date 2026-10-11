import type { DocumentChunk } from "@/lib/domain/entities/ChatMessage";
import type { IVectorSearchRepository } from "@/lib/domain/repositories/IVectorSearchRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/** Số lượng chunk tối đa lấy từ mỗi nguồn tìm kiếm. */
const MATCH_COUNT = 5;

/**
 * Ngưỡng tương đồng tối thiểu truyền vào RPC.
 *
 * Hai hàm `match_*` trong database **không có giá trị mặc định** cho tham số này
 * (`match_company_documents(match_count, match_threshold, query_embedding)`), nên thiếu nó không
 * phải là "không có kết quả" mà là lỗi PGRST202 "Could not find the function …" — đó là lý do
 * `/api/chat/ask` trả 500 dù RPC tồn tại.
 *
 * Đặt 0 nghĩa là không lọc: quy tắc số 3 trong prompt của `GeminiLLMService` vẫn buộc mô hình trả
 * lời đúng câu "không có thông tin" khi ngữ cảnh không chứa câu trả lời. Tăng hằng số này (ví dụ
 * 0.6) nếu muốn cắt bớt các đoạn tài liệu ít liên quan trước khi gọi mô hình.
 */
const MATCH_THRESHOLD = 0;

/** Shape kết quả trả về từ RPC Supabase match_company_documents. */
interface RpcCompanyDocumentRow {
  content: string;
  document_name: string;
  similarity: number;
}

/** Shape kết quả trả về từ RPC Supabase match_user_contracts. */
interface RpcUserContractRow {
  content: string;
  contract_title: string;
  similarity: number;
}

/**
 * Triển khai IVectorSearchRepository, gọi các hàm RPC của Supabase
 * (`match_company_documents` và `match_user_contracts`) để tìm kiếm
 * các đoạn tài liệu gần nhất dựa trên vector embedding.
 */
export class SupabaseVectorSearchRepository
  implements IVectorSearchRepository
{
  async matchCompanyDocuments(
    embedding: number[],
    matchCount: number = MATCH_COUNT,
  ): Promise<DocumentChunk[]> {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.rpc("match_company_documents", {
      query_embedding: embedding,
      match_count: matchCount,
      match_threshold: MATCH_THRESHOLD,
    });

    if (error) {
      throw new Error(
        `match_company_documents RPC failed: ${error.message}`,
      );
    }

    const rows = (data ?? []) as RpcCompanyDocumentRow[];

    return rows.map((row) => ({
      content: row.content,
      source: row.document_name,
      similarity: row.similarity,
    }));
  }

  async matchUserContracts(
    embedding: number[],
    userId: string,
    matchCount: number = MATCH_COUNT,
  ): Promise<DocumentChunk[]> {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.rpc("match_user_contracts", {
      query_embedding: embedding,
      query_user_id: userId,
      match_count: matchCount,
      match_threshold: MATCH_THRESHOLD,
    });

    if (error) {
      throw new Error(`match_user_contracts RPC failed: ${error.message}`);
    }

    const rows = (data ?? []) as RpcUserContractRow[];

    return rows.map((row) => ({
      content: row.content,
      source: row.contract_title,
      similarity: row.similarity,
    }));
  }
}
