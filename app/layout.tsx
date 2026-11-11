import type { Metadata } from "next";
import "./globals.css";
import "./workbench.css";
import "./studio.css";
import "./typography.css";
export const metadata: Metadata = {
  title: "Hermes Clip · Chí Đức",
  description:
    "Không gian riêng tư để thử nghiệm sản phẩm, tạo nội dung và đo nhu cầu.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
