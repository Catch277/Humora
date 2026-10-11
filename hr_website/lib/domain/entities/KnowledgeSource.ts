/**
 * Một tài liệu trong kho tri thức của trợ lý AI.
 *
 * `title` là tiêu đề tài liệu (`company_documents.title` / `user_contracts.title` — RPC `match_*`
 * trả về nó dưới tên `document_name`), `chunks` là số đoạn đã được nhúng vector cho tài liệu đó.
 */
export interface KnowledgeSourceSummary {
  title: string;
  chunks: number;
}

/**
 * Một kho tài liệu mà trợ lý tra cứu được: tổng số đoạn, và (tuỳ chọn) bảng kê theo tài liệu.
 *
 * `truncated` = true khi bảng kê chỉ đọc một phần số đoạn, lúc đó `chunks` là **cận dưới** chứ không
 * phải con số chính xác — `totalChunks` thì luôn chính xác vì lấy từ `count: "exact"`.
 */
export interface KnowledgeCorpus {
  totalChunks: number;
  documents: KnowledgeSourceSummary[];
  truncated: boolean;
}

/**
 * Nguồn tri thức của trợ lý AI: tài liệu công ty và hợp đồng của chính người hỏi.
 *
 * Đây là câu trả lời cho "trợ lý lấy thông tin từ đâu": chat chỉ đọc được hai kho này, nên khi cả
 * hai đều rỗng thì mọi câu hỏi đều nhận câu trả lời "không có thông tin".
 */
export interface KnowledgeSources {
  companyDocuments: KnowledgeCorpus;
  userContracts: KnowledgeCorpus;
}
