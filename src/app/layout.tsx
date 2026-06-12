import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cesanek Dashboard",
  description: "WISE Operations Dashboard — Cesanek Facility",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
