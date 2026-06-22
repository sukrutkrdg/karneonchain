import type { Metadata } from "next";
import "@coinbase/onchainkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { APP_NAME, APP_DESCRIPTION, APP_URL } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: APP_NAME,
  description: APP_DESCRIPTION,
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: [`${APP_URL}/api/card`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
