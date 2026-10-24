"use client";

import React, { useState } from "react";
import { 
  UserPlus, 
  Key, 
  Mail, 
  User as UserIcon, 
  RefreshCw, 
  CheckCircle2, 
  ShieldCheck,
  FileText,
  Eye,
  EyeOff,
  Dices,
  Sparkles,
  Copy,
  Check
} from "lucide-react";
import { createInstructor } from "@/src/actions/instructor";

export default function CreateInstructorPage() {
  const [instructorForm, setInstructorForm] = useState({
    username: "",
    email: "",
    password: "",
    role_id: 3,
    firstname: "",
    lastname: "",
    bio: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingInstructor, setLoadingInstructor] = useState(false);
  const [instructorSuccess, setInstructorSuccess] = useState("");

  // Hàm sinh mật khẩu ngẫu nhiên an toàn
  const generateRandomPassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let randomPassword = "";
    for (let i = 0; i < 12; i++) {
      randomPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setInstructorForm((prev) => ({ ...prev, password: randomPassword }));
    setShowPassword(true);
  };

  // Hàm tự động gợi ý Username & Email từ Họ và Tên
  const handleNameChange = (field: "firstname" | "lastname", value: string) => {
    const updatedForm = { ...instructorForm, [field]: value };
    setInstructorForm(updatedForm);

    if (updatedForm.firstname || updatedForm.lastname) {
      const sanitize = (str: string) =>
        str
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d")
          .replace(/Đ/g, "D")
          .toLowerCase()
          .replace(/\s+/g, "");

      const fn = sanitize(updatedForm.firstname);
      const ln = sanitize(updatedForm.lastname);
      const suggestedUsername = `${fn}${ln ? "." + ln : ""}`;
      
      setInstructorForm((prev) => ({
        ...prev,
        username: suggestedUsername,
        email: `${suggestedUsername}@lumer.edu.vn`
      }));
    }
  };

  // Sao chép mật khẩu nhanh
  const copyPassword = () => {
    if (!instructorForm.password) return;
    navigator.clipboard.writeText(instructorForm.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingInstructor(true);
    setInstructorSuccess("");

    try {
      const payload = {
        username: instructorForm.username,
        email: instructorForm.email,
        password: instructorForm.password,
        role_id: Number(instructorForm.role_id),
        status_id: "ACTIVE",
        profile: {
          firstname: instructorForm.firstname,
          lastname: instructorForm.lastname,
          bio: instructorForm.bio || "Giảng viên khoa CNTT",
        },
      };

      // Gọi qua action đã chuẩn hóa với api wrapper
      await createInstructor(payload);

      setInstructorSuccess("Cấp tài khoản giảng viên thành công!");
      setInstructorForm({
        username: "",
        email: "",
        password: "",
        role_id: 3,
        firstname: "",
        lastname: "",
        bio: "",
      });
      setShowPassword(false);
    } catch (err: any) {
      console.error("Lỗi cấp tài khoản:", err);
      alert(err.message || "Lỗi khởi tạo tài khoản! Vui lòng kiểm tra lại thông tin.");
    } finally {
      setLoadingInstructor(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-8">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded-full">
                Admin Console
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-2">Cấp Tài Khoản Giảng Viên</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Khởi tạo người dùng mới trong hệ thống với đầy đủ thông tin User & Profile
            </p>
          </div>
        </div>

        {/* FORM CHÍNH */}
        <div className="bg-white rounded-3xl border border-slate-200/70 p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-2xl text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Thông Tin Giảng Viên Mới</h2>
              <p className="text-xs text-slate-500">Tự động đề xuất Username, Email & Sinh mật khẩu bảo mật cao</p>
            </div>
          </div>

          {instructorSuccess && (
            <div className="flex items-center gap-2 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              {instructorSuccess}
            </div>
          )}

          <form onSubmit={handleCreateInstructor} className="grid grid-cols-1 md:grid-cols-2 gap-5" autoComplete="off">
            
            {/* Họ & Tên đệm */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-slate-400" /> Họ & Tên đệm (Lastname)
              </label>
              <input
                type="text"
                required
                placeholder="VD: Nguyễn Văn"
                value={instructorForm.lastname}
                onChange={(e) => handleNameChange("lastname", e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>

            {/* Tên */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-slate-400" /> Tên (Firstname)
              </label>
              <input
                type="text"
                required
                placeholder="VD: An"
                value={instructorForm.firstname}
                onChange={(e) => handleNameChange("firstname", e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>

            {/* Tên đăng nhập */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-slate-400" /> Tên đăng nhập (Username)
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                placeholder="an.nguyenvan"
                value={instructorForm.username}
                onChange={(e) => setInstructorForm({ ...instructorForm, username: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs font-mono font-bold text-indigo-600 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Email trường
              </label>
              <input
                type="email"
                required
                placeholder="an.nguyenvan@lumer.edu.vn"
                value={instructorForm.email}
                onChange={(e) => setInstructorForm({ ...instructorForm, email: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>

            {/* Mật khẩu khởi tạo */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-400" /> Mật khẩu khởi tạo
                </label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition"
                >
                  <Dices className="w-3.5 h-3.5" /> Tạo mật khẩu ngẫu nhiên
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={instructorForm.password}
                  onChange={(e) => setInstructorForm({ ...instructorForm, password: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 pl-4 pr-24 py-3 text-xs font-mono font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
                />

                <div className="absolute right-3 top-2.5 flex items-center gap-1">
                  {instructorForm.password && (
                    <button
                      type="button"
                      onClick={copyPassword}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition"
                      title="Sao chép mật khẩu"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                    title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Quyền Hạn */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Vai trò (Role ID)
              </label>
              <select
                value={instructorForm.role_id}
                onChange={(e) => setInstructorForm({ ...instructorForm, role_id: Number(e.target.value) })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
              >
                <option value={3}>Giảng Viên (Instructor - Role ID: 2)</option>
                <option value={1}>Quản Trị Viên (Admin - Role ID: 1)</option>
              </select>
            </div>

            {/* Bio / Giới thiệu */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Mô tả ngắn / Bộ môn (Bio)
              </label>
              <input
                type="text"
                placeholder="VD: Giảng viên Bộ môn Kỹ thuật Phần mềm"
                value={instructorForm.bio}
                onChange={(e) => setInstructorForm({ ...instructorForm, bio: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>

            {/* Submit Button */}
            <div className="md:col-span-2 pt-3">
              <button
                type="submit"
                disabled={loadingInstructor}
                className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 text-white text-xs font-bold rounded-2xl shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 active:scale-[0.99] transition disabled:opacity-50"
              >
                {loadingInstructor ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" /> Cấp Tài Khoản Giảng Viên
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}