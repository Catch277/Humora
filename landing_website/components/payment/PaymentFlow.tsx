"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MAX_STANDARD, MIN_FEE, PLANS, formatVnd, quote, type PlanId } from "@/components/pricing/data";

/* ─────────────────────────────────────────────────────────────
   Thanh toán MoMo (mô phỏng).

   Trang này KHÔNG gọi API MoMo thật và KHÔNG thu tiền: toàn bộ luồng
   (nhập số điện thoại → xác nhận → mã giao dịch) chạy trong trình duyệt
   để phục vụ báo cáo đồ án.

   Gói và số nhân viên chọn được ngay tại đây (khởi tạo từ `?plan=&employees=`);
   thiếu tham số thì mặc định Gói 1 tháng và ô nhân viên để trống, trang
   không bao giờ tự chuyển sang màn báo lỗi.

   Số tiền thu = tổng 1 tháng của bảng giá (`quote().total`), đúng con số
   đang hiện trên thẻ giá. Không tự thêm chiết khấu hay nhân theo kỳ hạn.
   ───────────────────────────────────────────────────────────── */

type Step = "review" | "confirm" | "processing" | "success";

type Receipt = {
  code: string;
  phone: string;
  at: string;
  total: number;
  planName: string;
  employees: number;
};

function parsePlan(value: string | null): PlanId | null {
  return PLANS.some((p) => p.id === value) ? (value as PlanId) : null;
}

function parseEmployees(value: string | null): number | null {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 99999 ? n : null;
}

/* Mã đơn MoMo có dạng chữ + số; sinh một lần khi xác nhận nên không lệch SSR. */
function makeOrderCode() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const salt = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `MM${stamp}${salt}`;
}

function formatDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/* QR mô phỏng: lưới 25×25 suy ra từ một chuỗi hạt giống nên vẽ lại luôn giống nhau.
   Không phải QR thật — chỉ để giao diện giống ứng dụng MoMo khi chụp ảnh báo cáo. */
function FakeQr({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const rand = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };

    const size = 25;
    const grid: boolean[][] = [];
    for (let y = 0; y < size; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < size; x++) row.push(rand() > 0.52);
      grid.push(row);
    }

    // Ba ô định vị ở góc, giống bố cục QR thật.
    const finder = (ox: number, oy: number) => {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const edge = x === 0 || y === 0 || x === 6 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          grid[oy + y][ox + x] = edge || core;
        }
      }
      // Vùng trắng bao quanh ô định vị
      for (let y = -1; y < 8; y++) {
        for (let x = -1; x < 8; x++) {
          const gy = oy + y;
          const gx = ox + x;
          if (gy < 0 || gx < 0 || gy >= size || gx >= size) continue;
          if (x === -1 || y === -1 || x === 7 || y === 7) grid[gy][gx] = false;
        }
      }
    };
    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);

    return grid;
  }, [seed]);

  return (
    <svg viewBox="0 0 25 25" className="size-44 rounded-xl bg-white p-2" role="img" aria-label="Mã QR MoMo mô phỏng">
      <rect width="25" height="25" fill="#fff" />
      {cells.map((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0f172a" /> : null,
        ),
      )}
    </svg>
  );
}

export default function PaymentFlow() {
  const params = useSearchParams();

  /* Chọn gói và số nhân viên ngay trong đơn hàng, khởi tạo từ ?plan=&employees=.
     Thiếu tham số thì mặc định gói 1 tháng — trang luôn cho chọn tại chỗ,
     không đẩy khách sang màn "chưa chọn được gói". */
  const [plan, setPlan] = useState<PlanId>(() => parsePlan(params.get("plan")) ?? "basic");
  const [employeeRaw, setEmployeeRaw] = useState(() => {
    const n = parseEmployees(params.get("employees"));
    return n === null ? "" : String(n);
  });

  const [step, setStep] = useState<Step>("review");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState(false);
  const successRef = useRef<HTMLHeadingElement>(null);

  const employees = Number.parseInt(employeeRaw, 10);
  const employeesValid = Number.isFinite(employees) && employees >= 1;
  const planInfo = PLANS.find((p) => p.id === plan) ?? PLANS[0];
  const enterprise = employeesValid && employees > MAX_STANDARD;
  const order = employeesValid ? quote(employees, plan) : null;

  /* Bước xử lý: chờ một nhịp ngắn cho giống ứng dụng thật rồi mới báo thành công. */
  useEffect(() => {
    if (step !== "processing") return;
    const id = window.setTimeout(() => {
      setReceipt({
        code: makeOrderCode(),
        phone,
        at: formatDateTime(new Date()),
        total: order?.total ?? 0,
        planName: planInfo?.name ?? "",
        employees,
      });
      setStep("success");
    }, 1500);
    return () => window.clearTimeout(id);
  }, [step, phone, order?.total, planInfo?.name, employees]);

  useEffect(() => {
    if (step === "success") successRef.current?.focus();
  }, [step]);

  const canConfirm = /^0\d{9}$/.test(phone.replace(/\s/g, ""));

  function openConfirm() {
    if (enterprise) {
      setError(`Trên ${MAX_STANDARD} nhân viên cần báo giá riêng, chưa thanh toán trực tuyến được.`);
      return;
    }
    if (!canConfirm) {
      setError("Nhập số điện thoại MoMo gồm 10 chữ số, bắt đầu bằng 0.");
      return;
    }
    setError("");
    setOtp("");
    setStep("confirm");
  }

  function pay() {
    if (!/^\d{6}$/.test(otp)) {
      setError("Nhập đủ 6 chữ số xác thực.");
      return;
    }
    setError("");
    setStep("processing");
  }

  async function copyCode() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-28 sm:pt-32">
      {/* ── Thành công ── */}
      {step === "success" && receipt && (
        <div className="mx-auto max-w-2xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-9">
            <span className="grid size-16 place-items-center rounded-full bg-success/15 text-emerald-700">
              <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 ref={successRef} tabIndex={-1} className="mt-5 font-heading text-3xl font-extrabold tracking-tight text-ink outline-none">
              Thanh toán thành công
            </h1>
            <p className="mt-2 leading-relaxed text-body">
              Đơn hàng <strong className="text-ink">{receipt.planName}</strong> cho {receipt.employees} nhân viên đã được ghi nhận.
            </p>

            <dl className="mt-7 divide-y divide-slate-100 border-y border-slate-100 text-sm">
              {[
                ["Mã giao dịch", receipt.code],
                ["Số tiền", `${formatVnd(receipt.total)} ₫`],
                ["Gói", `${receipt.planName} · ${receipt.employees} nhân viên`],
                ["Số điện thoại", receipt.phone],
                ["Thời gian", receipt.at],
                ["Phương thức", "Ví MoMo"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-6 py-3">
                  <dt className="text-body">{label}</dt>
                  <dd className="text-right font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Đây là giao dịch mô phỏng để minh hoạ đồ án. Không có khoản tiền nào bị trừ và
              không có tài khoản nào được cấp.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {copied ? "Đã sao chép mã" : "Sao chép mã giao dịch"}
              </button>
              <Link
                href="/#pricing"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-6 py-3 font-semibold text-ink transition-colors hover:border-blue-600 hover:bg-brand-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Thanh toán gói khác
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-body">
            Cần hỗ trợ? Gọi <a className="font-semibold text-blue-600 hover:underline" href="tel:0352580996">0352 580 996</a>{" "}
            hoặc gửi email{" "}
            <a className="font-semibold text-blue-600 hover:underline" href="mailto:phamhoang5552000@gmail.com">
              phamhoang5552000@gmail.com
            </a>
            .
          </p>
        </div>
      )}

      {/* ── Chọn phương thức & xác nhận ── */}
      {step !== "success" && (
        <>
          <div className="text-center">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Thanh toán đơn hàng
            </h1>
            <p className="mx-auto mt-3 max-w-xl leading-relaxed text-body">
              Quét QR hoặc xác nhận bằng số điện thoại MoMo. Giao dịch chỉ mô phỏng, không trừ tiền thật.
            </p>
          </div>

          <div className="mt-9 grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-start">
            {/* Đơn hàng */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-7">
              <h2 className="font-heading text-lg font-bold text-ink">Đơn hàng của bạn</h2>

              {/* Chọn gói */}
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-ink">Gói</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {PLANS.map((p) => (
                    <label key={p.id} className="cursor-pointer">
                      <input
                        type="radio"
                        name="plan"
                        value={p.id}
                        checked={plan === p.id}
                        onChange={() => setPlan(p.id)}
                        className="peer sr-only"
                      />
                      <span className="flex h-full items-center justify-center rounded-xl border border-slate-300 px-2 py-2.5 text-center text-sm font-semibold text-body transition-colors hover:border-blue-600 peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600">
                        {p.short}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Chọn số nhân viên */}
              <div className="mt-4">
                <label htmlFor="order-employees" className="block text-sm font-semibold text-ink">
                  Số nhân viên
                </label>
                <input
                  id="order-employees"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="30"
                  value={employeeRaw}
                  onChange={(e) => setEmployeeRaw(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  aria-describedby="order-employees-hint"
                  className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base tabular-nums text-ink outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15"
                />
                <p id="order-employees-hint" className="mt-1.5 text-xs text-body">
                  {!employeesValid
                    ? "Nhập số nhân viên để xem giá."
                    : enterprise
                      ? `Trên ${MAX_STANDARD} nhân viên cần báo giá riêng.`
                      : order
                        ? `Quy mô ${order.tier.name.toLowerCase()} · ${formatVnd(order.perPerson)} ₫/người/tháng`
                        : "Nhập số nhân viên để xem giá."}
                </p>
              </div>

              <div className="mt-5 flex items-baseline justify-between gap-4 rounded-2xl bg-brand-mist/70 px-4 py-3">
                <span className="text-sm font-semibold text-body">Số tiền thanh toán</span>
                <span className="font-heading text-2xl font-extrabold tabular-nums text-blue-700">
                  {order ? `${formatVnd(order.total)} ₫` : "—"}
                </span>
              </div>

              {order?.minApplied && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  Đã áp dụng phí tối thiểu {formatVnd(MIN_FEE)} ₫/tháng
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-body">
                Phí của 1 tháng sử dụng. Bản mô phỏng thu đúng 1 tháng cho mọi gói để khớp bảng giá.
              </p>

              {enterprise && (
                <Link
                  href="/contact?intent=quote&plan=enterprise"
                  className="mt-4 inline-flex rounded text-sm font-semibold text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Nhận báo giá riêng cho doanh nghiệp
                </Link>
              )}
            </div>

            {/* Ví MoMo */}
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
              <div className="flex items-center gap-3 bg-[#A50064] px-6 py-4">
                <span className="grid size-9 place-items-center rounded-xl bg-white font-heading text-sm font-extrabold text-[#A50064]">
                  M
                </span>
                <div className="leading-tight">
                  <p className="font-heading text-base font-bold text-white">Ví MoMo</p>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center justify-center gap-6">
                  <FakeQr seed={`${plan}-${employeeRaw}-${order?.total ?? 0}`} />
                  <div className="hidden text-sm leading-relaxed text-body sm:block">
                    <p className="font-semibold text-ink">Quét mã để thanh toán</p>
                    <p className="mt-1 max-w-[10rem]">
                      Mở ứng dụng MoMo → Quét mã → xác nhận. Mã QR ở đây chỉ để minh hoạ.
                    </p>
                  </div>
                </div>

                <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  hoặc
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <label htmlFor="momo-phone" className="block text-sm font-semibold text-ink">
                  Số điện thoại MoMo
                </label>
                <input
                  id="momo-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0901234567"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/[^\d\s]/g, "").slice(0, 12));
                    setError("");
                  }}
                  aria-invalid={!!error && !canConfirm}
                  aria-describedby={error ? "pay-error" : undefined}
                  className={`mt-2 block w-full rounded-xl border px-4 py-3 text-base text-ink outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                    error && !canConfirm
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500/15"
                      : "border-slate-300 focus:border-[#A50064] focus:ring-[#A50064]/15"
                  }`}
                />

                {error && (
                  <p id="pay-error" role="alert" className="mt-2 text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={openConfirm}
                  disabled={!order || enterprise}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#A50064] px-5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#8d0055] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A50064] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {enterprise
                    ? "Cần báo giá riêng"
                    : order
                      ? `Thanh toán ${formatVnd(order.total)} ₫`
                      : "Nhập số nhân viên để thanh toán"}
                </button>

                <p className="mt-3 text-center text-xs text-slate-500">
                  Đây là trang mô phỏng, không kết nối ví MoMo thật.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Hộp xác nhận ── */}
      {step === "confirm" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_32px_64px_-24px_rgba(15,23,42,0.45)]"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-[#A50064] font-heading text-sm font-extrabold text-white">
                M
              </span>
              <p className="text-sm font-semibold text-body">Xác nhận trong ứng dụng MoMo</p>
            </div>

            <p id="confirm-title" className="mt-4 font-heading text-3xl font-extrabold tabular-nums text-ink">
              {order ? `${formatVnd(order.total)} ₫` : "—"}
            </p>
            <p className="mt-1 text-sm text-body">
              {planInfo.name} · {employees} nhân viên
            </p>
            <p className="mt-0.5 text-sm text-body">
              Đến: <strong className="text-ink">CÔNG TY TNHH HUMORA</strong>
            </p>

            <label htmlFor="otp" className="mt-5 block text-sm font-semibold text-ink">
              Mã xác thực 6 chữ số
            </label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
              className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-heading text-2xl font-bold tracking-[0.4em] text-ink outline-none transition placeholder:tracking-[0.3em] placeholder:text-slate-300 focus:border-[#A50064] focus:ring-4 focus:ring-[#A50064]/15"
            />
            <p className="mt-2 text-xs text-slate-500">Mã thử nghiệm: <strong className="text-ink">123456</strong></p>

            {error && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-600">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep("review");
                  setError("");
                }}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-300 px-4 py-3 font-semibold text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={pay}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#A50064] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#8d0055] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A50064]"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Đang xử lý ── */}
      {step === "processing" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <div role="status" aria-live="polite" className="w-full max-w-xs rounded-3xl bg-white p-8 text-center shadow-xl">
            <span className="mx-auto block size-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#A50064]" />
            <p className="mt-5 font-heading text-lg font-bold text-ink">Đang xử lý giao dịch</p>
            <p className="mt-1 text-sm text-body">Kết nối MoMo…</p>
          </div>
        </div>
      )}
    </section>
  );
}
