import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReGit: Before you change code, know what it will break",
  description:
    "ReGit is a Git-aware code intelligence and safety layer: impact analysis, pre-commit safety rules, cleanup and AI explanation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#070b12] text-[#e6edf3] antialiased">
        {children}
      </body>
    </html>
  );
}
