import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Chasis ERP", template: "%s · Chasis ERP" },
  description:
    "VST Titanium Motors ERP: Mercedes-Benz purchases, demo stock, fixed compensation and finance, insurance and renewal payouts, from invoice to receipt.",
  applicationName: "Chasis ERP",
  authors: [{ name: "VST Titanium Motors" }],
  creator: "VST Titanium Motors",
  publisher: "VST Titanium Motors",
  keywords: ["ERP", "Mercedes-Benz", "dealership", "VST Titanium Motors"],
  referrer: "strict-origin-when-cross-origin",
  // Internal system: never indexed, cached or previewed by search engines.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true, "max-snippet": 0, "max-image-preview": "none", "max-video-preview": 0 },
  },
  formatDetection: { telephone: false, address: false, email: false },
  // Title/description only, for when a link is shared in chat; no images or data.
  openGraph: { type: "website", siteName: "Chasis ERP", title: "Chasis ERP · VST Titanium Motors", description: "Sign in to continue." },
  appleWebApp: { title: "Chasis ERP", statusBarStyle: "black-translucent" },
  category: "business",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
