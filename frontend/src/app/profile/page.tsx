"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, AUTH_URL, errMsg } from "@/src/lib/api";
import { homeByRole } from "@/src/lib/session";
import { input } from "@/src/lib/ui";

interface UserProfileData {
  user_id: string;
  username: string;
  email: string;
  role_id: number;
  role: string;
  status_id: string;
  birthdate?: string | null;
  created_at: string;
  profile?: {
    profile_id: string;
    user_id: string;
    firstname?: string | null;
    lastname?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
  } | null;
}

const roleBadgeMap: Record<string, string> = {
  STUDENT: "Sinh viên",
  INSTRUCTOR: "Giảng viên",
  ADMIN: "Quản trị viên",
};

export default function ProfilePage() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [lastname, setLastname] = useState("");
  const [firstname, setFirstname] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await api<UserProfileData>(AUTH_URL, "/users/me", {
          method: "GET",
        });
        setUserData(data);
        setLastname(data.profile?.lastname || "");
        setFirstname(data.profile?.firstname || "");
        setBirthdate(data.birthdate || "");
        setAvatarUrl(data.profile?.avatar_url || "");
        setBio(data.profile?.bio || "");
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const updated = await api<UserProfileData>(AUTH_URL, "/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          lastname: lastname.trim() || null,
          firstname: firstname.trim() || null,
          birthdate: birthdate || null,
          avatar_url: avatarUrl.trim() || null,
          bio: bio.trim() || null,
        }),
      });

      setUserData(updated);

      // Đồng bộ lại cookie user_info để Navbar cập nhật ngay lập tức
      document.cookie = `user_info=${encodeURIComponent(
        JSON.stringify(updated)
      )}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

      setSuccess("Cập nhật thông tin hồ sơ thành công!");
      router.refresh();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <div className="inline-flex items-center gap-2.5 rounded-full border border-indigo-200/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          <span>Đang tải thông tin hồ sơ...</span>
        </div>
      </div>
    );
  }

  const displayName =
    `${lastname} ${firstname}`.trim() || userData?.username || "Người dùng";
  const initial = (firstname || userData?.username || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4 sm:py-6">
      {/* --- HEADER --- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/90 px-3.5 py-1 text-xs font-bold text-indigo-700">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            <span>HỒ SƠ CÁ NHÂN</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Thông tin tài khoản
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Quản lý thông tin hiển thị và hồ sơ cá nhân của bạn trên hệ thống SSL.
          </p>
        </div>

        {userData?.role && (
          <button
            type="button"
            onClick={() => router.push(homeByRole(userData.role))}
            className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
          >
            ← Quay lại trang chính
          </button>
        )}
      </div>

      {/* --- MAIN CARD --- */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-500/10 sm:p-8">
        {/* Glow trang trí giống Dashboard */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-indigo-50/80 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-fuchsia-50/80 blur-3xl" />

        <div className="relative space-y-6">
          {/* Banner thông tin tóm tắt */}
          <div className="flex flex-col items-center gap-4 border-b border-slate-100 pb-6 sm:flex-row">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-20 w-20 rounded-2xl object-cover shadow-md ring-4 ring-indigo-50"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-2xl font-black text-white shadow-lg shadow-indigo-500/25">
                {initial}
              </div>
            )}

            <div className="text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-xl font-extrabold text-slate-900">
                  {displayName}
                </h2>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-100">
                  {roleBadgeMap[userData?.role || ""] || userData?.role}
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                @{userData?.username} · {userData?.email}
              </p>
              {userData?.created_at && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Tham gia từ:{" "}
                  {new Date(userData.created_at).toLocaleDateString("vi-VN")}
                </p>
              )}
            </div>
          </div>

          {/* Thông báo trạng thái */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
              {success}
            </div>
          )}

          {/* Form cập nhật */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Thông tin cố định (Read-only) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Tên đăng nhập (Username)
                </label>
                <input
                  type="text"
                  disabled
                  value={userData?.username || ""}
                  className={`${input} w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100/80 px-3.5 py-2.5 text-sm font-medium text-slate-500`}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Địa chỉ Email
                </label>
                <input
                  type="email"
                  disabled
                  value={userData?.email || ""}
                  className={`${input} w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100/80 px-3.5 py-2.5 text-sm font-medium text-slate-500`}
                />
              </div>
            </div>

            {/* Họ & Tên */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Họ và tên đệm
                </label>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="Ví dụ: Nguyễn Văn"
                  value={lastname}
                  onChange={(e) => setLastname(e.target.value)}
                  className={`${input} w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10`}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Tên
                </label>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="Ví dụ: An"
                  value={firstname}
                  onChange={(e) => setFirstname(e.target.value)}
                  className={`${input} w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10`}
                />
              </div>
            </div>

            {/* Ngày sinh & Link Avatar */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Ngày sinh
                </label>
                <input
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className={`${input} w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10`}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Đường dẫn ảnh đại diện (Avatar URL)
                </label>
                <input
                  type="url"
                  maxLength={500}
                  placeholder="https://example.com/avatar.png"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className={`${input} w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10`}
                />
              </div>
            </div>

            {/* Giới thiệu bản thân */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">
                Giới thiệu ngắn (Bio)
              </label>
              <textarea
                rows={3}
                placeholder="Nhập vài dòng giới thiệu về bản thân, lớp hoặc chuyên ngành..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>

            {/* Nút hành động */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Đang lưu thay đổi..." : "Lưu thay đổi hồ sơ"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}