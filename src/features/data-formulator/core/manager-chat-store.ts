"use client";

/**
 * Manager Chat Store
 * Conversation memory for the manager-AI dialogue.
 * Persisted in localStorage with Zustand.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";
import { bigIntJsonReplacer, sanitizeJsonValue } from "./json";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  intent?: string;
  normalizedContent?: string;
  language?: string;
  timestamp: number;
  evidenceCount?: number;
  confidence?: "high" | "medium" | "low";
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ManagerChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;

  createSession: (title?: string) => string;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, message: Omit<ChatMessage, "id" | "timestamp">) => void;
  getSession: (id: string) => ChatSession | undefined;
  getActiveSession: () => ChatSession | undefined;
  clearSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
}

function newSession(title?: string): ChatSession {
  const now = Date.now();
  return {
    id: `chat_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: title || `Chat ${new Date().toLocaleDateString()}`,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const useManagerChatStore = create<ManagerChatState>()(
  persist(
    (set, get) => ({
      sessions: [newSession("Welcome")],
      activeSessionId: null,

      createSession: (title) => {
        const session = newSession(title);
        set((state) => ({
          sessions: [...state.sessions, session],
          activeSessionId: session.id,
        }));
        return session.id;
      },

      setActiveSession: (activeSessionId) => set({ activeSessionId }),

      addMessage: (sessionId, message) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      ...message,
                      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                      timestamp: Date.now(),
                    },
                  ],
                  updatedAt: Date.now(),
                }
              : s,
          ),
        })),

      getSession: (id) => get().sessions.find((s) => s.id === id),

      getActiveSession: () => {
        const id = get().activeSessionId;
        return id ? get().sessions.find((s) => s.id === id) : undefined;
      },

      clearSession: (id) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, messages: [] } : s)),
        })),

      deleteSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        })),

      renameSession: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
        })),
    }),
    {
      name: "moudir-chat-sessions",
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" }), {
        replacer: (key, value) => bigIntJsonReplacer(key, sanitizeJsonValue(value)),
      }),
    },
  ),
);
