import type { Metadata } from "next";
import "./globals.css";

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
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-terminal-bg text-terminal-text font-mono antialiased">
        {children}
      </body>
    </html>
  );
}
