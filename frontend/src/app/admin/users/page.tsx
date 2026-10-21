"use client";

import React, { useEffect, useState } from "react";
import { 
  Users, 
  Search, 
  Filter, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  UserCheck, 
  UserX,
  Mail,
  Calendar,
  Shield,
  CheckSquare,
  Square
} from "lucide-react";
import { getUsers, updateUserStatus, UserReadResponse } from "@/src/actions/instructor";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserReadResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  
  // State quản lý danh sách ID người dùng được chọn
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // State Bộ lọc
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Tải danh sách người dùng khi mount component
  const fetchUserList = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
      setSelectedUserIds([]); // Reset lại checkbox chọn khi reload
    } catch (err: any) {
      console.error("Lỗi lấy danh sách user:", err);
      alert(err.message || "Không thể tải danh sách người dùng!");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserList();
  }, []);

  // Lọc dữ liệu theo Từ khóa, Role và Status
  const filteredUsers = users.filter((u) => {
    const matchesSearch = 
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.profile?.firstname && u.profile.firstname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.profile?.lastname && u.profile.lastname.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = 
      roleFilter === "ALL" || 
      (roleFilter === "ADMIN" && u.role_id === 1) ||
      (roleFilter === "INSTRUCTOR" && u.role_id === 2) ||
      (roleFilter === "STUDENT" && u.role_id === 3);

    const matchesStatus = statusFilter === "ALL" || u.status_id === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Danh sách user có thể chọn (Loại trừ Admin - role_id === 1 để tránh khóa nhầm Admin)
  const selectableUsers = filteredUsers.filter((u) => u.role_id !== 1);
  const isAllSelected = 
    selectableUsers.length > 0 && 
    selectableUsers.every((u) => selectedUserIds.includes(u.user_id));

  // Toggle chọn tất cả checkbox
  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(selectableUsers.map((u) => u.user_id));
    }
  };

  // Toggle chọn từng row
  const handleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Đổi trạng thái 1 user lẻ
  const handleToggleStatus = async (user: UserReadResponse) => {
    const newStatus = user.status_id === "ACTIVE" ? "BANNED" : "ACTIVE";
    const confirmMsg = user.status_id === "ACTIVE" 
      ? `Bạn có chắc muốn KHÓA tài khoản ${user.username}?`
      : `Bạn có chắc muốn MỞ KHÓA tài khoản ${user.username}?`;

    if (!confirm(confirmMsg)) return;

    setUpdatingId(user.user_id);
    try {
      await updateUserStatus(user.user_id, newStatus);
      setUsers((prev) =>
        prev.map((u) => (u.user_id === user.user_id ? { ...u, status_id: newStatus } : u))
      );
    } catch (err: any) {
      alert(err.message || "Lỗi cập nhật trạng thái người dùng!");
    } finally {
      setUpdatingId(null);
    }
  };

  // Xử lý KHÓA / MỞ KHÓA HÀNG LOẠT
  const handleBulkUpdateStatus = async (targetStatus: "ACTIVE" | "BANNED") => {
    if (selectedUserIds.length === 0) return;

    const actionName = targetStatus === "BANNED" ? "KHÓA" : "MỞ KHÓA";
    if (!confirm(`Xác nhận ${actionName} ${selectedUserIds.length} tài khoản đã chọn?`)) return;

    setBulkLoading(true);
    try {
      // Thực thi đồng thời toàn bộ các request cập nhật
      await Promise.all(selectedUserIds.map((id) => updateUserStatus(id, targetStatus)));

      // Cập nhật lại UI state
      setUsers((prev) =>
        prev.map((u) => (selectedUserIds.includes(u.user_id) ? { ...u, status_id: targetStatus } : u))
      );

      setSelectedUserIds([]); // Xóa danh sách đã chọn sau khi hoàn tất
      alert(`Đã ${actionName} thành công ${selectedUserIds.length} tài khoản!`);
    } catch (err: any) {
      console.error(err);
      alert("Đã xảy ra lỗi khi thực hiện thao tác hàng loạt!");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded-full">
                Admin Console
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-2">Quản Lý Người Dùng</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Danh sách toàn bộ Quản trị viên, Giảng viên và Sinh viên trong hệ thống
            </p>
          </div>

          <button
            onClick={fetchUserList}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới danh sách
          </button>
        </div>

        {/* BỘ LỌC VÀ THAO TÁC HÀNG LOẠT (BULK BAR) */}
        <div className="bg-white rounded-3xl border border-slate-200/70 p-4 md:p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Ô tìm kiếm */}
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
              <input
                type="text"
                placeholder="Tìm theo username, email, họ tên..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>

            {/* Lọc Role */}
            <div className="relative">
              <Filter className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition appearance-none"
              >
                <option value="ALL">Tất cả Vai trò</option>
                <option value="ADMIN">Quản Trị Viên (Admin)</option>
                <option value="INSTRUCTOR">Giảng Viên (Instructor)</option>
                <option value="STUDENT">Sinh Viên (Student)</option>
              </select>
            </div>

            {/* Lọc Status */}
            <div className="relative">
              <ShieldAlert className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition appearance-none"
              >
                <option value="ALL">Tất cả Trạng thái</option>
                <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                <option value="BANNED">Đã khóa (BANNED)</option>
              </select>
            </div>

          </div>

          {/* thanh công cụ thao tác hàng loạt (Hiển thị khi chọn >= 1 mục) */}
          {selectedUserIds.length > 0 && (
            <div className="flex items-center justify-between p-3.5 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <CheckSquare className="w-4 h-4 text-indigo-600" />
                Đã chọn <span className="underline">{selectedUserIds.length}</span> tài khoản
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkUpdateStatus("BANNED")}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 active:scale-95 transition shadow-sm disabled:opacity-50"
                >
                  {bulkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                  Khóa tất cả đã chọn
                </button>

                <button
                  onClick={() => handleBulkUpdateStatus("ACTIVE")}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 active:scale-95 transition shadow-sm disabled:opacity-50"
                >
                  {bulkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                  Mở khóa tất cả đã chọn
                </button>
              </div>
            </div>
          )}
        </div>

        {/* BẢNG DANH SÁCH USER */}
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {/* Checkbox chọn tất cả */}
                  <th className="py-4 px-4 w-12 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      disabled={selectableUsers.length === 0}
                      className="text-slate-400 hover:text-indigo-600 transition disabled:opacity-30"
                      title="Chọn tất cả"
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>

                  <th className="py-4 px-4">Người dùng</th>
                  <th className="py-4 px-6">Email</th>
                  <th className="py-4 px-6">Vai trò</th>
                  <th className="py-4 px-6">Trạng thái</th>
                  <th className="py-4 px-6">Ngày khởi tạo</th>
                  <th className="py-4 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      Đang tải danh sách người dùng...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      Không tìm thấy người dùng nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = selectedUserIds.includes(u.user_id);
                    const isAdmin = u.role_id === 1;
                    const fullName = u.profile?.firstname || u.profile?.lastname 
                      ? `${u.profile.lastname || ""} ${u.profile.firstname || ""}`.trim()
                      : "Chưa cập nhật";

                    return (
                      <tr 
                        key={u.user_id} 
                        className={`hover:bg-slate-50/80 transition ${isSelected ? "bg-indigo-50/30" : ""}`}
                      >
                        {/* Checkbox chọn theo hàng */}
                        <td className="py-4 px-4 text-center">
                          <button
                            type="button"
                            disabled={isAdmin} // Khóa checkbox nếu là Admin
                            onClick={() => handleSelectUser(u.user_id)}
                            className="text-slate-400 hover:text-indigo-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* Cột User */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm shrink-0">
                              {u.username.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{u.username}</div>
                              <div className="text-[11px] text-slate-400">{fullName}</div>
                            </div>
                          </div>
                        </td>

                        {/* Cột Email */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {u.email}
                          </div>
                        </td>

                        {/* Cột Role */}
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                            u.role_id === 1
                              ? "bg-purple-100 text-purple-700"
                              : u.role_id === 2
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}>
                            <Shield className="w-3 h-3" />
                            {u.role || (u.role_id === 1 ? "ADMIN" : u.role_id === 2 ? "INSTRUCTOR" : "STUDENT")}
                          </span>
                        </td>

                        {/* Cột Trạng thái */}
                        <td className="py-4 px-6">
                          {u.status_id === "ACTIVE" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Hoạt động
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                              <XCircle className="w-3 h-3 text-rose-600" /> Đã khóa
                            </span>
                          )}
                        </td>

                        {/* Ngày tạo */}
                        <td className="py-4 px-6 text-slate-500 text-[11px]">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(u.created_at).toLocaleDateString("vi-VN")}
                          </div>
                        </td>

                        {/* Thao tác Đơn lẻ */}
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={updatingId === u.user_id || isAdmin}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
                              u.status_id === "ACTIVE"
                                ? "bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            }`}
                          >
                            {updatingId === u.user_id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : u.status_id === "ACTIVE" ? (
                              <>
                                <UserX className="w-3.5 h-3.5" /> Khóa
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5" /> Mở khóa
                              </>
                            )}
                          </button>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}