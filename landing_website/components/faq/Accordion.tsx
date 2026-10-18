"use client";

import { useState } from "react";

export type FaqItem = { question: string; answer: string };

/* Accordion truy cập được: mỗi mục là <button aria-expanded>, mở một mục thì đóng mục kia.
   Chiều cao mở mượt bằng grid-template-rows (0fr → 1fr). */
export default function Accordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white shadow-soft">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.question}>
            <h3>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={open}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpenIndex(open ? null : i)}
                className="flex w-full items-center justify-between gap-4 rounded-3xl px-6 py-5 text-left font-heading text-base font-bold text-ink transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-8 sm:text-lg"
              >
                {item.question}
                <span
                  aria-hidden="true"
                  className={`grid size-8 shrink-0 place-items-center rounded-full transition-all duration-300 ${
                    open ? "rotate-45 bg-blue-600 text-white" : "bg-brand-mist text-blue-600"
                  }`}
                >
                  <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                </span>
              </button>
            </h3>

            <div
              id={`faq-a-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              inert={!open}
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-6 pb-6 leading-relaxed text-body sm:px-8">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}