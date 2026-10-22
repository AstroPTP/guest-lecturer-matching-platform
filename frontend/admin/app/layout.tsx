import type { Metadata } from "next";
import "./globals.css";
import { themeScript } from "@/components/theme/themeScript";

export const metadata: Metadata = {
  title: { default: "Curtin GLMP", template: "Curtin GLMP | %s" },
  description: "CCAE platform administration workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint so a dark theme does not flash white first. The
            script writes an attribute the stylesheet reads; nothing else. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
