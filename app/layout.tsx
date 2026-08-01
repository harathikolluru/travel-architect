import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel Architect",
  description: "AI-powered travel itineraries that survive reality",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
