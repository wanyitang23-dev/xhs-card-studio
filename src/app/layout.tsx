import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小红书图文 · 分步生成",
  description:
    "把一篇文章分四步做成小红书图文：拆分页 → 逐页确认文案和配图 → 三版封面对比 → 生成成品。由你本地已登录的 coding-agent CLI 驱动，不需要 API Key。",
  openGraph: {
    title: "小红书图文 · 分步生成",
    description: "分步确认式的小红书图文工具，跑在你自己的电脑上。",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="min-h-full bg-[var(--paper)] text-[var(--ink)] selection:bg-[var(--coral)]/30"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
