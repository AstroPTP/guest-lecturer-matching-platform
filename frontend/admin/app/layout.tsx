import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCAE Admin Portal",
  description: "CCAE platform administration workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
