import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "track-prefix",
  description: "Local FIFO tracer for mined sat-name prefix series",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${jetbrainsMono.className} min-h-screen bg-terminal-bg text-terminal-text font-mono antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
