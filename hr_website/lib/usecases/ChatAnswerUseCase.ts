import type { ChatAnswer } from "@/lib/domain/entities/ChatMessage";
import type { ILLMService } from "@/lib/domain/repositories/ILLMService";
import type { IVectorSearchRepository } from "@/lib/domain/repositories/IVectorSearchRepository";

/** Tổng số chunk tối đa lấy từ mỗi nguồn (company docs + user contracts). */
const MATCH_COUNT = 5;

/**
 * Use case điều phối toàn bộ luồng Chat AI:
 * 1. Tạo embedding cho câu hỏi (ILLMService.createEmbedding).
 * 2. Tìm kiếm tài liệu công ty và hợp đồng cá nhân song song (IVectorSearchRepository).
 * 3. Gắn ngữ cảnh vào prompt và gọi LLM sinh câu trả lời (ILLMService.chat).
 */
export class ChatAnswerUseCase {
  constructor(
    private readonly vectorSearchRepo: IVectorSearchRepository,
    private readonly llmService: ILLMService,
  ) {}

  /**
   * Thực thi luồng chat AI.
   *
   * @param question - Câu hỏi thuần văn bản của người dùng.
   * @param userId   - UUID của người dùng hiện tại (lấy từ session Supabase).
   * @returns ChatAnswer gồm câu trả lời và danh sách nguồn tài liệu.
   */
  async execute(question: string, userId: string): Promise<ChatAnswer> {
    // 1. Tạo embedding cho câu hỏi
    const embedding = await this.llmService.createEmbedding(question);

    // 2. Tìm kiếm song song trong cả 2 nguồn tài liệu
    const [companyDocs, userContracts] = await Promise.all([
      this.vectorSearchRepo.matchCompanyDocuments(embedding, MATCH_COUNT),
      this.vectorSearchRepo.matchUserContracts(embedding, userId, MATCH_COUNT),
    ]);

    // 3. Gộp và sắp xếp theo độ tương đồng giảm dần
    const allChunks = [...companyDocs, ...userContracts].sort(
      (a, b) => b.similarity - a.similarity,
    );

    // 4. Gọi LLM sinh câu trả lời với ngữ cảnh
    const answer = await this.llmService.chat(question, allChunks);

    return { answer, sources: allChunks };
  }
}
