// Layout do dashboard — sidebar dark premium + conteúdo principal

import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { NodeSelector } from "@/components/node-selector";
import { SidebarNav } from "@/components/sidebar-nav";
import { NotificationsProvider } from "@/lib/notifications";
import { NotificationBell } from "@/components/notification-bell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const authenticated = await isAuthenticated();
  if (!authenticated) redirect("/login");

  return (
    <NotificationsProvider>
    <div className="flex h-screen overflow-hidden" style={{ background: "#09090b" }}>
      {/* ===== SIDEBAR DARK PREMIUM ===== */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col"
        style={{
          background: "linear-gradient(180deg, #0e0b1f 0%, #08060f 100%)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          position: "relative",
        }}
      >
        {/* Glow suave no topo da sidebar */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "140px",
            background: "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.13) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
          <Link href="/" className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #0891b2)",
                boxShadow: "0 0 20px rgba(139,92,246,0.45), 0 2px 4px rgba(0,0,0,0.4)",
              }}
            >
              ⚡
            </div>
            <div>
              <div
                className="font-bold text-sm leading-none tracking-tight"
                style={{
                  background: "linear-gradient(135deg, #c4b5fd, #67e8f9)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                LightningFlow
              </div>
              <div className="text-xs mt-0.5 font-medium" style={{ color: "#3f3f46" }}>
                Channel Manager
              </div>
            </div>
          </Link>
        </div>

        {/* Node selector */}
        <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="text-xs font-medium mb-2" style={{ color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Active Node
          </div>
          <NodeSelector />
        </div>

        {/* Navegação — componente client com active state */}
        <SidebarNav />

        {/* Notifications + Logout */}
        <div className="px-4 py-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "#3f3f46" }}>Notifications</span>
            <NotificationBell />
          </div>
          <LogoutButton />
          <div className="text-xs text-center" style={{ color: "#27272a" }}>
            v1.0.0
          </div>
        </div>
      </aside>

      {/* ===== CONTEÚDO PRINCIPAL ===== */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
    </NotificationsProvider>
  );
}
