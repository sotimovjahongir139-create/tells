import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Qo'ng'iroqlar Holati",
  description: "AmoCRM qo'ng'iroq statistikasi boshqaruv paneli",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body className="bg-gray-950 text-white antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
