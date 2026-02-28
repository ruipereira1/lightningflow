"use client";

// Navegação lateral com active state baseado na rota actual

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  DollarSign,
  ArrowLeftRight,
  BarChart3,
  Users,
  Bot,
  Settings,
  History,
} from "lucide-react";

const navItems = [
  { href: "/",             label: "Dashboard",        Icon: LayoutDashboard, exact: true },
  { href: "/channels",    label: "Canais",            Icon: Zap },
  { href: "/fees",        label: "Fees",              Icon: DollarSign },
  { href: "/fee-history", label: "Histórico Fees",    Icon: History },
  { href: "/rebalance",   label: "Rebalancing",       Icon: ArrowLeftRight },
  { href: "/automation",  label: "Automação",         Icon: Bot },
  { href: "/analytics",   label: "Analytics",         Icon: BarChart3 },
  { href: "/peers",       label: "Peers",             Icon: Users },
  { href: "/settings",    label: "Definições",        Icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-4 overflow-y-auto" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {navItems.map(({ href, label, Icon, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150"
            style={isActive ? {
              background: "rgba(139,92,246,0.12)",
              color: "#c4b5fd",
              borderLeft: "2px solid #8b5cf6",
              padding: "10px 12px 10px 10px", // compensa os 2px do border
              boxShadow: "inset 0 0 20px rgba(139,92,246,0.06)",
            } : {
              color: "#71717a",
              padding: "10px 12px",
            }}
          >
            <Icon
              size={16}
              className="flex-shrink-0"
              style={{ color: isActive ? "#8b5cf6" : "currentColor" }}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
