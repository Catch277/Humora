import type { DocumentChunk } from "@/lib/domain/entities/ChatMessage";

/**
 * Repository tìm kiếm tài liệu dựa trên vector embedding.
 * Kết quả là danh sách các đoạn tài liệu gần nhất với câu hỏi.
 */
export interface IVectorSearchRepository {
  /**
   * Tìm kiếm trong bảng tài liệu công ty (chính sách, quy định...).
   * Gọi RPC `match_company_documents` trên Supabase.
   *
   * @param embedding - Vector embedding của câu hỏi (float[]).
   * @param matchCount - Số lượng kết quả tối đa muốn lấy.
   * @returns Danh sách đoạn tài liệu phù hợp nhất.
   */
  matchCompanyDocuments(
    embedding: number[],
    matchCount: number,
  ): Promise<DocumentChunk[]>;

  /**
   * Tìm kiếm trong bảng hợp đồng cá nhân của người dùng.
   * Gọi RPC `match_user_contracts` trên Supabase.
   *
   * @param embedding - Vector embedding của câu hỏi (float[]).
   * @param userId   - UUID của người dùng hiện tại (lấy từ session).
   * @param matchCount - Số lượng kết quả tối đa muốn lấy.
   * @returns Danh sách đoạn tài liệu phù hợp nhất.
   */
  matchUserContracts(
    embedding: number[],
    userId: string,
    matchCount: number,
  ): Promise<DocumentChunk[]>;
}
