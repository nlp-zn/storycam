import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoryCam",
  description: "A private story-theater camera for personal video memories."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
