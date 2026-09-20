import type { Metadata } from "next";
import "./globals.css";
import ConfigureAmplifyClientSide from "@/components/ConfigureAmplify";
import I18nProvider from "@/components/I18nProvider";

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
    <html lang="en" className="bg-white">
      <body className="bg-[#FFFFFF] text-[#111215] font-sans antialiased selection:bg-black selection:text-white min-h-screen">
        <ConfigureAmplifyClientSide />
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}

