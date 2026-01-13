import type { Metadata } from "next";
import { Cairo, Poppins } from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/context/SocketContext";

const cairo = Cairo({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const poppins = Poppins({
  variable: "--font-english",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Eng WA Manager - إدارة واتساب الاحترافية",
  description: "نظام متقدم لإدارة محادثات واتساب مع تحليلات وفلاتر متقدمة والرد على الرسائل",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.variable} font-sans antialiased bg-[#0b141a]`}>
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
