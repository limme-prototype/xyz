import type { Metadata, Viewport } from "next";
import "./globals.css";

// iOS Design System: SF Pro is the system font on Apple devices.
// system-ui resolves to SF Pro on iOS/macOS, Segoe UI on Windows,
// Roboto on Android — the correct native font on every platform.
// We intentionally do NOT load Google Fonts here: iOS HIG says
// "default to the platform's system font before a custom face."

export const metadata: Metadata = {
  title: "xyz",
  description: "Minimalist and focused video player.",
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  // iOS: match the true-black systemBackground
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Always dark — app uses iOS dark mode color system
    <html lang="en" className="dark">
      {/*
        iOS body baseline:
        - bg-background  = systemBackground (#000000)
        - text-foreground = label (#FFFFFF)
        - antialiased    = -webkit-font-smoothing: antialiased
        - font is system-ui (= SF Pro on Apple, Segoe on Windows)
      */}
      <body className="min-h-screen bg-background text-foreground antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
