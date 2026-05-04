"use client"
import '@/app/ui/global.css';
import {inter} from "@/app/ui/fonts"
import NextAuthSessionProvider from './provider';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>TGT Inventory</title>
        <link rel="icon" href="/logo.png" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
      </body>
    </html>
  );
}
