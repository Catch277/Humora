/**
 * @swagger
 * /api/chat/sources:
 *   get:
 *     summary: Liệt kê kho tri thức mà trợ lý AI tra cứu được
 *     description: |
 *       Trả về đúng hai kho mà `POST /api/chat/ask` đọc: tài liệu công ty (`company_documents`) và
 *       hợp đồng của chính người gọi (`user_contracts`, lọc theo `user_id`). RLS quyết định phần nhìn
 *       thấy được — giống hệt khi trả lời, nên đây là câu trả lời cho "trợ lý lấy thông tin từ đâu".
 *
 *       Nếu `totalChunks` bằng 0 ở cả hai kho thì mọi câu hỏi sẽ nhận câu trả lời
 *       *"Tôi không có thông tin về vấn đề này…"*, vì trợ lý chỉ trả lời dựa trên hai kho này.
 *     tags:
 *       - Chat AI
 *     responses:
 *       200:
 *         description: Kho tri thức nhìn thấy được từ session hiện tại.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KnowledgeSources'
 *       401:
 *         description: Người dùng chưa đăng nhập hoặc session hết hạn.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi máy chủ nội bộ khi đọc kho tri thức.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { SupabaseKnowledgeSourceRepository } from "@/lib/infrastructure/repositories/SupabaseKnowledgeSourceRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { ListKnowledgeSourcesUseCase } from "@/lib/usecases/ListKnowledgeSourcesUseCase";

export async function GET() {
  try {
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

    const useCase = new ListKnowledgeSourcesUseCase(
      new SupabaseKnowledgeSourceRepository(),
    );
    const sources = await useCase.execute(user.id);

    return NextResponse.json(sources);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    console.error("[GET /api/chat/sources] Error:", message, error);
    return NextResponse.json(
      { error: "Không thể đọc kho tri thức. Vui lòng thử lại sau." },
      { status: 500 },
    );
  }
}
