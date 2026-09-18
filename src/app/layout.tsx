import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ConfigureAmplifyClientSide from "@/components/ConfigureAmplify";

const cirka = localFont({
  src: [
    {
      path: "./fonts/PPCirka-Regular.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/PPCirka-Bold.woff",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-cirka",
  display: "swap",
});

const gilroy = localFont({
  src: [
    {
      path: "./fonts/Gilroy-SemiBold.woff",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/Gilroy-Bold.woff",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-gilroy",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinFine Pro",
  description: "Cash flow made easy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cirka.variable} ${gilroy.variable} bg-white`}>
      <body className="bg-[#FFFFFF] text-[#111215] font-sans antialiased selection:bg-black selection:text-white min-h-screen">
        <ConfigureAmplifyClientSide />
        {children}
      </body>
    </html>
  );
}
