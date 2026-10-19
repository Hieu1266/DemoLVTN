import AuthGuard from "@/src/components/AuthGuard";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard role="STUDENT">{children}</AuthGuard>;
}
