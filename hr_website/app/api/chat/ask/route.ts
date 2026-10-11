/**
 * @swagger
 * /api/chat/ask:
 *   post:
 *     summary: Hỏi đáp chính sách, quy định và hợp đồng bằng AI
 *     description: |
 *       Nhận câu hỏi từ người dùng, tạo embedding bằng Gemini `gemini-embedding-001`
 *       (768 chiều, khớp cột vector trong database), tìm kiếm các đoạn tài liệu liên quan
 *       qua Supabase vector search (`match_company_documents` và `match_user_contracts`),
 *       sau đó gọi `gemini-3.5-flash` để sinh câu trả lời có trích dẫn nguồn.
 *
 *       **Quy tắc trả lời của AI:**
 *       - Chỉ trả lời dựa trên nội dung tài liệu nội bộ tìm được.
 *       - Trích dẫn rõ nguồn tài liệu trong câu trả lời.
 *       - Nếu không có thông tin, trả lời: *"Tôi không có thông tin về vấn đề này. Vui lòng liên hệ quản lý để được hỗ trợ."*
 *     tags:
 *       - Chat AI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatAskRequest'
 *     responses:
 *       200:
 *         description: Câu trả lời được sinh bởi AI kèm danh sách nguồn tài liệu.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatAskResponse'
 *       400:
 *         description: Thiếu hoặc sai định dạng trường `question`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Người dùng chưa đăng nhập hoặc session hết hạn.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi máy chủ nội bộ (Supabase RPC hoặc Gemini API).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { type NextRequest, NextResponse } from "next/server";

import { GeminiLLMService } from "@/lib/infrastructure/GeminiLLMService";
import { SupabaseVectorSearchRepository } from "@/lib/infrastructure/repositories/SupabaseVectorSearchRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { ChatAnswerUseCase } from "@/lib/usecases/ChatAnswerUseCase";

export async function POST(request: NextRequest) {
  // 1. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body phải là JSON hợp lệ." },
      { status: 400 },
    );
  }

  // 2. Validate input
  if (
    typeof body !== "object" ||
    body === null ||
    !("question" in body) ||
    typeof (body as Record<string, unknown>).question !== "string" ||
    ((body as Record<string, unknown>).question as string).trim() === ""
  ) {
    return NextResponse.json(
      { error: "Trường `question` là bắt buộc và phải là chuỗi không rỗng." },
      { status: 400 },
    );
  }

  const question = (
    (body as Record<string, unknown>).question as string
  ).trim();

  // 3. Xác thực session người dùng
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập để sử dụng tính năng này." },
      { status: 401 },
    );
  }

  // 4. Khởi tạo dependencies và thực thi use case
  try {
    const vectorSearchRepo = new SupabaseVectorSearchRepository();
    const llmService = new GeminiLLMService();
    const useCase = new ChatAnswerUseCase(vectorSearchRepo, llmService);

    const result = await useCase.execute(question, user.id);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    console.error("[POST /api/chat/ask] Error:", message, error);
    return NextResponse.json(
      { error: "Không thể xử lý yêu cầu. Vui lòng thử lại sau." },
      { status: 500 },
    );
  }
}
