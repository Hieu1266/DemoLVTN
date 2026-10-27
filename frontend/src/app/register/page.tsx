"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/src/components/AuthShell";
import { AuthButton, AuthField, LockIcon, MailIcon, Rise, UserIcon } from "@/src/components/AuthField";
import { login, register } from "@/src/actions/auth";
import { errMsg } from "@/src/lib/api";
import { homeByRole } from "@/src/lib/session";
import { errorBox } from "@/src/lib/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    last_name: "", first_name: "", username: "", email: "", password: "", confirm: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setLoading(true);
    try {
      const { confirm, ...data } = form;
      void confirm;
      await register(data);
      const user = await login(form.email, form.password);
      router.push(homeByRole(user.user?.role));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  const toggle = (
    <button type="button" onClick={() => setShowPw(!showPw)} className="text-xs font-medium opacity-60 hover:opacity-100">
      {showPw ? "Ẩn" : "Hiện"}
    </button>
  );

  return (
    <AuthShell
      title="Tạo tài khoản"
      subtitle="Dành cho sinh viên tham gia thi trực tuyến"
      tagline="Bắt đầu hành trình thi cử thông minh"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <div className={errorBox}>{error}</div>}

        <Rise i={1} className="grid grid-cols-2 gap-3">
          <AuthField label="Họ" placeholder="Nguyễn" value={form.last_name} onChange={set("last_name")} />
          <AuthField label="Tên" placeholder="Văn A" value={form.first_name} onChange={set("first_name")} />
        </Rise>

        <Rise i={2}>
          <AuthField label="Tên đăng nhập" icon={<UserIcon />} required minLength={3} placeholder="Ít nhất 3 ký tự" value={form.username} onChange={set("username")} />
        </Rise>

        <Rise i={3}>
          <AuthField label="Email" icon={<MailIcon />} type="email" required placeholder="email@example.com" value={form.email} onChange={set("email")} />
        </Rise>

        <Rise i={4}>
          <AuthField label="Mật khẩu" icon={<LockIcon />} type={showPw ? "text" : "password"} required minLength={6} placeholder="Ít nhất 6 ký tự" value={form.password} onChange={set("password")} suffix={toggle} />
        </Rise>

        <Rise i={5}>
          <AuthField label="Nhập lại mật khẩu" icon={<LockIcon />} type={showPw ? "text" : "password"} required placeholder="Nhập lại mật khẩu" value={form.confirm} onChange={set("confirm")} />
        </Rise>

        <Rise i={6}>
          <AuthButton loading={loading}>{loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}</AuthButton>
        </Rise>

        <Rise i={7}>
          <p className="text-center text-sm opacity-80">
            Đã có tài khoản?{" "}
            <Link href="/login" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
              Đăng nhập
            </Link>
          </p>
        </Rise>
      </form>
    </AuthShell>
  );
}
