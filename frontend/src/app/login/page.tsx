"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/src/components/AuthShell";
import { AuthButton, AuthField, LockIcon, MailIcon, Rise } from "@/src/components/AuthField";
import { login } from "@/src/actions/auth";
import { errMsg } from "@/src/lib/api";
import { homeByRole, saveSession } from "@/src/lib/session";
import { errorBox } from "@/src/lib/ui";

export default function LoginPage() {
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
      const res = await login(email, password);

      // 1. Lưu token và thông tin user MỚI vào localStorage (đồng thời làm sạch dữ liệu cũ)
      if (res?.access_token && res?.user) {
        saveSession(res.access_token, res.user);
      }

      // 2. Chuyển hướng cứng (window.location.href) để Next.js xóa toàn bộ Router Cache cũ
      const targetUrl = homeByRole(res.user?.role);
      window.location.href = targetUrl;
    } catch (err) {
      setError(errMsg(err));
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để tiếp tục vào hệ thống thi"
      tagline="Vào phòng thi chỉ trong vài giây"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <div className={errorBox}>{error}</div>}

        <Rise i={1}>
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

        <Rise i={2}>
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

        <Rise i={3}>
          <AuthButton loading={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </AuthButton>
        </Rise>

        <Rise i={4}>
          <p className="text-center text-sm opacity-80">
            Chưa có tài khoản?{" "}
            <Link href="/register" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
              Đăng ký ngay
            </Link>
          </p>
        </Rise>
      </form>
    </AuthShell>
  );
}