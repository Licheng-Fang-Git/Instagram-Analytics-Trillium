import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata = {
  title: "Trillium · Instagram Analytics",
  description: "Instagram analytics for @trilliumtrading",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="flex min-h-screen bg-[#0d0d0d] text-white">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
