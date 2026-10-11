import type { DocumentChunk } from "@/lib/domain/entities/ChatMessage";

/**
 * Service tương tác với LLM (Large Language Model).
 * Cung cấp khả năng tạo embedding và sinh câu trả lời.
 */
export interface ILLMService {
  /**
   * Tạo vector embedding cho một đoạn văn bản.
   * Sử dụng model `text-embedding-004` của Google Gemini.
   *
   * @param text - Đoạn văn bản cần nhúng (embed).
   * @returns Mảng số thực đại diện cho vector embedding.
   */
  createEmbedding(text: string): Promise<number[]>;

  /**
   * Sinh câu trả lời từ LLM dựa trên câu hỏi và các đoạn ngữ cảnh.
   * Sử dụng model `gemini-1.5-flash`.
   *
   * @param question - Câu hỏi của người dùng.
   * @param context  - Danh sách các đoạn tài liệu liên quan làm ngữ cảnh.
   * @returns Câu trả lời do LLM sinh ra (string).
   */
  chat(question: string, context: DocumentChunk[]): Promise<string>;
}
