import {
  GoogleGenerativeAI,
  type EmbedContentRequest,
  type GenerateContentResult,
} from "@google/generative-ai";

import type { DocumentChunk } from "@/lib/domain/entities/ChatMessage";
import type { ILLMService } from "@/lib/domain/repositories/ILLMService";

/**
 * Model dùng để tạo embedding.
 *
 * `text-embedding-004` (model cũ) đã bị Google khai tử: gọi vào sẽ trả 404
 * "is not found for API version v1beta, or is not supported for embedContent". `gemini-embedding-001`
 * là model embedding còn hiệu lực và trả về đúng `EMBEDDING_DIMENSIONS` chiều khi được yêu cầu.
 */
const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Số chiều vector embedding — **phải khớp kiểu cột `vector(n)` trong database**.
 * `text-embedding-004` cũng trả về 768 chiều, nên 768 là giá trị mà các bảng
 * `company_documents` / `user_contracts` đang được tạo theo. `gemini-embedding-001` mặc định trả
 * 3072 chiều, vì vậy tham số `outputDimensionality` bên dưới là bắt buộc, không phải tuỳ chọn.
 */
const EMBEDDING_DIMENSIONS = 768;

/**
 * Model dùng để sinh câu trả lời.
 *
 * `gemini-1.5-flash` (model cũ) đã bị khai tử (404 khi gọi) và `gemini-2.5-flash` bị chặn với
 * project mới ("no longer available to new users"). `gemini-3.5-flash` đang mở cho khoá API này và
 * trả lời đúng vai trợ lý có trích dẫn nguồn (đo 4/4 lần gọi thành công).
 *
 * Không dùng bí danh `gemini-flash-latest`: nó trỏ vào model mới nhất đang quá tải, đo được 2/4 lần
 * trả 503 "experiencing high demand". `gemini-3.5-flash-lite` là lựa chọn rẻ hơn nếu cần (cũng 4/4).
 */
const CHAT_MODEL = "gemini-3.5-flash";

/**
 * Yêu cầu embedding kèm `outputDimensionality`.
 *
 * SDK `@google/generative-ai` 0.24.1 chưa khai báo trường này trong `EmbedContentRequest`, nhưng
 * vẫn gửi nguyên object lên API (`formatEmbedContentInput` trả lại object không đổi và body là
 * `JSON.stringify(params)`), nên chỉ cần mở rộng kiểu — không cần cast.
 */
type EmbedContentRequestWithDimensions = EmbedContentRequest & {
  outputDimensionality?: number;
};

/**
 * Câu trả lời mặc định khi ngữ cảnh không chứa thông tin liên quan.
 * Được LLM trả về theo đúng quy tắc Prompt.
 */
const NO_INFO_RESPONSE =
  "Tôi không có thông tin về vấn đề này. Vui lòng liên hệ quản lý để được hỗ trợ.";

/**
 * Triển khai ILLMService sử dụng Google Gemini API.
 * - Embedding: `gemini-embedding-001`, cố định `EMBEDDING_DIMENSIONS` chiều
 * - Chat completion: `gemini-flash-latest` (bí danh của model flash mới nhất)
 */
export class GeminiLLMService implements ILLMService {
  private readonly client: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }

    this.client = new GoogleGenerativeAI(apiKey);
  }

  /** Tạo vector embedding cho một đoạn văn bản. */
  async createEmbedding(text: string): Promise<number[]> {
    const model = this.client.getGenerativeModel({ model: EMBEDDING_MODEL });

    const request: EmbedContentRequestWithDimensions = {
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    };

    const result = await model.embedContent(request);

    return result.embedding.values;
  }

  /** Sinh câu trả lời từ LLM dựa trên câu hỏi và ngữ cảnh tài liệu. */
  async chat(question: string, context: DocumentChunk[]): Promise<string> {
    const model = this.client.getGenerativeModel({ model: CHAT_MODEL });

    const contextBlock =
      context.length === 0
        ? "(Không có tài liệu liên quan nào được tìm thấy.)"
        : context
            .map(
              (chunk, idx) =>
                `[Nguồn ${idx + 1}: ${chunk.source}]\n${chunk.content}`,
            )
            .join("\n\n---\n\n");

    const prompt = `Bạn là trợ lý HR thông minh. Nhiệm vụ của bạn là trả lời câu hỏi của nhân viên dựa trên các tài liệu nội bộ được cung cấp bên dưới.

QUY TẮC BẮT BUỘC:
1. Chỉ trả lời dựa trên nội dung trong phần NGỮ CẢNH bên dưới.
2. Khi trích dẫn thông tin, hãy ghi rõ nguồn (ví dụ: "Theo [Nguồn 1: Tên tài liệu]...").
3. Nếu ngữ cảnh KHÔNG chứa đủ thông tin để trả lời, hãy trả lời CHÍNH XÁC câu sau và không thêm bất kỳ thông tin nào khác: "${NO_INFO_RESPONSE}"
4. Tuyệt đối không bịa đặt, suy diễn hay thêm thông tin ngoài ngữ cảnh.

NGỮ CẢNH TÀI LIỆU:
${contextBlock}

CÂU HỎI CỦA NHÂN VIÊN:
${question}

TRẢ LỜI:`;

    const result: GenerateContentResult = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    return text.trim();
  }
}
