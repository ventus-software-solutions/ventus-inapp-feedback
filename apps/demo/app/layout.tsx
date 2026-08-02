import "./globals.css";

export const metadata = {
  title: "Ventus Feedback Capture Lab",
  description: "In-repo dogfooding playground for Ventus In-App Feedback.",
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
