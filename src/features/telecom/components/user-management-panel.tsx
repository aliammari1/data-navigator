"use client";

import { Crown, Plus, Shield, Trash2, User as UserIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createUser,
  ensureBootstrapUser,
  getCurrentUser,
  listUsers,
  removeUser,
  setCurrentUser,
  type TelecomUser,
  updateUser,
} from "@/features/telecom/lib/users";

export function UserManagementPanel({
  currentRole,
  onRoleChange,
}: {
  currentRole: "admin" | "user";
  onRoleChange: (role: "admin" | "user") => void;
}) {
  const [users, setUsers] = useState<TelecomUser[]>([]);
  const [me, setMe] = useState<TelecomUser | null>(null);
  const [draft, setDraft] = useState({
    username: "",
    fullName: "",
    role: "user" as "admin" | "user",
  });
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    ensureBootstrapUser();
    setUsers(listUsers());
    setMe(getCurrentUser());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const isAdmin = currentRole === "admin";

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (!draft.username.trim()) throw new Error("Nom requis");
      createUser({
        username: draft.username.trim(),
        fullName: draft.fullName.trim() || draft.username.trim(),
        role: draft.role,
      });
      setDraft({ username: "", fullName: "", role: "user" });
      reload();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold">Gestion des Utilisateurs</span>
        <span className="text-[10px] text-muted-foreground ml-2">
          {users.length} compte(s)
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onRoleChange("admin")}
            className={`h-6 px-2 rounded text-[10px] font-medium border ${
              currentRole === "admin"
                ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
                : "border-border text-muted-foreground"
            }`}
          >
            <Crown className="w-3 h-3 inline mr-0.5" /> Admin
          </button>
          <button
            type="button"
            onClick={() => onRoleChange("user")}
            className={`h-6 px-2 rounded text-[10px] font-medium border ${
              currentRole === "user"
                ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                : "border-border text-muted-foreground"
            }`}
          >
            <UserIcon className="w-3 h-3 inline mr-0.5" /> User
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/25">
          Mode utilisateur simple : création de comptes désactivée. Passez en
          mode Admin pour gérer les comptes.
        </div>
      )}

      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="p-3 border-b border-border bg-muted/30 grid grid-cols-1 md:grid-cols-4 gap-2"
        >
          <input
            type="text"
            placeholder="username"
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            className="h-8 px-2 rounded-md border border-border bg-background text-xs"
          />
          <input
            type="text"
            placeholder="Nom complet"
            value={draft.fullName}
            onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
            className="h-8 px-2 rounded-md border border-border bg-background text-xs"
          />
          <select
            value={draft.role}
            onChange={(e) =>
              setDraft({ ...draft, role: e.target.value as "admin" | "user" })
            }
            className="h-8 px-2 rounded-md border border-border bg-background text-xs"
          >
            <option value="user">Utilisateur Simple</option>
            <option value="admin">Administrateur</option>
          </select>
          <button
            type="submit"
            className="h-8 px-3 rounded-md text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Créer
          </button>
          {error && (
            <div className="md:col-span-4 text-[10px] text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </form>
      )}

      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr className="border-b border-border">
            {["Utilisateur", "Rôle", "Créé", "Dernier login", "Statut", ""].map(
              (h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              className="border-b border-border last:border-0 hover:bg-muted/40"
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {u.role === "admin" ? (
                    <Crown className="w-3 h-3 text-rose-500" />
                  ) : (
                    <UserIcon className="w-3 h-3 text-blue-500" />
                  )}
                  <div>
                    <div className="text-foreground font-medium">
                      {u.fullName}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      @{u.username}
                    </div>
                  </div>
                  {me?.id === u.id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      vous
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2">
                {isAdmin ? (
                  <select
                    value={u.role}
                    onChange={(e) => {
                      updateUser(u.id, {
                        role: e.target.value as "admin" | "user",
                      });
                      reload();
                    }}
                    className="h-6 px-1 rounded border border-border bg-background text-[10px]"
                  >
                    <option value="user">Simple</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {u.role}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-[10px] text-muted-foreground">
                {new Date(u.createdAt).toLocaleDateString("fr-FR")}
              </td>
              <td className="px-3 py-2 text-[10px] text-muted-foreground">
                {u.lastLoginAt
                  ? new Date(u.lastLoginAt).toLocaleString("fr-FR")
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    u.active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {u.active ? "actif" : "inactif"}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                {isAdmin && (
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentUser(u.id);
                        reload();
                      }}
                      className="h-6 px-1.5 rounded text-[10px] border border-border hover:bg-muted"
                    >
                      Activer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Supprimer ${u.username} ?`)) {
                          removeUser(u.id);
                          reload();
                        }
                      }}
                      className="h-6 w-6 rounded border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
