import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
});

export const metadata: Metadata = {
  title: "EBM Engine — Ultimate Pit Limit Optimizer",
  description: "Economic Boundary Model: 3D Pit Shell visualization powered by Graph Theory & Max-Flow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="antialiased bg-[#050510] text-white" style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
