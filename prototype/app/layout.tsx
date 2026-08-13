import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HOME / HAZARD — Bring It Into the Light",
  description: "A design-led field guide to the potentially toxic chemicals hiding in ordinary homes.",
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
      <body>{children}</body>
    </html>
  );
}
