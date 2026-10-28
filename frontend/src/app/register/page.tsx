"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/src/components/AuthShell";
import { AuthButton, AuthField, LockIcon, MailIcon, UserIcon, Rise } from "@/src/components/AuthField";
import { register, login } from "@/src/actions/auth";
import { homeByRole, saveSession } from "@/src/lib/session";
import { errorBox } from "@/src/lib/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Gọi API Đăng ký
      const regRes = await register({ username, email, password });
      if (!regRes.success) {
        setError(regRes.error || "Đăng ký không thành công!");
        setLoading(false);
        return;
      }

      // 2. Tự động đăng nhập sau khi đăng ký thành công
      const loginRes = await login(email, password);
      if (!loginRes.success || !loginRes.data) {
        setError(loginRes.error || "Đăng ký thành công nhưng không thể tự động đăng nhập!");
        setLoading(false);
        return;
      }

      // 🔴 SỬA LỖI TS2339: Lấy data từ loginRes.data
      const data = loginRes.data;
      if (data.access_token && data.user) {
        saveSession(data.access_token, data.user);
      }

      const targetUrl = homeByRole(data.user?.role);
      window.location.href = targetUrl;
    } catch (err: any) {
      setError("Có lỗi xảy ra khi tạo tài khoản. Vui lòng thử lại!");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Tạo tài khoản mới"
      subtitle="Đăng ký tài khoản để tham gia hệ thống thi trực tuyến"
      tagline="Đăng ký nhanh chóng chỉ trong 1 phút"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <div className={errorBox}>{error}</div>}

        <Rise i={1}>
          <AuthField 
            label="Tên người dùng" 
            icon={<UserIcon />} 
            type="text" 
            required 
            placeholder="nhaptennguoidung" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
        </Rise>

        <Rise i={2}>
          <AuthField 
            label="Email" 
            icon={<MailIcon />} 
            type="email" 
            required 
            placeholder="email@example.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
          />
        </Rise>

        <Rise i={3}>
          <AuthField
            label="Mật khẩu"
            icon={<LockIcon />}
            type={showPw ? "text" : "password"}
            required
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            suffix={
              <button 
                type="button" 
                onClick={() => setShowPw(!showPw)} 
                className="text-xs font-medium opacity-60 hover:opacity-100"
              >
                {showPw ? "Ẩn" : "Hiện"}
              </button>
            }
          />
        </Rise>

        <Rise i={4}>
          <AuthButton loading={loading}>
            {loading ? "Đang tạo tài khoản..." : "Đăng ký"}
          </AuthButton>
        </Rise>

        <Rise i={5}>
          <p className="text-center text-sm opacity-80">
            Đã có tài khoản?{" "}
            <Link href="/login" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
              Đăng nhập ngay
            </Link>
          </p>
        </Rise>
      </form>
    </AuthShell>
  );
}