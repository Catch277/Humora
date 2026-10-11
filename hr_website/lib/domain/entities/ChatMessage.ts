/** Một đoạn tài liệu liên quan được tìm thấy qua vector search. */
export interface DocumentChunk {
  /** Nội dung văn bản của đoạn tài liệu. */
  content: string;
  /** Tên / tiêu đề nguồn tài liệu (dùng để trích dẫn). */
  source: string;
  /** Điểm tương đồng cosine [0, 1]. */
  similarity: number;
}

/** Kết quả trả về từ Chat AI. */
export interface ChatAnswer {
  /** Câu trả lời do LLM sinh ra. */
  answer: string;
  /** Danh sách các đoạn tài liệu được dùng làm ngữ cảnh. */
  sources: DocumentChunk[];
}
