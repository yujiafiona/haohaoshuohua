import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "好好说话 · AI沟通助手",
  description: "让情绪被理解，而不是被放大。基于《非暴力沟通》《关键对话》的 AI 沟通训练助手，情绪翻译 + 场景练习 + 功德成长。",
  openGraph: {
    title: "好好说话 · AI沟通助手",
    description: "让情绪被理解，而不是被放大。非暴力沟通 AI 训练助手。",
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "好好说话 · AI沟通助手",
    description: "让情绪被理解，而不是被放大。",
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

