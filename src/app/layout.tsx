import type { Metadata } from "next";
import "./globals.css";
import ConfigureAmplifyClientSide from "@/components/ConfigureAmplify";

export const metadata: Metadata = {
  title: "FinFine Pro - S3 Uploader",
  description: "Upload documents to Amazon S3 using AWS Amplify Gen 2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ConfigureAmplifyClientSide />
        {children}
      </body>
    </html>
  );
}
