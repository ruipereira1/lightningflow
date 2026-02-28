"use client";

import { useEffect, useRef, useCallback } from "react";

export function useSSE(
  nodeId: string | null,
  onEvent: (event: string, data: unknown) => void
) {
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);

  // Manter ref atualizada sem re-abrir a ligação
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    if (!nodeId) return;

    const es = new EventSource(`/api/events?nodeId=${encodeURIComponent(nodeId)}`);
    esRef.current = es;

    const EVENTS = ["connected", "nodeInfo", "channel"] as const;
    EVENTS.forEach((eventName) => {
      es.addEventListener(eventName, (e: MessageEvent) => {
        try {
          onEventRef.current(eventName, JSON.parse(e.data));
        } catch {
          onEventRef.current(eventName, e.data);
        }
      });
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Reconectar após 5s
      timerRef.current = setTimeout(connect, 5_000);
    };
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [nodeId, connect]);
}
