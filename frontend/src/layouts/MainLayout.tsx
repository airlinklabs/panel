import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";

export function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <Topbar onMenuToggle={() => setMobileMenuOpen((o) => !o)} />

      <main className="md:ml-56 pt-16 pb-20 md:pb-0 min-h-screen">
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
