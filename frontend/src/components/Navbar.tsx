"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/src/actions/auth";
import { homeByRole, useSession } from "@/src/lib/session";
import { btn, btnGhost } from "@/src/lib/ui";

// Menu dành cho ADMIN (Đã đưa các tab quản trị lên đây)
const adminLinks = [
  { href: "/admin/dashboard", label: "Cấp Giảng Viên", exact: true },
  { href: "/admin/users", label: "Quản Lý Người Dùng" },
  { href: "/admin/configmap", label: "Cấu Hình ConfigMap" },
];

// Menu dành cho GIẢNG VIÊN
const instructorLinks = [
  { href: "/dashboard_instructor", label: "Quản lý đề thi", exact: true },
  { href: "/dashboard_instructor/exams/new", label: "Tạo đề" },
  { href: "/dashboard_instructor/question-bank", label: "Ngân hàng câu hỏi" },
];

// Menu dành cho SINH VIÊN
const studentLinks = [
  { href: "/dashboard_student", label: "Vào thi", exact: true },
  { href: "/dashboard_student/results", label: "Kết quả" },
];

const roleLabel: Record<string, string> = { 
  STUDENT: "Sinh viên", 
  INSTRUCTOR: "Giảng viên", 
  ADMIN: "Quản trị" 
};

export default function Navbar() {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Tự động phân luồng menu theo user.role
  const links = !user 
    ? [] 
    : user.role === "ADMIN" 
    ? adminLinks 
    : user.role === "STUDENT" 
    ? studentLinks 
    : instructorLinks;

  const isLinkActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Giá trị fallback an toàn chống lỗi TypeScript Build
  const username = user?.username || "User";
  const userRole = user?.role || "";
  const initial = username.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/70 backdrop-blur-lg dark:border-white/10 dark:bg-neutral-950/70">
      <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6 sm:px-8">
        <div className="flex items-center gap-10">
          {/* LOGO */}
          <Link href={user ? homeByRole(user.role) : "/"} className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-xl font-bold text-white shadow-md shadow-indigo-600/30">
              L
            </span>
            <span className="text-xl font-bold tracking-tight">LUMER</span>
          </Link>

          {/* DYNAMIC NAV LINKS */}
          <div className="flex items-center gap-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-4 py-2 text-[15px] font-medium transition ${
                  isLinkActive(l.href, l.exact)
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-semibold"
                    : "opacity-70 hover:bg-gray-500/10 hover:opacity-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* USER INFO & ACTIONS */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white">
                  {initial}
                </span>
                <div className="hidden leading-tight sm:block">
                  <p className="text-sm font-medium">{username}</p>
                  <p className="text-xs opacity-60">
                    {userRole ? (roleLabel[userRole] || userRole) : ""}
                  </p>
                </div>
              </div>
              <button
                className={btnGhost}
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium opacity-80 hover:opacity-100">
                Đăng nhập
              </Link>
              <Link href="/register" className={btn}>
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}