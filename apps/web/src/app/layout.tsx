import type { Metadata } from "next";
import Link from "next/link";
import { Instrument_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Better — Score & improve your AI-built UI",
  description:
    "Paste the URL of what you built with AI and get a design score with ways to improve it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-6 sm:px-8 sm:pt-10">
          <Link href="/" aria-label="Better home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/better-logo.png" alt="Better" width={894} height={227} className="h-auto w-28" />
          </Link>
          <span className="text-sm text-muted-foreground">Design score for AI-built apps</span>
        </header>
        {children}
      </body>
    </html>
  );
}
