import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "好好说话 · AI沟通助手",
  description: "给重要对话，留一点准备时间。基于《非暴力沟通》《关键对话》的 AI 沟通练习室，支持表达改写与场景练习。",
  openGraph: {
    title: "好好说话 · AI沟通助手",
    description: "把想说的话，说得更好。表达改写与场景练习。",
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "好好说话 · AI沟通助手",
    description: "给重要对话，留一点准备时间。",
  },
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

