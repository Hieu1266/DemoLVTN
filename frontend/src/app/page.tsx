"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homeByRole, useSession } from "@/src/lib/session";

export default function Home() {
  const { user, ready } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(user ? homeByRole(user.role) : "/login");
  }, [ready, user, router]);

  return null;
}
