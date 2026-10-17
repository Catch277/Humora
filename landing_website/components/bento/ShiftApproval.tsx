"use client";

import { useState } from "react";

const REQUESTS = [
  { id: 1, initial: "L", name: "Lan", text: "Xin nghỉ ca tối thứ 6" },
  { id: 2, initial: "M", name: "Minh", text: "Đổi ca sáng thứ 7" },
];

/* Mini demo: bấm "Duyệt" để thấy trạng thái đổi ngay – bấm lại để hoàn tác */
export default function ShiftApproval() {
  const [approved, setApproved] = useState<Record<number, boolean>>({});

  const toggle = (id: number) =>
    setApproved((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="mt-6 rounded-2xl bg-surface p-4">
      <ul className="space-y-2.5">
        {REQUESTS.map((r) => {
          const done = !!approved[r.id];
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-mist text-sm font-semibold text-blue-600">
                {r.initial}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-semibold text-ink">{r.name}</p>
                <p className="truncate text-xs text-body">{r.text}</p>
              </div>
              <button
                type="button"
                aria-pressed={done}
                onClick={() => toggle(r.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  done
                    ? "bg-success/15 text-emerald-700"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {done ? "Đã duyệt ✓" : "Duyệt"}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-center text-xs text-slate-400">Bấm “Duyệt” để thử</p>
    </div>
  );
}