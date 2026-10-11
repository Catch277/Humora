import type { KnowledgeSources } from "@/lib/domain/entities/KnowledgeSource";
import type { IKnowledgeSourceRepository } from "@/lib/domain/repositories/IKnowledgeSourceRepository";

/**
 * Nguồn tri thức của trợ lý AI (`company_documents` + hợp đồng của người hỏi).
 *
 * Màn hình Trợ lý AI dùng nó để trả lời "trợ lý lấy thông tin từ đâu": chat chỉ đọc được hai kho
 * này, nên khi cả hai rỗng thì mọi câu hỏi đều nhận câu trả lời "không có thông tin".
 */
export class ListKnowledgeSourcesUseCase {
  constructor(
    private readonly knowledgeSourceRepository: IKnowledgeSourceRepository,
  ) {}

  async execute(userId: string): Promise<KnowledgeSources> {
    return this.knowledgeSourceRepository.listForUser(userId);
  }
}
