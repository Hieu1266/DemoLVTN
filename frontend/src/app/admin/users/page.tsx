"use client";

import React, { useCallback, useEffect, useState } from "react";
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
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { getUsers, updateUserStatus, UserReadResponse } from "@/src/actions/instructor";

const PAGE_SIZE = 100;

interface AppliedFilters {
  search: string;
  role: string;
  status: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserReadResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // State phân trang (cố định 100 user / trang)
  const [page, setPage] = useState(1);
  const [jumpPageInput, setJumpPageInput] = useState("1");
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // State chọn checkbox trên trang hiện tại
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // State input trên giao diện (chưa gọi API khi đang gõ)
  const [searchInput, setSearchInput] = useState("");
  const [roleInput, setRoleInput] = useState<string>("ALL");
  const [statusInput, setStatusInput] = useState<string>("ALL");

  // State bộ lọc đã xác nhận (chỉ thay đổi khi bấm Tìm kiếm hoặc Đặt lại)
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({
    search: "",
    role: "ALL",
    status: "ALL",
  });

  // Chỉ tải 100 user của đúng trang đang đứng
  const fetchUserList = useCallback(
    async (targetPage: number, filters: AppliedFilters) => {
      setLoading(true);
      try {
        const res = await getUsers({
          page: targetPage,
          pageSize: PAGE_SIZE,
          search: filters.search,
          role: filters.role,
          status: filters.status,
        });
        
        // Nếu Backend chưa update trả về mảng, lấy res. Còn update rồi thì lấy res.items
        const fetchedUsers = res?.items || (Array.isArray(res) ? res : []);
        setUsers(fetchedUsers);
        
        setTotalUsers(res?.total || fetchedUsers.length);
        setTotalPages(res?.total_pages || 1);
        setJumpPageInput(String(targetPage));
        setSelectedUserIds([]);
      } catch (err: any) {
        console.error("Lỗi lấy danh sách user:", err);
        alert(err.message || "Không thể tải danh sách người dùng!");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Chỉ chạy khi page đổi hoặc người dùng bấm xác nhận bộ lọc
  useEffect(() => {
    fetchUserList(page, appliedFilters);
  }, [page, appliedFilters, fetchUserList]);

  // Xử lý bấm nút Tìm kiếm / Enter
  const handleApplySearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const nextFilters = {
      search: searchInput.trim(),
      role: roleInput,
      status: statusInput,
    };
    setPage(1);
    setAppliedFilters(nextFilters);
  };

  // Đặt lại bộ lọc về mặc định
  const handleResetFilters = () => {
    setSearchInput("");
    setRoleInput("ALL");
    setStatusInput("ALL");
    setPage(1);
    setAppliedFilters({ search: "", role: "ALL", status: "ALL" });
  };

  // Chuyển sang trang bất kỳ
  const goToPage = (target: number) => {
    const validPage = Math.max(1, Math.min(totalPages, target));
    if (validPage !== page) {
      setPage(validPage);
    }
  };

  const handleJumpPage = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(jumpPageInput, 10);
    if (!isNaN(num)) {
      goToPage(num);
    }
  };

  // Danh sách user có thể chọn (Loại trừ Admin - role_id === 1)
  const selectableUsers = (users || []).filter((u) => u.role_id !== 1);
  const isAllSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((u) => selectedUserIds.includes(u.user_id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(selectableUsers.map((u) => u.user_id));
    }
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Đổi trạng thái 1 user lẻ
  const handleToggleStatus = async (user: UserReadResponse) => {
    const newStatus = user.status_id === "ACTIVE" ? "BANNED" : "ACTIVE";
    const confirmMsg =
      user.status_id === "ACTIVE"
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

  // Khóa / Mở khóa hàng loạt
  const handleBulkUpdateStatus = async (targetStatus: "ACTIVE" | "BANNED") => {
    if (selectedUserIds.length === 0) return;

    const actionName = targetStatus === "BANNED" ? "KHÓA" : "MỞ KHÓA";
    if (!confirm(`Xác nhận ${actionName} ${selectedUserIds.length} tài khoản đã chọn?`)) return;

    setBulkLoading(true);
    try {
      await Promise.all(selectedUserIds.map((id) => updateUserStatus(id, targetStatus)));
      setUsers((prev) =>
        prev.map((u) =>
          selectedUserIds.includes(u.user_id) ? { ...u, status_id: targetStatus } : u
        )
      );
      setSelectedUserIds([]);
      alert(`Đã ${actionName} thành công ${selectedUserIds.length} tài khoản!`);
    } catch (err: any) {
      console.error(err);
      alert("Đã xảy ra lỗi khi thực hiện thao tác hàng loạt!");
    } finally {
      setBulkLoading(false);
    }
  };

  const getVisiblePages = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const fromRecord = totalUsers === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toRecord = Math.min(page * PAGE_SIZE, totalUsers);

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded-full">
                Admin Console
              </span>
              <span className="px-3 py-1 text-[11px] font-bold bg-slate-200/70 text-slate-700 rounded-full">
                Tổng: ~{totalUsers.toLocaleString("vi-VN")} tài khoản · 100 user / trang
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-2">Quản Lý Người Dùng</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Tải theo từng trang 100 tài khoản — chỉ nạp dữ liệu mới khi chuyển trang hoặc tìm kiếm
            </p>
          </div>

          <button
            onClick={() => fetchUserList(page, appliedFilters)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Tải lại trang {page}
          </button>
        </div>

        {/* BỘ LỌC (CHỈ TẢI KHI BẤM TÌM KIẾM) */}
        <form
          onSubmit={handleApplySearch}
          className="bg-white rounded-3xl border border-slate-200/70 p-4 md:p-6 shadow-sm space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Ô tìm kiếm */}
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
              <input
                type="text"
                placeholder="Nhập username, email, họ tên rồi bấm Tìm..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>

            {/* Lọc Role */}
            <div className="md:col-span-2 relative">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <select
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                className="w-full pl-9 pr-3 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition appearance-none"
              >
                <option value="ALL">Tất cả Vai trò</option>
                <option value="ADMIN">Admin</option>
                <option value="INSTRUCTOR">Giảng Viên</option>
                <option value="STUDENT">Sinh Viên</option>
              </select>
            </div>

            {/* Lọc Status */}
            <div className="md:col-span-2 relative">
              <ShieldAlert className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <select
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
                className="w-full pl-9 pr-3 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition appearance-none"
              >
                <option value="ALL">Tất cả Trạng thái</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="BANNED">Đã khóa</option>
              </select>
            </div>

            {/* Nút hành động lọc */}
            <div className="md:col-span-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-2xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                Tìm kiếm
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                disabled={loading}
                className="py-3 px-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Đặt lại
              </button>
            </div>
          </div>

          {/* Thanh công cụ thao tác hàng loạt */}
          {selectedUserIds.length > 0 && (
            <div className="flex items-center justify-between p-3.5 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <CheckSquare className="w-4 h-4 text-indigo-600" />
                Đã chọn <span className="underline">{selectedUserIds.length}</span> tài khoản trên trang {page}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkUpdateStatus("BANNED")}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition shadow-sm disabled:opacity-50"
                >
                  {bulkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                  Khóa đã chọn
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkUpdateStatus("ACTIVE")}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
                >
                  {bulkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                  Mở khóa đã chọn
                </button>
              </div>
            </div>
          )}
        </form>

        {/* BẢNG DANH SÁCH USER (100 DÒNG / TRANG) */}
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4 w-12 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      disabled={selectableUsers.length === 0}
                      className="text-slate-400 hover:text-indigo-600 transition disabled:opacity-30"
                      title="Chọn tất cả trên trang này"
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Người dùng</th>
                  <th className="py-3.5 px-6">Email</th>
                  <th className="py-3.5 px-6">Vai trò</th>
                  <th className="py-3.5 px-6">Trạng thái</th>
                  <th className="py-3.5 px-6">Ngày khởi tạo</th>
                  <th className="py-3.5 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      Đang tải 100 người dùng của trang {page}...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      Không tìm thấy người dùng nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isSelected = selectedUserIds.includes(u.user_id);
                    const isAdmin = u.role_id === 1;
                    const fullName =
                      u.profile?.firstname || u.profile?.lastname
                        ? `${u.profile.lastname || ""} ${u.profile.firstname || ""}`.trim()
                        : "Chưa cập nhật";

                    return (
                      <tr
                        key={u.user_id}
                        className={`hover:bg-slate-50/80 ${isSelected ? "bg-indigo-50/30" : ""}`}
                      >
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            disabled={isAdmin}
                            onClick={() => handleSelectUser(u.user_id)}
                            className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-[11px] uppercase shrink-0">
                              {u.username.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{u.username}</div>
                              <div className="text-[11px] text-slate-400">{fullName}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-6">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {u.email}
                          </div>
                        </td>

                        <td className="py-3 px-6">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                              u.role_id === 1
                                ? "bg-purple-100 text-purple-700"
                                : u.role_id === 2
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            <Shield className="w-3 h-3" />
                            {u.role ||
                              (u.role_id === 1
                                ? "ADMIN"
                                : u.role_id === 2
                                ? "INSTRUCTOR"
                                : "STUDENT")}
                          </span>
                        </td>

                        <td className="py-3 px-6">
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

                        <td className="py-3 px-6 text-slate-500 text-[11px]">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(u.created_at).toLocaleDateString("vi-VN")}
                          </div>
                        </td>

                        <td className="py-3 px-6 text-right">
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={updatingId === u.user_id || isAdmin}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold ${
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

          {/* THANH CHUYỂN TRANG (100 USER / TRANG) */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 border-t border-slate-200/80 bg-slate-50/60 px-6 py-4 text-xs text-slate-600">
            <div>
              Đang xem{" "}
              <strong className="text-slate-900">
                {fromRecord.toLocaleString("vi-VN")} - {toRecord.toLocaleString("vi-VN")}
              </strong>{" "}
              (Trang <strong className="text-slate-900">{page.toLocaleString("vi-VN")}</strong> /{" "}
              <strong className="text-slate-900">{totalPages.toLocaleString("vi-VN")}</strong>)
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(1)}
                disabled={page <= 1 || loading}
                title="Trang đầu"
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading}
                title="Trang trước"
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {getVisiblePages().map((p, idx) =>
                p === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p)}
                    disabled={loading}
                    className={`min-w-[34px] rounded-xl px-2.5 py-1.5 text-xs font-bold ${
                      page === p
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages || loading}
                title="Trang sau"
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => goToPage(totalPages)}
                disabled={page >= totalPages || loading}
                title="Trang cuối"
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>

              {/* Ô nhập nhảy nhanh tới trang bất kỳ */}
              <form onSubmit={handleJumpPage} className="flex items-center gap-1.5 ml-2">
                <span className="text-slate-500">Đến trang:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPageInput}
                  onChange={(e) => setJumpPageInput(e.target.value)}
                  className="w-20 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-40"
                >
                  Tải
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}