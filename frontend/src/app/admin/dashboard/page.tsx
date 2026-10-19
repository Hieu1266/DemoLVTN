"use client";

import React, { useState } from "react";
import { 
  UserPlus, 
  Settings, 
  Key, 
  Mail, 
  User, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  Server,
  Database,
  Cpu
} from "lucide-react";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<"instructor" | "config">("instructor");

  // Form State Cấp Tài Khoản Giảng Viên
  const [instructorForm, setInstructorForm] = useState({
    fullName: "",
    email: "",
    username: "",
    password: "",
    department: "CNTT",
  });
  const [loadingInstructor, setLoadingInstructor] = useState(false);
  const [instructorSuccess, setInstructorSuccess] = useState("");

  // Form State Cấu Hình ConfigMap
  const [configMap, setConfigMap] = useState({
    MAX_CONCURRENT_EXAM: "40",
    MAX_CONCURRENT_AUTH: "15",
    WAITLIST_TIMEOUT_SEC: "15.0",
    JWT_EXPIRE_MINUTES: "120",
    REDIS_CACHE_TTL_SEC: "3600",
    ENABLE_PROCTORING_LOGS: "true",
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState("");

  // Hàm xử lý tạo tài khoản Giảng viên
  const handleCreateInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingInstructor(true);
    setInstructorSuccess("");

    try {
      // Gọi API Backend (VD: POST /api/v1/auth/register-instructor)
      const res = await fetch("/api/v1/users/instructor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...instructorForm,
          role_name: "instructor",
        }),
      });

      if (res.ok) {
        setInstructorSuccess("Cấp tài khoản giảng viên thành công!");
        setInstructorForm({ fullName: "", email: "", username: "", password: "", department: "CNTT" });
      } else {
        alert("Có lỗi xảy ra khi tạo tài khoản!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingInstructor(false);
    }
  };

  // Hàm xử lý lưu ConfigMap
  const handleSaveConfigMap = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingConfig(true);
    setConfigSuccess("");

    try {
      // Gọi API Backend cập nhật ConfigMap hoặc Hot-reload Gateway
      const res = await fetch("/api/v1/admin/configmap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configMap),
      });

      if (res.ok) {
        setConfigSuccess("Cập nhật ConfigMap hệ thống thành công!");
      } else {
        alert("Lỗi khi cập nhật cấu hình!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConfig(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Trang Quản Trị Hệ Thống (Admin)</h1>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              Quản lý phân quyền Giảng viên & Điều chỉnh tham số Admission Control / ConfigMap
            </p>
          </div>

          {/* TAB BUTTONS */}
          <div className="flex bg-slate-200/80 p-1 rounded-2xl w-fit">
            <button
              onClick={() => setActiveTab("instructor")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === "instructor"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Cấp Giảng Viên
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === "config"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Settings className="w-4 h-4" />
              Cấu Hình ConfigMap
            </button>
          </div>
        </div>

        {/* TAB 1: CẤP TÀI KHOẢN GIẢNG VIÊN */}
        {activeTab === "instructor" && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-2xs space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Cấp Tài Khoản Giảng Viên Mới</h2>
                <p className="text-xs text-slate-500">Tạo tài khoản với quyền Instructor để quản lý đề thi và ngân hàng câu hỏi.</p>
              </div>
            </div>

            {instructorSuccess && (
              <div className="flex items-center gap-2 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {instructorSuccess}
              </div>
            )}

            <form onSubmit={handleCreateInstructor} className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" /> Họ và tên giảng viên
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Văn A"
                  value={instructorForm.fullName}
                  onChange={(e) => setInstructorForm({ ...instructorForm, fullName: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> Email trường
                </label>
                <input
                  type="email"
                  required
                  placeholder="nguyenvana@lumer.edu.vn"
                  value={instructorForm.email}
                  onChange={(e) => setInstructorForm({ ...instructorForm, email: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" /> Tên đăng nhập (Username)
                </label>
                <input
                  type="text"
                  required
                  placeholder="nguyenvana"
                  value={instructorForm.username}
                  onChange={(e) => setInstructorForm({ ...instructorForm, username: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-400" /> Mật khẩu khởi tạo
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={instructorForm.password}
                  onChange={(e) => setInstructorForm({ ...instructorForm, password: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-700">Khoa / Bộ môn</label>
                <select
                  value={instructorForm.department}
                  onChange={(e) => setInstructorForm({ ...instructorForm, department: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
                >
                  <option value="CNTT">Công nghệ thông tin</option>
                  <option value="DTVT">Điện tử viễn thông</option>
                  <option value="KHMT">Khoa học máy tính</option>
                  <option value="KTPM">Kỹ thuật phần mềm</option>
                </select>
              </div>

              <div className="md:col-span-2 pt-2">
                <button
                  type="submit"
                  disabled={loadingInstructor}
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-indigo-500/25 active:scale-98 transition disabled:opacity-50"
                >
                  {loadingInstructor ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" /> Cấp Tài Khoản
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: CẤU HÌNH CONFIGMAP & ADMISSION CONTROL */}
        {activeTab === "config" && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-2xs space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-violet-50 rounded-2xl text-violet-600">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Quản Lý ConfigMap & Admission Control</h2>
                <p className="text-xs text-slate-500">Điều chỉnh giới hạn kết nối DB, thời gian Waitlist và tham số hệ thống mà không cần restart pod.</p>
              </div>
            </div>

            {configSuccess && (
              <div className="flex items-center gap-2 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {configSuccess}
              </div>
            )}

            <form onSubmit={handleSaveConfigMap} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* NHÓM ADMISSION CONTROL */}
                <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-4 md:col-span-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                    <Database className="w-4 h-4 text-indigo-600" />
                    <span>Giới Hạn Kết Nối Đồng Thời (Max Concurrent - Database Budget)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Max Connection Exam Service</label>
                      <input
                        type="number"
                        value={configMap.MAX_CONCURRENT_EXAM}
                        onChange={(e) => setConfigMap({ ...configMap, MAX_CONCURRENT_EXAM: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Max Connection Auth Service</label>
                      <input
                        type="number"
                        value={configMap.MAX_CONCURRENT_AUTH}
                        onChange={(e) => setConfigMap({ ...configMap, MAX_CONCURRENT_AUTH: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Waitlist Timeout (Giây)</label>
                      <input
                        type="text"
                        value={configMap.WAITLIST_TIMEOUT_SEC}
                        onChange={(e) => setConfigMap({ ...configMap, WAITLIST_TIMEOUT_SEC: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* NHÓM SYSTEM PARAMS */}
                <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-4 md:col-span-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-900">
                    <Cpu className="w-4 h-4 text-violet-600" />
                    <span>Tham Số Hệ Thống & Cache</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Thời gian hết hạn JWT (Phút)</label>
                      <input
                        type="number"
                        value={configMap.JWT_EXPIRE_MINUTES}
                        onChange={(e) => setConfigMap({ ...configMap, JWT_EXPIRE_MINUTES: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Redis Cache TTL (Giây)</label>
                      <input
                        type="number"
                        value={configMap.REDIS_CACHE_TTL_SEC}
                        onChange={(e) => setConfigMap({ ...configMap, REDIS_CACHE_TTL_SEC: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Ghi Log Proctoring (Kafka)</label>
                      <select
                        value={configMap.ENABLE_PROCTORING_LOGS}
                        onChange={(e) => setConfigMap({ ...configMap, ENABLE_PROCTORING_LOGS: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                      >
                        <option value="true">Bật (Enabled)</option>
                        <option value="false">Tắt (Disabled)</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>

              <button
                type="submit"
                disabled={loadingConfig}
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-slate-900 text-white text-xs font-bold rounded-2xl shadow-md hover:bg-slate-800 active:scale-98 transition disabled:opacity-50"
              >
                {loadingConfig ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Cập Nhật ConfigMap
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}