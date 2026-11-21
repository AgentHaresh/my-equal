import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import InstallApp from "./InstallApp";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["900"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: "My Equal",
  description: "A messenger with your Equal inside it: it keeps your people close, your promises kept, and your family safe.",
  applicationName: "My Equal",
  appleWebApp: { capable: true, title: "My Equal", statusBarStyle: "black-translucent" },
};

// Fits the whole phone screen, including the area around the notch, and colours the status bar.
export const viewport: Viewport = {
  themeColor: "#0c63d0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <InstallApp />
      </body>
    </html>
  );
}
