import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "AI Council",
  description: "Private model council with debate, research, evals, and token accounting."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
