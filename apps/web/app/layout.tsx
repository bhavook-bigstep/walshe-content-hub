import type { ReactNode } from "react";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// Inter for UI/body; Playfair Display is the elegant high-contrast serif for display headings,
// echoing The Walshe Group's identity. Both load via next/font (no layout shift).
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-serif",
});

export const metadata = {
  title: "The Walshe Content Hub",
  description: "Verified destination content, assembled into trade marketing in minutes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen bg-walshe-paper text-walshe-ink antialiased">{children}</body>
    </html>
  );
}
