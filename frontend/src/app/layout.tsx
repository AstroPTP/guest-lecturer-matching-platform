import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { themeScript } from "@/components/theme/themeScript";

export const metadata: Metadata = {
  title: { default: "Curtin GLMP", template: "Curtin GLMP | %s" },
  description: "Connect guest lecturers with unit coordinators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/*
          Applies a stored light or dark choice before the first paint, so a
          dark-mode user does not see a white flash on every navigation. The
          server cannot know the choice, hence suppressHydrationWarning above.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
