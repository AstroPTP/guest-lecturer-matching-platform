import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";
import ThemeSync from "@/components/theme/ThemeSync";
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
          Sets the theme before the first paint: a signed-in user's stored choice
          on the dashboards, light on every other page. A dark-mode user does
          not see a white flash on every navigation, and a public page never
          paints dark. The server cannot know the choice, hence
          suppressHydrationWarning above.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
