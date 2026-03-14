import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenSearch Research Sandbox",
  description:
    "A local OpenSearch research workbench for lexical, vector, and hybrid search against public capital-project data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
