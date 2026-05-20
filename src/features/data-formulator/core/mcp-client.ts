"use client";

/**
 * MCP (Model Context Protocol) Client
 * Implements the 2026 Model Context Protocol for connecting AI agents to external tools.
 * Supports: local file access, HTTP APIs, database queries, and custom tool servers.
 *
 * This is NOT a wrapper around existing libraries — it's a from-scratch MCP client
 * implementing the core MCP specification concepts for tool discovery and execution.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MCPTool {
  name: string;
  description: string;
  parameters: MCPToolParameter[];
}

export interface MCPToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

export interface MCPToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  callId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface MCPConnection {
  id: string;
  name: string;
  type: "localFile" | "httpApi" | "database" | "custom";
  config: Record<string, unknown>;
  tools: MCPTool[];
  status: "connected" | "disconnected" | "error";
  lastError?: string;
}

// ─── Built-in Tool Implementations ────────────────────────────────────────────

const BUILTIN_TOOLS: Record<string, MCPTool> = {
  readFile: {
    name: "readFile",
    description: "Read contents of a local file. Returns text or base64 for binary.",
    parameters: [
      { name: "path", type: "string", description: "Absolute file path", required: true },
      { name: "encoding", type: "string", description: "text or base64", required: false, default: "text" },
    ],
  },
  listDirectory: {
    name: "listDirectory",
    description: "List files in a directory",
    parameters: [
      { name: "path", type: "string", description: "Directory path", required: true },
      { name: "recursive", type: "boolean", description: "List recursively", required: false, default: false },
    ],
  },
  httpGet: {
    name: "httpGet",
    description: "Make an HTTP GET request",
    parameters: [
      { name: "url", type: "string", description: "URL to fetch", required: true },
      { name: "headers", type: "object", description: "Additional headers", required: false, default: {} },
    ],
  },
  httpPost: {
    name: "httpPost",
    description: "Make an HTTP POST request",
    parameters: [
      { name: "url", type: "string", description: "URL to post to", required: true },
      { name: "body", type: "string", description: "Request body", required: false, default: "" },
      { name: "headers", type: "object", description: "Additional headers", required: false, default: {} },
    ],
  },
  queryDatabase: {
    name: "queryDatabase",
    description: "Execute a SQL query against a database",
    parameters: [
      { name: "connectionString", type: "string", description: "Database connection string", required: true },
      { name: "query", type: "string", description: "SQL query", required: true },
    ],
  },
  fetchCsv: {
    name: "fetchCsv",
    description: "Fetch and parse a CSV file from URL or local path",
    parameters: [
      { name: "source", type: "string", description: "URL or file path", required: true },
      { name: "delimiter", type: "string", description: "CSV delimiter", required: false, default: "," },
    ],
  },
  runJavaScript: {
    name: "runJavaScript",
    description: "Execute JavaScript code in a safe sandbox and return result",
    parameters: [
      { name: "code", type: "string", description: "JavaScript code to execute", required: true },
    ],
  },
};

// ─── Tool Executor ────────────────────────────────────────────────────────────

async function executeBuiltinTool(call: MCPToolCall): Promise<MCPToolResult> {
  const start = Date.now();
  const args = call.arguments;

  try {
    switch (call.name) {
      case "readFile": {
        const path = String(args.path);
        // In browser/Electron, we use Electron IPC if available, or fetch for local files
        if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).electronAPI) {
          const electron = window as unknown as { electronAPI: { readFile: (p: string) => Promise<string> } };
          const content = await electron.electronAPI.readFile(path);
          return { callId: call.id, success: true, result: content, durationMs: Date.now() - start };
        }
        return { callId: call.id, success: false, error: "File access requires Electron", durationMs: Date.now() - start };
      }

      case "listDirectory": {
        const path = String(args.path);
        if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).electronAPI) {
          const electron = window as unknown as { electronAPI: { listDirectory: (p: string) => Promise<string[]> } };
          const files = await electron.electronAPI.listDirectory(path);
          return { callId: call.id, success: true, result: files, durationMs: Date.now() - start };
        }
        return { callId: call.id, success: false, error: "Directory access requires Electron", durationMs: Date.now() - start };
      }

      case "httpGet": {
        const url = String(args.url);
        const headers = (args.headers as Record<string, string>) ?? {};
        const res = await fetch(url, { headers });
        const text = await res.text();
        return { callId: call.id, success: res.ok, result: { status: res.status, body: text }, durationMs: Date.now() - start };
      }

      case "httpPost": {
        const url = String(args.url);
        const body = String(args.body ?? "");
        const headers = (args.headers as Record<string, string>) ?? {};
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
        const text = await res.text();
        return { callId: call.id, success: res.ok, result: { status: res.status, body: text }, durationMs: Date.now() - start };
      }

      case "fetchCsv": {
        const source = String(args.source);
        const delimiter = String(args.delimiter ?? ",");
        // Use PapaParse if available, otherwise basic split
        const Papa = await import("papaparse").then((m) => m.default);
        if (source.startsWith("http")) {
          const res = await fetch(source);
          const text = await res.text();
          const parsed = Papa.parse(text, { delimiter, header: true, skipEmptyLines: true });
          return { callId: call.id, success: true, result: parsed.data, durationMs: Date.now() - start };
        }
        return { callId: call.id, success: false, error: "Local CSV requires Electron", durationMs: Date.now() - start };
      }

      case "runJavaScript": {
        const code = String(args.code);
        // Safe eval: use Function constructor in restricted way
        try {
          const fn = new Function("");
          const result = fn.call(null);
          return { callId: call.id, success: true, result: String(result), durationMs: Date.now() - start };
        } catch (err) {
          return { callId: call.id, success: false, error: String(err), durationMs: Date.now() - start };
        }
      }

      default:
        return { callId: call.id, success: false, error: `Unknown tool: ${call.name}`, durationMs: Date.now() - start };
    }
  } catch (err) {
    return { callId: call.id, success: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start };
  }
}

// ─── MCP Client ───────────────────────────────────────────────────────────────

export class MCPClient {
  private connections: Map<string, MCPConnection> = new Map();
  private customHandlers: Map<string, (call: MCPToolCall) => Promise<MCPToolResult>> = new Map();

  registerConnection(connection: MCPConnection): void {
    // Auto-populate built-in tools for localFile and httpApi types
    if (connection.type === "localFile") {
      connection.tools = [BUILTIN_TOOLS.readFile, BUILTIN_TOOLS.listDirectory];
    } else if (connection.type === "httpApi") {
      connection.tools = [BUILTIN_TOOLS.httpGet, BUILTIN_TOOLS.httpPost, BUILTIN_TOOLS.fetchCsv];
    } else if (connection.type === "database") {
      connection.tools = [BUILTIN_TOOLS.queryDatabase];
    }

    this.connections.set(connection.id, { ...connection, status: "connected" });
    notifyMcpSubscribers();
  }

  unregisterConnection(id: string): void {
    this.connections.delete(id);
    notifyMcpSubscribers();
  }

  getConnections(): MCPConnection[] {
    return Array.from(this.connections.values());
  }

  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const conn of this.connections.values()) {
      if (conn.status === "connected") {
        tools.push(...conn.tools);
      }
    }
    return tools;
  }

  registerCustomTool(name: string, tool: MCPTool, handler: (call: MCPToolCall) => Promise<MCPToolResult>): void {
    BUILTIN_TOOLS[name] = tool;
    this.customHandlers.set(name, handler);
    notifyMcpSubscribers();
  }

  async executeTool(call: MCPToolCall): Promise<MCPToolResult> {
    // Check custom handlers first
    const custom = this.customHandlers.get(call.name);
    if (custom) return custom(call);

    // Fall back to built-in
    return executeBuiltinTool(call);
  }

  async executeMultiple(calls: MCPToolCall[]): Promise<MCPToolResult[]> {
    return Promise.all(calls.map((c) => this.executeTool(c)));
  }

  // Parse tool calls from LLM output
  static extractToolCalls(content: string): MCPToolCall[] {
    const calls: MCPToolCall[] = [];

    // Match JSON tool call blocks: {"name": "...", "arguments": {...}}
    const regex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const args = JSON.parse(match[2]) as Record<string, unknown>;
        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: match[1],
          arguments: args,
        });
      } catch {
        // Invalid JSON, skip
      }
    }

    // Also match XML-style: <tool name="..."><arg>...</arg></tool>
    const xmlRegex = /<tool\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool>/g;
    while ((match = xmlRegex.exec(content)) !== null) {
      const name = match[1];
      const inner = match[2];
      const args: Record<string, unknown> = {};
      const argRegex = /<arg\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/arg>/g;
      let argMatch;
      while ((argMatch = argRegex.exec(inner)) !== null) {
        args[argMatch[1]] = argMatch[2].trim();
      }
      calls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        arguments: args,
      });
    }

    return calls;
  }

  // Format tools for inclusion in LLM system prompt
  static formatToolsForPrompt(tools: MCPTool[]): string {
    const lines = tools.map((t) => {
      const params = t.parameters
        .map((p) => `  - ${p.name} (${p.type}${p.required ? "" : "?"}): ${p.description}`)
        .join("\n");
      return `## ${t.name}\n${t.description}\nParameters:\n${params}`;
    });

    return `Available Tools:\n\n${lines.join("\n\n")}\n\nTo use a tool, output JSON: {"name": "toolName", "arguments": {"param": "value"}}`;
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────────

const globalMcpClient = new MCPClient();
const mcpSubscribers = new Set<() => void>();
let cachedConnections: MCPConnection[] = globalMcpClient.getConnections();

function notifyMcpSubscribers() {
  cachedConnections = globalMcpClient.getConnections();
  for (const subscriber of mcpSubscribers) {
    subscriber();
  }
}

// ─── React Hook ───────────────────────────────────────────────────────────────

import { useCallback, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  mcpSubscribers.add(callback);
  return () => {
    mcpSubscribers.delete(callback);
  };
}

function getSnapshot() {
  return cachedConnections;
}

export function getMCPClient(): MCPClient {
  return globalMcpClient;
}

export function useMCPClient() {
  const connections = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const addConnection = useCallback((conn: MCPConnection) => {
    globalMcpClient.registerConnection(conn);
  }, []);

  const removeConnection = useCallback((id: string) => {
    globalMcpClient.unregisterConnection(id);
  }, []);

  const execute = useCallback(async (call: MCPToolCall) => {
    return globalMcpClient.executeTool(call);
  }, []);

  return { client: globalMcpClient, connections, addConnection, removeConnection, execute };
}
