import AuthGuard from "@/src/components/AuthGuard";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard role="INSTRUCTOR">{children}</AuthGuard>;
}
