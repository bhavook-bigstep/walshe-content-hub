import type { ReactNode } from "react";
import { Inter, Lato } from "next/font/google";
import "./globals.css";

// Inter is the licensed shipped fallback for Founders Grotesk (paid Klim face, not bundled);
// Lato covers small UI text. Both load via next/font so the font stack (tailwind.config.ts) is
// satisfied without a layout shift. Swap in licensed Founders Grotesk WOFF2 without code changes.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-ui",
});

export const metadata = {
  title: "The Walshe Content Hub",
  description: "Verified destination content, assembled into trade marketing in minutes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lato.variable}`}>
      <body className="min-h-screen bg-walshe-paper text-walshe-ink antialiased">{children}</body>
    </html>
  );
}
