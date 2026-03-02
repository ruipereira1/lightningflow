"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Node {
  id: string;
  name: string;
  type: string;
}

// Contexto global simples usando localStorage
const NODE_KEY = "lf_active_node";

export function useActiveNode() {
  const [nodeId, setNodeId] = useState<string>("");

  // Sync with localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    setNodeId(localStorage.getItem(NODE_KEY) ?? "");
  }, []);

  const setActive = (id: string) => {
    localStorage.setItem(NODE_KEY, id);
    setNodeId(id);
    window.dispatchEvent(new CustomEvent("nodeChange", { detail: id }));
  };

  useEffect(() => {
    const handler = (e: Event) => setNodeId((e as CustomEvent).detail);
    window.addEventListener("nodeChange", handler);
    return () => window.removeEventListener("nodeChange", handler);
  }, []);

  return { nodeId, setActive };
}

export function NodeSelector() {
  const { nodeId, setActive } = useActiveNode();
  const [nodes, setNodes] = useState<Node[]>([]);

  useEffect(() => {
    fetch("/api/nodes")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setNodes(data);
        // Selecionar primeiro nó automaticamente se não houver seleção
        if (!nodeId && data.length > 0) {
          setActive(data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="text-xs text-muted-foreground px-1">
        Nenhum nó configurado
      </div>
    );
  }

  return (
    <Select value={nodeId} onValueChange={setActive}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Selecionar nó..." />
      </SelectTrigger>
      <SelectContent>
        {nodes.map((node) => (
          <SelectItem key={node.id} value={node.id} className="text-xs">
            <span className="mr-2">{node.type === "lnd" ? "🟡" : "🟢"}</span>
            {node.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
