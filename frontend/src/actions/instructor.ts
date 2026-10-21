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
export const getUsers = () =>
  api<UserReadResponse[]>(AUTH_URL, "/users", {
    method: "GET",
  });

// 3. API Đổi trạng thái người dùng (ACTIVE <-> BANNED / INACTIVE)
export const updateUserStatus = (userId: string, statusId: string) =>
  api<UserReadResponse>(AUTH_URL, `/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status_id: statusId }),
  });