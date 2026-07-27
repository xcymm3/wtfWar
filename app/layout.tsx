import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "War AI",
  description: "用一句话创造角色，开始一场 AI 文字对战。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="app-page">{children}</div>
      </body>
    </html>
  );
}
