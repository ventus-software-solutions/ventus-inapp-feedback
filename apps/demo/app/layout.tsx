import "./globals.css";

const publicSiteUrl =
  process.env.VENTUS_PUBLIC_SITE_URL ??
  "https://ventus-software-solutions.github.io/ventus-inapp-feedback/";

export const metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: "Ventus In-App Feedback — Interactive Simulation",
  description:
    "Turn customer feedback into agent-ready work in a private browser-only simulation.",
  openGraph: {
    title: "Ventus In-App Feedback",
    description: "Turn customer feedback into agent-ready work.",
    images: [new URL("og.png", publicSiteUrl).toString()],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ventus In-App Feedback",
    description: "Turn customer feedback into agent-ready work.",
    images: [new URL("og.png", publicSiteUrl).toString()],
  },
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
