import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "$YOP Ponyta King",
  description: "Telegram Mini App MVP shell",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
