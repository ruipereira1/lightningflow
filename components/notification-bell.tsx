"use client";

import { useRef, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications, NotificationLevel } from "@/lib/notifications";

const LEVEL_COLORS: Record<NotificationLevel, { bg: string; text: string; dot: string }> = {
  info:    { bg: "rgba(6,182,212,0.1)",   text: "#22d3ee", dot: "#06b6d4" },
  success: { bg: "rgba(74,222,128,0.1)",  text: "#4ade80", dot: "#22c55e" },
  warning: { bg: "rgba(251,146,60,0.1)",  text: "#fb923c", dot: "#f97316" },
  error:   { bg: "rgba(239,68,68,0.1)",   text: "#f87171", dot: "#ef4444" },
};

function timeSince(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((o) => !o);
    if (!open) markAllRead();
  };

  return (
    <div ref={ref} className="relative">
      {/* Botão sino */}
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/5"
        style={{ color: unreadCount > 0 ? "#a78bfa" : "#52525b" }}
        aria-label="Notificações"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white font-bold"
            style={{
              background: "#8b5cf6",
              fontSize: "9px",
              minWidth: "14px",
              height: "14px",
              padding: "0 2px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Painel de notificações */}
      {open && (
        <div
          className="absolute bottom-full mb-2 right-0 w-72 rounded-xl overflow-hidden z-50"
          style={{
            background: "#18181b",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="text-xs font-semibold text-white">Notificações</span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-zinc-600">
                Sem notificações
              </div>
            ) : (
              notifications.map((n) => {
                const colors = LEVEL_COLORS[n.level];
                return (
                  <div
                    key={n.id}
                    className="px-4 py-3 flex gap-3"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: colors.dot }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-xs font-medium" style={{ color: colors.text }}>{n.title}</span>
                        <span className="text-xs text-zinc-600 flex-shrink-0">{timeSince(n.timestamp)}</span>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed">{n.message}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
