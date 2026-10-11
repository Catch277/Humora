import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 text-white mix-blend-difference">
      <Link href="/" className="font-bold text-lg">
        HR & Chấm công
      </Link>
      <div className="flex gap-4 text-sm md:text-base">
        <Link href="/" className="hover:underline">Trang chủ</Link>
        <Link href="/features" className="hover:underline">Tính năng</Link>
        <Link href="/team" className="hover:underline">Nhóm</Link>
        <Link href="/contact" className="hover:underline">Liên hệ</Link>
      </div>
    </nav>
  );
}