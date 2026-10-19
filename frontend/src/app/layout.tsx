import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/src/components/Navbar";
import Footer from "@/src/components/Footer";

export const metadata: Metadata = {
  title: "LUMER - Thi trực tuyến",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <div className="flex min-h-screen flex-col bg-linear-to-b from-indigo-50 via-transparent to-transparent font-sans dark:from-indigo-950/30">
          <Suspense fallback={<div className="h-16 border-b border-gray-200/80 dark:border-white/10" />}>
            <Navbar />
          </Suspense>
          <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 sm:px-8">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
