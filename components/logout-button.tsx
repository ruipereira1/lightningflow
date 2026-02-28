"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 hover:bg-white/5"
      style={{ color: "#52525b" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
    >
      <LogOut size={15} className="flex-shrink-0" />
      Sair
    </button>
  );
}
