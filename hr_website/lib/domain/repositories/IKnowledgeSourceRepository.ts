import type { KnowledgeSources } from "@/lib/domain/entities/KnowledgeSource";

export interface IKnowledgeSourceRepository {
  /**
   * Liệt kê kho tri thức mà `userId` tra cứu được: toàn bộ `company_documents` và phần
   * `user_contracts` thuộc chính người đó (RLS quyết định phần nhìn thấy được, giống như khi chat).
   */
  listForUser(userId: string): Promise<KnowledgeSources>;
}
