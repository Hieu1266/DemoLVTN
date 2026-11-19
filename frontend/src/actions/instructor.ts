import { api, AUTH_URL } from "@/src/lib/api";

export interface CreateInstructorData {
  username: string;
  email: string;
  password: string;
  role_id: number;
  status_id?: string;
  profile: {
    firstname?: string;
    lastname?: string;
    bio?: string;
    avatar_url?: string;
  };
}

export interface UserReadResponse {
  user_id: string;
  username: string;
  email: string;
  role_id: number;
  role: string;
  status_id: string;
  created_at: string;
  profile?: {
    firstname?: string;
    lastname?: string;
    bio?: string;
  };
}

// 1. API Cấp tài khoản Giảng viên / Admin mới
export const createInstructor = (data: CreateInstructorData) =>
  api<UserReadResponse>(AUTH_URL, "/users/instructor", {
    method: "POST",
    body: JSON.stringify(data),
  });

// 2. API Lấy danh sách toàn bộ người dùng
export const getUsers = (params?: GetUsersParams) => {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("page_size", String(params.pageSize));
  if (params?.search?.trim()) query.set("search", params.search.trim());
  if (params?.role && params.role !== "ALL") query.set("role", params.role);
  if (params?.status && params.status !== "ALL") query.set("status", params.status);

  const qs = query.toString() ? `?${query.toString()}` : "";
  return api<PaginatedUsersResponse>(AUTH_URL, `/users${qs}`, {
    method: "GET",
  });
};
// 3. API Đổi trạng thái người dùng (ACTIVE <-> BANNED / INACTIVE)
export const updateUserStatus = (userId: string, statusId: string) =>
  api<UserReadResponse>(AUTH_URL, `/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status_id: statusId }),
  });



  export interface GetUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
}

export interface PaginatedUsersResponse {
  items: UserReadResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// 2. API Lấy danh sách người dùng có phân trang & lọc
