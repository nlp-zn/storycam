import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "StoryCam",
  description: "A personal story-theater camera for personal video memories.",
  icons: {
    apple: [{ url: "/storycam/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/storycam/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/storycam/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
      <body>
        <TooltipProvider>
          {children}
          <Toaster position="top-center" />
        </TooltipProvider>
      </body>
    </html>
  );
}
