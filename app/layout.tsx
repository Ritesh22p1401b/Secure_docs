import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SecureDocs — Confidential Document Viewer",
  description: "Private, access-controlled viewing of confidential PDF and DOCX documents.",
  robots: { index: false, follow: false },
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#4f46e5" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers opts every page into dynamic rendering, which the
  // per-request CSP nonce (set in proxy.ts) requires. Next.js applies the nonce itself.
  await headers();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
