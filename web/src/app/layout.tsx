import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import {
  getPlatformSettings,
  themeToCssVars,
  faviconDataUri,
} from "@/lib/branding";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/**
 * Platform-level metadata (title + favicon) driven by `platform_settings`,
 * so renaming the product or swapping the emoji logo in /admin/theme takes
 * effect on next load with no code change. Falls back to the static
 * defaults in src/lib/branding.ts if the row can't be read.
 */
export async function generateMetadata(): Promise<Metadata> {
  const platform = await getPlatformSettings();
  return {
    title: platform.platform_name,
    description: `${platform.platform_name} — enterprise AI video automation studio.`,
    icons: {
      icon: faviconDataUri(platform.favicon_emoji),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const platform = await getPlatformSettings();
  // Inline styles win over every stylesheet rule at equal-or-lower
  // specificity (including globals.css's `.dark` overrides), so setting the
  // DB-configured theme tokens here is what makes platform_settings.theme
  // override the static CSS defaults instantly, with dark/light toggling
  // still working for every token NOT covered by the theme (border,
  // elevated, muted-foreground, status colors, on-primary, ring accents).
  const themeVars = themeToCssVars(platform.theme) as React.CSSProperties;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col bg-background text-foreground"
        style={themeVars}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme={platform.theme.mode ?? "dark"}
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
