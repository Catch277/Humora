"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CONTACT_INFO } from "@/lib/contact";
import { submitLead } from "@/lib/lead";
import { MAX_STANDARD, PLANS, formatVnd, quote } from "@/components/pricing/data";

/* ── Chủ đề liên hệ ───────────────────────────────────────── */
const TOPICS = [
  {
    id: "demo",
    label: "Đặt lịch Demo",
    title: "Đặt lịch Demo 20 phút",
    subtitle:
      "Xem Humora chạy với đúng quy trình ca làm của bạn. Chúng tôi sẽ liên hệ để chốt giờ phù hợp.",
    submit: "Đặt lịch Demo",
  },
  {
    id: "trial",
    label: "Dùng thử miễn phí",
    title: "Dùng thử miễn phí 14 ngày",
    subtitle:
      "Để lại thông tin, chúng tôi sẽ giúp bạn thiết lập trong khoảng 15 phút. Không cần thẻ tín dụng.",
    submit: "Bắt đầu dùng thử",
  },
  {
    id: "quote",
    label: "Nhận báo giá",
    title: "Nhận báo giá cho doanh nghiệp của bạn",
    subtitle:
      "Cho nhu cầu riêng hoặc đội ngũ trên 500 nhân viên, chúng tôi sẽ gửi báo giá phù hợp.",
    submit: "Nhận báo giá",
  },
  {
    id: "other",
    label: "Câu hỏi khác",
    title: "Liên hệ với Humora",
    subtitle: "Hỏi về tính năng, giá hoặc cách chuyển từ Excel sang Humora.",
    submit: "Gửi tin nhắn",
  },
] as const;
type Topic = (typeof TOPICS)[number]["id"];

const ASSURANCES = [
  "Phản hồi trong ngày làm việc",
  "Không cần thẻ tín dụng",
  "Hỗ trợ thiết lập ban đầu",
];

const PLAN_OPTIONS = [
  { value: "", label: "Chưa chọn" },
  ...PLANS.map((p) => ({ value: p.id as string, label: p.name })),
  { value: "enterprise", label: "Doanh nghiệp (trên 500 nhân viên)" },
];

/* ── Đọc tham số URL ──────────────────────────────────────── */
function parseTopic(v: string | null): Topic {
  return TOPICS.some((t) => t.id === v) ? (v as Topic) : "other";
}
function parsePlan(v: string | null): string {
  return PLAN_OPTIONS.some((o) => o.value && o.value === v) ? (v as string) : "";
}
function parseEmployees(v: string | null): string {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 99999 ? String(n) : "";
}

/* ── Kiểu dáng dùng chung ─────────────────────────────────── */
const inputBase =
  "block w-full rounded-xl border bg-white px-4 py-3 text-base text-ink outline-none transition placeholder:text-slate-400 focus:ring-4";
const inputClass = (error?: string) =>
  `${inputBase} ${
    error
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/15"
      : "border-slate-300 focus:border-blue-600 focus:ring-blue-600/15"
  }`;

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-slate-400">Không bắt buộc</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-sm text-body">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+().\s-]{8,16}$/;

type Status = "idle" | "submitting" | "success" | "error";

/* ── Thân trang (giữ state; remount khi URL đổi nhờ key) ──── */
function ContactBody({
  initialTopic,
  initialPlan,
  initialEmployees,
}: {
  initialTopic: Topic;
  initialPlan: string;
  initialEmployees: string;
}) {
  const [topic, setTopic] = useState<Topic>(initialTopic);
  const [plan, setPlan] = useState(initialPlan);
  const [employees, setEmployees] = useState(initialEmployees);
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failMessage, setFailMessage] = useState("");
  const [sentName, setSentName] = useState("");
  const successRef = useRef<HTMLHeadingElement>(null);

  const current = TOPICS.find((t) => t.id === topic)!;

  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  /* Tóm tắt gói đang quan tâm – đồng bộ với bảng giá */
  const empCount = Number.parseInt(employees, 10);
  const planInfo = PLANS.find((p) => p.id === plan);
  const q = planInfo && Number.isFinite(empCount) && empCount >= 1 ? quote(empCount, planInfo.id) : null;
  const isEnterprise = plan === "enterprise" || (Number.isFinite(empCount) && empCount > MAX_STANDARD);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const get = (k: string) => String(data.get(k) ?? "").trim();

    const name = get("name");
    const email = get("email");
    const phone = get("phone");

    const next: Record<string, string> = {};
    if (name.length < 2) next.name = "Vui lòng nhập họ và tên.";
    if (!email) next.email = "Vui lòng nhập email.";
    else if (!EMAIL_RE.test(email)) next.email = "Email chưa đúng định dạng.";
    if (phone && !PHONE_RE.test(phone)) next.phone = "Số điện thoại chưa hợp lệ.";
    if (employees && !/^\d{1,5}$/.test(employees)) next.employees = "Vui lòng nhập số nguyên.";

    setErrors(next);
    const firstInvalid = ["name", "email", "phone", "employees"].find((k) => next[k]);
    if (firstInvalid) {
      (form.elements.namedItem(firstInvalid) as HTMLElement | null)?.focus();
      return;
    }

    // Ô bẫy bot: người thật không thấy nên không điền
    if (get("website")) {
      setSentName(name);
      setStatus("success");
      return;
    }

    setStatus("submitting");
    setFailMessage("");
    try {
      await submitLead({
        topic,
        name,
        email,
        phone,
        company: get("company"),
        employees,
        plan,
        message: get("message"),
        source: "landing",
      });
      setSentName(name);
      setStatus("success");
    } catch (err) {
      const noEndpoint = err instanceof Error && err.message === "NO_ENDPOINT";
      setFailMessage(
        noEndpoint && process.env.NODE_ENV !== "production"
          ? "Biểu mẫu chưa được kết nối nơi nhận dữ liệu. Hãy khai báo NEXT_PUBLIC_LEAD_ENDPOINT trong .env.local."
          : "Chưa gửi được yêu cầu. Vui lòng thử lại sau ít phút.",
      );
      setStatus("error");
    }
  }

  const submitting = status === "submitting";

  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_85%_20%,rgba(37,99,235,0.10),transparent_70%)]"
      />

      <div className="mx-auto grid max-w-6xl items-start gap-12 px-6 pb-24 pt-28 sm:pt-32 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        {/* ── Cột trái: nội dung theo chủ đề ── */}
        <div className="lg:sticky lg:top-28">
          <h1 className="font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            {current.title}
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-body">{current.subtitle}</p>

          <ul className="mt-8 space-y-3">
            {ASSURANCES.map((item) => (
              <li key={item} className="flex items-center gap-3 font-medium text-ink">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success/15 text-emerald-700">
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 10.5l3.2 3.2L15 7" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>

          {(q || (planInfo && isEnterprise) || plan === "enterprise") && (
            <div className="mt-8 max-w-lg rounded-2xl border border-blue-600/15 bg-brand-mist/70 p-5" aria-live="polite">
              <p className="text-sm font-semibold text-blue-700">Bạn đang quan tâm</p>
              {isEnterprise ? (
                <p className="mt-1 text-ink">
                  Doanh nghiệp trên {MAX_STANDARD} nhân viên: chúng tôi sẽ gửi <strong>báo giá riêng</strong>.
                </p>
              ) : (
                q &&
                planInfo && (
                  <p className="mt-1 text-ink">
                    Gói <strong>{planInfo.name}</strong>, {empCount} nhân viên:{" "}
                    <strong className="tabular-nums">khoảng {formatVnd(q.total)} ₫/tháng</strong>
                  </p>
                )
              )}
              <Link
                href="/#pricing"
                className="mt-2 inline-block rounded text-sm font-semibold text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Xem lại bảng giá
              </Link>
            </div>
          )}

          {(CONTACT_INFO.email || CONTACT_INFO.phone || CONTACT_INFO.address) && (
            <dl className="mt-10 space-y-4 border-t border-slate-200 pt-8 text-sm">
              {CONTACT_INFO.email && (
                <div>
                  <dt className="font-semibold text-ink">Email</dt>
                  <dd className="mt-0.5"><a className="text-blue-600 hover:underline" href={`mailto:${CONTACT_INFO.email}`}>{CONTACT_INFO.email}</a></dd>
                </div>
              )}
              {CONTACT_INFO.phone && (
                <div>
                  <dt className="font-semibold text-ink">Hotline</dt>
                  <dd className="mt-0.5"><a className="text-blue-600 hover:underline" href={`tel:${CONTACT_INFO.phone.replace(/\s/g, "")}`}>{CONTACT_INFO.phone}</a></dd>
                </div>
              )}
              {CONTACT_INFO.address && (
                <div>
                  <dt className="font-semibold text-ink">Địa chỉ</dt>
                  <dd className="mt-0.5 text-body">{CONTACT_INFO.address}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {/* ── Cột phải: biểu mẫu ── */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(30,58,138,0.25)] sm:p-9">
          {status === "success" ? (
            <div className="py-6 text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-success/15 text-emerald-700">
                <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <h2
                ref={successRef}
                tabIndex={-1}
                className="mt-6 font-heading text-2xl font-extrabold tracking-tight text-ink outline-none"
              >
                Cảm ơn {sentName}!
              </h2>
              <p className="mx-auto mt-3 max-w-sm leading-relaxed text-body">
                Chúng tôi đã nhận yêu cầu của bạn và sẽ phản hồi trong ngày làm việc.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Về trang chủ
                </Link>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-6 py-3 font-semibold text-ink transition-colors hover:border-blue-600 hover:bg-brand-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Gửi yêu cầu khác
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-5">
              {/* Chọn chủ đề */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">Bạn cần gì?</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TOPICS.map((t) => (
                    <label key={t.id} className="cursor-pointer">
                      <input
                        type="radio"
                        name="topic"
                        value={t.id}
                        checked={topic === t.id}
                        onChange={() => setTopic(t.id)}
                        className="peer sr-only"
                      />
                      <span className="block rounded-xl border border-slate-300 px-2 py-2.5 text-center text-sm font-semibold text-body transition-colors hover:border-blue-600 peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600">
                        {t.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="name" label="Họ và tên" error={errors.name}>
                  <input
                    id="name"
                    name="name"
                    autoComplete="name"
                    placeholder="Nguyễn Văn A"
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "name-error" : undefined}
                    className={inputClass(errors.name)}
                  />
                </Field>
                <Field id="email" label="Email" error={errors.email}>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="ban@congty.vn"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    className={inputClass(errors.email)}
                  />
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="phone" label="Số điện thoại" optional error={errors.phone} hint="Để chúng tôi gọi nhanh hơn.">
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="09xx xxx xxx"
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
                    className={inputClass(errors.phone)}
                  />
                </Field>
                <Field id="company" label="Tên doanh nghiệp" optional>
                  <input
                    id="company"
                    name="company"
                    autoComplete="organization"
                    placeholder="Cửa hàng / công ty của bạn"
                    className={inputClass()}
                  />
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="employees" label="Số nhân viên" optional error={errors.employees}>
                  <input
                    id="employees"
                    name="employees"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    placeholder="Ví dụ: 30"
                    value={employees}
                    onChange={(e) => setEmployees(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    aria-invalid={!!errors.employees}
                    aria-describedby={errors.employees ? "employees-error" : undefined}
                    className={`${inputClass(errors.employees)} tabular-nums`}
                  />
                </Field>
                <Field id="plan" label="Gói quan tâm" optional>
                  <select
                    id="plan"
                    name="plan"
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    className={inputClass()}
                  >
                    {PLAN_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field id="message" label="Lời nhắn" optional>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  placeholder="Bạn đang quản lý ca làm thế nào, và muốn Humora giải quyết điều gì?"
                  className={`${inputClass()} resize-y`}
                />
              </Field>

              {/* Ô bẫy bot – ẩn với người dùng */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              {status === "error" && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {failMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.65)] transition duration-200 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting && (
                  <svg viewBox="0 0 24 24" className="size-5 animate-spin" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                {submitting ? "Đang gửi…" : current.submit}
              </button>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                Bằng việc gửi, bạn đồng ý để Humora liên hệ lại về yêu cầu này. Xem{" "}
                <Link href="/privacy" className="font-semibold text-blue-600 underline-offset-2 hover:underline">
                  Chính sách bảo mật
                </Link>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Điểm vào: đọc URL, remount khi tham số đổi ───────────── */
export default function ContactSection() {
  const sp = useSearchParams();
  return (
    <ContactBody
      key={sp.toString()}
      initialTopic={parseTopic(sp.get("intent"))}
      initialPlan={parsePlan(sp.get("plan"))}
      initialEmployees={parseEmployees(sp.get("employees"))}
    />
  );
}