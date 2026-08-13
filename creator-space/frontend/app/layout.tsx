import type { Metadata } from "next";
import "./globals.css";
import { LangProvider } from "./i18n";

export const metadata: Metadata = {
  title: "HOME / HAZARD — 家庭化学品安全识别",
  description: "A design-led field guide to the potentially toxic chemicals hiding in ordinary homes. 家庭化学品安全识别与档案。",
  openGraph: {
    title: "HOME / HAZARD",
    description: "Bring the potentially toxic chemicals hiding at home into the light.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "HOME / HAZARD — Bring It Into the Light" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HOME / HAZARD",
    description: "Bring the potentially toxic chemicals hiding at home into the light.",
    images: ["/og.png"],
  },
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
      <body><LangProvider>{children}</LangProvider></body>
    </html>
  );
}
