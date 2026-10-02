import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import PageTransition from "../components/ui/PageTransition";

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

// Set the theme before first paint (no flash). Stored choice wins; otherwise follow the OS.
const themeScript = `(function(){try{var t=localStorage.getItem('walsh-theme');var d=(t==='light'||t==='dark')?t:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',d);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-walshe-paper text-walshe-ink antialiased">
        <PageTransition />
        {children}
      </body>
    </html>
  );
}
