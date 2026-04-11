import type { Metadata } from "next";
import { Geist_Mono, Inter, Oswald } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Peer Racing | Community-powered racing",
  description:
    "Host races, enter events, and pace friends. Peer Racing helps promoters publish events and runners enter races.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${oswald.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
