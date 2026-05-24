import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ECC Global Finance — Sistem Rekap Keuangan Gereja",
  description: "Manajemen mutasi rekening multi-cabang untuk gereja ECC",
  icons: {
    icon: [
      { url: "/images/logo-ecc.webp", type: "image/webp" },
    ],
    shortcut: "/images/logo-ecc.webp",
    apple: "/images/logo-ecc.webp",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a", // brand black
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Fraunces:ital,wght@0,300;0,600;1,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
