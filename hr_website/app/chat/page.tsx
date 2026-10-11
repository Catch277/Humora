"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Loader2,
  PlusCircle,
  RotateCw,
  Send,
  Sparkles,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import type { DocumentChunk } from "@/lib/domain/entities/ChatMessage";
import type {
  KnowledgeCorpus,
  KnowledgeSources,
} from "@/lib/domain/entities/KnowledgeSource";

/** Câu hỏi gợi ý: đều là câu hỏi về quy chế/tài liệu nội bộ — đúng phạm vi trợ lý tra cứu được. */
const SUGGESTED_QUESTIONS = [
  "Chính sách nghỉ phép năm của công ty là bao nhiêu ngày?",
  "Thủ tục xin đổi ca làm việc như thế nào?",
  "Khi két tiền cuối ca bị hụt thì xử lý theo quy trình nào?",
  "Chính sách phụ cấp ca tối được quy định ra sao?",
];

const MAX_QUESTION_LENGTH = 1000;

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "ai"; text: string; sources: DocumentChunk[] }
  | { id: string; role: "error"; text: string; question: string };

let messageCounter = 0;

function nextMessageId(): string {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

/** Điểm tương đồng cosine [0,1] của vector search, hiển thị theo phần trăm. */
function formatSimilarity(similarity: number): string {
  if (!Number.isFinite(similarity)) {
    return "—";
  }

  return `${Math.round(similarity * 100)}%`;
}

function errorMessageFor(status: number, serverMessage?: string): string {
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại.";
  }

  return (
    serverMessage ??
    "Không thể xử lý yêu cầu. Vui lòng thử lại sau."
  );
}

/** Bảng kê một kho tri thức: tổng số đoạn và vài tài liệu nhiều đoạn nhất. */
function CorpusList({ label, corpus }: { label: string; corpus: KnowledgeCorpus }) {
  const visible = corpus.documents.slice(0, 4);
  const hidden = corpus.documents.length - visible.length;

  return (
    <div>
      <p className="font-semibold text-slate-700">
        {label} · {corpus.totalChunks} đoạn{corpus.truncated ? " (một phần)" : ""}
      </p>
      {corpus.totalChunks === 0 ? (
        <p className="mt-0.5 text-slate-400">Chưa có tài liệu nào.</p>
      ) : (
        <ul className="mt-0.5 space-y-0.5">
          {visible.map((document) => (
            <li key={document.title} className="flex items-start justify-between gap-2">
              <span className="truncate" title={document.title}>
                {document.title}
              </span>
              <span className="shrink-0 tabular-nums text-slate-400">
                {document.chunks}
              </span>
            </li>
          ))}
          {hidden > 0 && <li className="text-slate-400">và {hidden} tài liệu khác…</li>}
        </ul>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [sources, setSources] = useState<KnowledgeSources | null>(null);
  const [sourcesError, setSourcesError] = useState("");
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesReloadToken, setSourcesReloadToken] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Đọc kho tri thức để trả lời "trợ lý lấy thông tin từ đâu": đúng hai bảng mà `/api/chat/ask` đọc.
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<{
      sources: KnowledgeSources | null;
      error: string | null;
    }> {
      const response = await fetch("/api/chat/sources", { cache: "no-store" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          sources: null,
          error: errorMessageFor(response.status, data?.error),
        };
      }

      return { sources: (await response.json()) as KnowledgeSources, error: null };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setSources(result.sources);
        setSourcesError(result.error ?? "");
        setSourcesLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSourcesError("Không đọc được kho tri thức.");
        setSourcesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourcesReloadToken]);

  function refreshSources() {
    setSourcesLoading(true);
    setSourcesError("");
    setSourcesReloadToken((token) => token + 1);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAsking]);

  /** Gọi `/api/chat/ask`: embedding câu hỏi → vector search tài liệu → Gemini sinh câu trả lời. */
  async function ask(question: string) {
    const trimmed = question.trim();

    if (trimmed === "" || isAsking) {
      return;
    }

    setMessages((current) => [
      ...current.filter(
        (message) => message.role !== "error" || message.question !== trimmed,
      ),
      { id: nextMessageId(), role: "user", text: trimmed },
    ]);
    setInput("");
    setIsAsking(true);
    setCopiedId("");

    try {
      const response = await fetch("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setMessages((current) => [
          ...current,
          {
            id: nextMessageId(),
            role: "error",
            text: errorMessageFor(response.status, data?.error),
            question: trimmed,
          },
        ]);
        return;
      }

      const data = (await response.json()) as {
        answer?: unknown;
        sources?: unknown;
      };

      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "ai",
          text:
            typeof data.answer === "string" && data.answer.trim() !== ""
              ? data.answer
              : "Trợ lý không trả về nội dung nào cho câu hỏi này.",
          sources: Array.isArray(data.sources)
            ? (data.sources as DocumentChunk[])
            : [],
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "error",
          text: "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối và thử lại.",
          question: trimmed,
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Gợi ý dưới ô nhập nói "Enter để gửi · Shift + Enter xuống dòng" — xử lý cho đúng lời hứa đó.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(input);
    }
  }

  async function copyAnswer(message: ChatMessage) {
    if (message.role !== "ai") {
      return;
    }

    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
    } catch {
      setCopiedId("");
    }
  }

  function startNewConversation() {
    setMessages([]);
    setInput("");
    setCopiedId("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-surface px-4 py-3 shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <Bot size={18} />
          </span>
          <div>
            <h1 className="text-sm font-bold text-slate-900">
              Trợ lý Nhân sự &amp; Vận hành Humora
            </h1>
            <p className="mt-1 text-[10px] text-slate-500">
              Trả lời câu hỏi về quy chế, quy trình và hợp đồng nội bộ — kèm trích dẫn tài liệu.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-medium text-slate-500">
          <span className="flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1">
            <BookOpen size={11} className="text-primary" />
            Tài liệu công ty
          </span>
          <span className="flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1">
            <FileText size={11} className="text-primary" />
            Hợp đồng của bạn
          </span>
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <Sparkles size={11} />
            gemini-1.5-flash
          </span>
        </div>
      </div>

      <div className="grid min-h-[calc(100dvh-190px)] grid-cols-1 gap-4 lg:grid-cols-[228px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-surface p-3 shadow-sm">
          <button
            type="button"
            onClick={startNewConversation}
            disabled={messages.length === 0 && input === ""}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusCircle size={15} /> Cuộc trò chuyện mới
          </button>

          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Câu hỏi gợi ý
              </h2>
              <Sparkles size={13} className="text-primary" />
            </div>
            <div className="space-y-1">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => setInput(question)}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-[10px] leading-relaxed text-slate-600 transition-colors hover:bg-blue-50 hover:text-slate-800"
                >
                  <span className="flex items-start gap-2">
                    <FileText size={12} className="mt-0.5 shrink-0 text-slate-400" />
                    {question}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Nguồn tri thức
              </h2>
              <button
                type="button"
                onClick={refreshSources}
                disabled={sourcesLoading}
                title="Đọc lại kho tri thức"
                className="text-slate-400 hover:text-primary disabled:opacity-50"
              >
                <RotateCw size={12} className={sourcesLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {sourcesError ? (
              <p className="px-1 text-[9px] leading-relaxed text-rose-600">{sourcesError}</p>
            ) : sources === null ? (
              <p className="px-1 text-[9px] text-slate-400">Đang đọc kho tri thức…</p>
            ) : sources.companyDocuments.totalChunks + sources.userContracts.totalChunks ===
              0 ? (
              <p className="px-1 text-[9px] leading-relaxed text-amber-700">
                Kho tri thức đang <b>trống</b>: trợ lý chưa có gì để tra cứu nên mọi câu hỏi đều
                nhận câu trả lời &ldquo;chưa có thông tin&rdquo;. Cần nhúng nội dung tài liệu vào{" "}
                <code className="rounded bg-slate-100 px-1">company_documents</code> và hợp đồng
                vào <code className="rounded bg-slate-100 px-1">user_contracts</code>.
              </p>
            ) : (
              <div className="space-y-2 px-1 text-[9px] leading-relaxed text-slate-500">
                <CorpusList label="Tài liệu công ty" corpus={sources.companyDocuments} />
                <CorpusList label="Hợp đồng của bạn" corpus={sources.userContracts} />
              </div>
            )}
          </section>

          <section className="border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Phạm vi &amp; giới hạn
              </h2>
              <ShieldCheck size={13} className="text-emerald-600" />
            </div>
            <ul className="space-y-2 px-1 text-[9px] leading-relaxed text-slate-500">
              <li>
                Trợ lý chỉ đọc <b className="text-slate-700">tài liệu công ty</b> và{" "}
                <b className="text-slate-700">hợp đồng của chính bạn</b> qua tìm kiếm vector
                trên Supabase.
              </li>
              <li>
                Không tìm thấy tài liệu liên quan thì trợ lý trả lời là chưa có thông tin,
                thay vì suy đoán.
              </li>
              <li>
                Cuộc trò chuyện <b className="text-slate-700">không được lưu</b> trên máy
                chủ — tải lại trang là mất.
              </li>
            </ul>
          </section>

          <div className="mt-auto flex items-start gap-2 rounded-lg bg-surface-muted px-2.5 py-2 text-[9px] leading-relaxed text-slate-500">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
            Nội dung do AI sinh có thể sai hoặc thiếu — hãy kiểm tra lại với quản lý trước khi
            áp dụng.
          </div>
        </aside>

        <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
                <Sparkles size={16} />
              </span>
              <div>
                <h2 className="text-xs font-bold text-slate-900">Humora Copilot AI</h2>
                <p className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-500">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isAsking ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  {isAsking
                    ? "Đang tạo embedding, tra cứu tài liệu và gọi Gemini..."
                    : "Sẵn sàng · trả lời dựa trên tài liệu nội bộ"}
                </p>
              </div>
            </div>
            <span className="hidden text-[9px] text-slate-400 sm:block">
              {messages.filter((message) => message.role === "ai").length} câu trả lời trong
              phiên này
            </span>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto bg-canvas p-3 sm:p-4">
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-surface/70 px-5 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Bot size={20} />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    Xin chào! Mình có thể giúp gì cho bạn hôm nay?
                  </h3>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    Hỏi về quy chế, quy trình vận hành ca hoặc nội dung hợp đồng lao động. Câu
                    trả lời luôn kèm danh sách đoạn tài liệu đã dùng.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void ask(question)}
                      className="rounded-full border border-slate-200 bg-surface px-3 py-1.5 text-[10px] text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-primary"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <div key={message.id} className="flex justify-end gap-2">
                      <p className="max-w-[80%] whitespace-pre-line rounded-xl rounded-tr-sm bg-primary px-3 py-2 text-xs leading-relaxed text-white">
                        {message.text}
                      </p>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-primary">
                        <UserRound size={14} />
                      </span>
                    </div>
                  );
                }

                if (message.role === "error") {
                  return (
                    <div key={message.id} className="flex gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                        <AlertTriangle size={15} />
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                        <p className="text-xs leading-relaxed text-rose-700">
                          {message.text}
                        </p>
                        <button
                          type="button"
                          onClick={() => void ask(message.question)}
                          disabled={isAsking}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-surface px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <RotateCw size={12} /> Thử lại
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={message.id} className="flex gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                      <Sparkles size={15} />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="rounded-xl rounded-tl-sm border border-slate-200/80 bg-surface p-3 shadow-sm">
                        <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700">
                          {message.text}
                        </p>
                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                          <span className="text-[9px] text-slate-400">
                            {message.sources.length > 0
                              ? `${message.sources.length} đoạn tài liệu liên quan`
                              : "Không tìm thấy đoạn tài liệu nào liên quan"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyAnswer(message)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-primary"
                          >
                            {copiedId === message.id ? (
                              <>
                                <Check size={11} className="text-emerald-600" /> Đã sao chép
                              </>
                            ) : (
                              <>
                                <Copy size={11} /> Sao chép
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {message.sources.length > 0 && (
                        <details className="rounded-lg border border-slate-200/80 bg-surface">
                          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[10px] font-semibold text-primary hover:underline">
                            <span className="flex items-center gap-1.5">
                              <BookOpen size={12} className="text-primary" />
                              Trích dẫn tài liệu ({message.sources.length})
                            </span>
                            <ChevronDown size={13} className="text-slate-400" />
                          </summary>
                          <ul className="divide-y divide-slate-100 border-t border-slate-100">
                            {message.sources.map((source, index) => (
                              <li key={`${source.source}-${index}`} className="px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-slate-700">
                                    <FileText size={11} className="shrink-0 text-slate-400" />
                                    <span className="truncate">
                                      {source.source || "Tài liệu nội bộ"}
                                    </span>
                                  </span>
                                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold tabular-nums text-primary">
                                    Độ liên quan {formatSimilarity(source.similarity)}
                                  </span>
                                </div>
                                <p className="mt-1 whitespace-pre-line text-[10px] leading-relaxed text-slate-500">
                                  {source.content}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {isAsking && (
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Sparkles size={15} />
                </span>
                <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-[10px] text-slate-500">
                  <Loader2 size={13} className="animate-spin text-primary" />
                  Đang tra cứu tài liệu nội bộ...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-slate-100 bg-surface p-3 sm:px-4">
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-slate-200 bg-app p-2 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/10"
            >
              <textarea
                rows={2}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={MAX_QUESTION_LENGTH}
                placeholder="Hỏi trợ lý AI về quy chế công ty, thủ tục đơn từ, hoặc nội dung hợp đồng..."
                className="w-full resize-none bg-transparent px-2 py-1.5 text-xs leading-relaxed outline-none placeholder:text-slate-400"
                disabled={isAsking}
              />
              <div className="flex items-center justify-between px-1">
                <span className="ml-1 text-[9px] text-slate-400">
                  Enter để gửi · Shift + Enter xuống dòng
                  {input.length > MAX_QUESTION_LENGTH - 100 &&
                    ` · ${input.length}/${MAX_QUESTION_LENGTH}`}
                </span>
                <button
                  type="submit"
                  disabled={input.trim() === "" || isAsking}
                  title="Gửi câu hỏi"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-strong disabled:bg-slate-300"
                >
                  {isAsking ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
            </form>
            <p className="mt-2 text-center text-[9px] text-slate-400">
              <ShieldCheck size={10} className="mr-1 inline text-emerald-600" />
              Câu hỏi được gửi tới /api/chat/ask và chỉ đối chiếu với tài liệu công ty cùng hợp
              đồng của bạn.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
