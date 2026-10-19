"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homeByRole, useSession } from "@/src/lib/session";

export default function AuthGuard({
  role,
  children,
}: {
  role: "INSTRUCTOR" | "STUDENT";
  children: React.ReactNode;
}) {
  const { user, ready } = useSession();
  const router = useRouter();
  const allowed = !!user && (role === "STUDENT" ? user.role === "STUDENT" : user.role !== "STUDENT");

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (!allowed) router.replace(homeByRole(user.role));
  }, [ready, user, allowed, router]);

  if (!ready || !allowed) return null;
  return <>{children}</>;
}
