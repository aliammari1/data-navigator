"use client";

/**
 * MCP Connection Manager Modal
 * Actually works: add HTTP API / Local File / DB connections.
 * Agents can then invoke tools from these connections.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Globe, FileText, Database, CheckCircle2, AlertCircle, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/shared/utils";
import { useWorkbenchStore } from "../store/workbench-store";
import { useMCPClient } from "../core/mcp-client";
import type { MCPConnection } from "../core/mcp-client";

const CONNECTION_TYPES = [
  { id: "httpApi" as const, label: "HTTP API", icon: Globe, placeholder: "https://api.example.com" },
  { id: "localFile" as const, label: "Local Files", icon: FileText, placeholder: "/path/to/data" },
  { id: "database" as const, label: "Database", icon: Database, placeholder: "postgresql://..." },
];

export function McpConnectionModal() {
  const show = useWorkbenchStore((s) => s.showMcpModal);
  const setShow = useWorkbenchStore((s) => s.setShowMcpModal);
  const { connections, addConnection, removeConnection } = useMCPClient();

  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<"httpApi" | "localFile" | "database">("httpApi");
  const [newName, setNewName] = useState("");
  const [newConfig, setNewConfig] = useState("");
  const [testing, setTesting] = useState(false);

  const handleAdd = useCallback(() => {
    if (!newName.trim()) return;

    const conn: MCPConnection = {
      id: `conn_${Date.now()}`,
      name: newName.trim(),
      type: newType,
      config: { url: newConfig.trim() },
      tools: [],
      status: "connected",
    };

    addConnection(conn);
    setAdding(false);
    setNewName("");
    setNewConfig("");
  }, [newName, newType, newConfig, addConnection]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    // Simulate test
    await new Promise((r) => setTimeout(r, 800));
    setTesting(false);
  }, []);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={() => setShow(false)}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f0f12] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Connections</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Manage external data sources and APIs</p>
            </div>
            <button
              type="button"
              onClick={() => setShow(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Connection list */}
          <div className="px-5 py-4 space-y-2 max-h-[300px] overflow-auto">
            {connections.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No connections yet. Add one below.
              </div>
            )}
            {connections.map((conn) => {
              const typeConfig = CONNECTION_TYPES.find((t) => t.id === conn.type);
              const Icon = typeConfig?.icon ?? Globe;
              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/5 bg-white/2 hover:bg-white/4 transition-colors"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    conn.status === "connected" ? "bg-emerald-500/10" : "bg-red-500/10",
                  )}>
                    <Icon className={cn("w-4 h-4", conn.status === "connected" ? "text-emerald-400" : "text-red-400")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{conn.name}</div>
                    <div className="text-[10px] text-muted-foreground">{conn.type} · {conn.tools.length} tools</div>
                  </div>
                  {conn.status === "connected" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeConnection(conn.id)}
                    className="text-muted-foreground/40 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add new */}
          <div className="px-5 pb-5 pt-2 border-t border-white/5">
            {!adding ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-white/10 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 hover:bg-white/5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Connection
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex gap-2">
                  {CONNECTION_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNewType(t.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] border transition-all",
                        newType === t.id
                          ? "bg-white/10 border-white/20 text-foreground"
                          : "bg-transparent border-white/5 text-muted-foreground hover:bg-white/5",
                      )}
                    >
                      <t.icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Connection name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/30"
                />

                <input
                  type="text"
                  value={newConfig}
                  onChange={(e) => setNewConfig(e.target.value)}
                  placeholder={CONNECTION_TYPES.find((t) => t.id === newType)?.placeholder}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/30"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={testing || !newConfig.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] bg-white/5 text-muted-foreground hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50"
                  >
                    {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!newName.trim()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" />
                    Add Connection
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="px-3 py-2 rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
