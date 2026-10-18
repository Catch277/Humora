import type { ReactNode } from "react";
import Link from "next/link";
import { CONTACT_INFO } from "@/lib/contact";
import { COMPANY_NAME, EFFECTIVE_DATE, TAX_CODE } from "@/lib/legal";

export type LegalSection = { id: string; title: string; content: ReactNode };

/* ── Các khối chữ dùng trong nội dung pháp lý ─────────────── */
export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-blue-600">{children}</ul>;
}

export function Sub({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 font-heading text-lg font-bold text-ink">{children}</h3>;
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-blue-600/15 bg-brand-mist/70 px-5 py-4 text-ink">
      {children}
    </div>
  );
}

/* Thông tin đơn vị – chỉ hiện mục nào đã có dữ liệu thật */
export function CompanyContact() {
  const rows: [string, string][] = [["Đơn vị", COMPANY_NAME]];
  if (TAX_CODE) rows.push(["Mã số thuế", TAX_CODE]);
  if (CONTACT_INFO.address) rows.push(["Địa chỉ", CONTACT_INFO.address]);
  if (CONTACT_INFO.email) rows.push(["Email", CONTACT_INFO.email]);
  if (CONTACT_INFO.phone) rows.push(["Hotline", CONTACT_INFO.phone]);

  return (
    <>
      <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-surface p-5 sm:grid-cols-[8rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-ink">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p>
        Bạn cũng có thể gửi yêu cầu trực tiếp qua{" "}
        <Link
          href="/contact?intent=other"
          className="font-semibold text-blue-600 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          trang Liên hệ
        </Link>
        .
      </p>
    </>
  );
}

/* ── Khung tài liệu: tiêu đề, mục lục, các mục đánh số ────── */
export default function LegalDocument({
  title,
  intro,
  sections,
  other,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  other: { label: string; href: string };
}) {
  const toc = (
    <ol className="space-y-0.5 border-l border-slate-200">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-body transition-colors hover:border-blue-600 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {i + 1}. {s.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_30%_at_85%_8%,rgba(37,99,235,0.09),transparent_70%)]"
      />

      <header className="mx-auto max-w-6xl px-6 pb-10 pt-28 sm:pt-32">
        <h1 className="font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-sm font-medium text-slate-500">
          Có hiệu lực từ {EFFECTIVE_DATE}
        </p>
        <div className="mt-5 max-w-3xl space-y-3 text-lg leading-relaxed text-body">{intro}</div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-24 lg:grid-cols-[15rem_1fr] lg:gap-14">
        {/* Mục lục */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <details className="rounded-2xl border border-slate-200 bg-white lg:hidden">
            <summary className="cursor-pointer list-none rounded-2xl px-5 py-3.5 font-heading font-bold text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
              Mục lục
            </summary>
            <nav aria-label="Mục lục" className="px-5 pb-4">
              {toc}
            </nav>
          </details>
          <nav aria-label="Mục lục" className="hidden lg:block">
            <p className="mb-3 font-heading font-bold text-ink">Mục lục</p>
            {toc}
          </nav>
        </aside>

        {/* Nội dung */}
        <div className="min-w-0">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-10">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                className={i > 0 ? "mt-10 border-t border-slate-100 pt-10" : ""}
              >
                <h2 className="font-heading text-2xl font-bold tracking-tight text-ink">
                  {i + 1}. {s.title}
                </h2>
                <div className="mt-4 space-y-4 leading-relaxed text-body">{s.content}</div>
              </section>
            ))}
          </article>

          <div className="mt-8 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={other.href}
              className="font-semibold text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Xem thêm: {other.label}
            </Link>
            <Link
              href="/"
              className="text-body hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}