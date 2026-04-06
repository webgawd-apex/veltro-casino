import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import WalletContextProvider from "../components/WalletContextProvider";

export const metadata = {
  title: "Veltro Casino | Crash Solana",
  description: "High-stakes crash gambling on the Solana Mainnet.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="flex flex-col bg-zinc-950 text-white">
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  );
}
