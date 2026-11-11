import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { foregroundFor, getBranding } from "@/lib/branding";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { appName, tagline } = await getBranding();
  return { title: appName, description: tagline };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { primaryColor } = await getBranding();

  // The admin's accent colour is applied as inline custom properties on <html>, which
  // outrank the :root defaults in globals.css, so every component that uses the
  // semantic tokens (bg-primary, ring, ...) follows it with no per-component code.
  const accent = {
    "--primary": primaryColor,
    "--primary-foreground": foregroundFor(primaryColor),
    "--ring": primaryColor,
  } as CSSProperties;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={accent}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
