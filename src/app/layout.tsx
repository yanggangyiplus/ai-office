import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 오피스",
  description: "팀의 회의와 진행 상황이 한눈에 보이는 가상 오피스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <head>
        {/* Galmuri: Korean pixel font. If the CDN is blocked the CSS falls back to monospace. */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/galmuri@latest/dist/galmuri.css" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
