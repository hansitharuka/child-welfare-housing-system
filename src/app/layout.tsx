import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

// Noto Sans Sinhala served from this app, never from Google at runtime (UI-4, STK-2).
const sinhala = localFont({
  src: "./fonts/noto-sans-sinhala-sinhala-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-sinhala",
  display: "swap",
});

const latin = localFont({
  src: "./fonts/noto-sans-sinhala-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-latin",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("name"), description: t("description") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page render per request, so each one gets the proxy's CSP nonce (SEC-5).
  await headers();
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${sinhala.variable} ${latin.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
