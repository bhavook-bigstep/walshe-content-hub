import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter throughout — body, UI, and the large display headings — matching the reference's
// single-family system (Inter 300–700, tight negative tracking at display sizes). The variable
// font carries every weight, so display headings go heavy (600) while body stays regular.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata = {
  title: "The Walshe Content Hub",
  description: "Verified destination content, assembled into trade marketing in minutes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-walshe-paper text-walshe-ink antialiased">{children}</body>
    </html>
  );
}
