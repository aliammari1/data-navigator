"use client";
import { Settings2, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type * as Types from "@/features/telecom/types";

export function ColumnMapper({
  mapping,
  columns,
  onChange,
  onClose,
  defaultMapping,
}: {
  mapping: Types.ColumnMapping;
  columns: string[];
  onChange: (m: Types.ColumnMapping) => void;
  onClose: () => void;
  defaultMapping: Types.ColumnMapping;
}) {
  const [local, setLocal] = useState<Types.ColumnMapping>({ ...mapping });
  const set = (k: keyof Types.ColumnMapping, v: string) => setLocal((p) => ({ ...p, [k]: v }));

  const fields: Array<{
    key: keyof Types.ColumnMapping;
    label: string;
    required?: boolean;
  }> = [
    { key: "transactionId", label: "ID Transaction", required: true },
    { key: "transactionDate", label: "Date Transaction", required: true },
    { key: "transactionTime", label: "Heure Transaction" },
    { key: "canal", label: "Canal", required: true },
    { key: "serviceCode", label: "Code Service", required: true },
    { key: "serviceName", label: "Nom du Service" },
    { key: "transactionType", label: "Type de Transaction", required: true },
    { key: "subscriberType", label: "Type d'Abonné" },
    { key: "msisdn", label: "MSISDN / Téléphone" },
    { key: "amount", label: "Montant", required: true },
    { key: "status", label: "Statut", required: true },
    { key: "errorCode", label: "Code d'Erreur" },
    { key: "errorMessage", label: "Message d'Erreur" },
    { key: "operator", label: "Opérateur" },
    { key: "region", label: "Région / Zone" },
    { key: "processingTimeMs", label: "Temps de Traitement (ms)" },
    { key: "previousBalance", label: "Solde Précédent" },
    { key: "newBalance", label: "Nouveau Solde" },
    { key: "totalAmount", label: "Montant Total" },
    { key: "retryCount", label: "Nombre de Tentatives" },
  ];
  const missingRequired = fields.filter((field) => field.required && !local[field.key]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-foreground">Mappage des Colonnes</span>
            <span className="text-[11px] text-muted-foreground">
              {columns.length} colonnes détectées
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 grid grid-cols-2 gap-3">
          {fields.map(({ key, label, required }) => (
            <div key={key}>
              <label
                htmlFor={`col-${key}`}
                className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1 block"
              >
                {label}
                {required && <span className="text-red-600 dark:text-red-400 ml-0.5">*</span>}
              </label>
              <select
                id={`col-${key}`}
                value={local[key]}
                onChange={(e) => set(key, e.target.value)}
                className="w-full bg-muted border border-border text-xs text-muted-foreground rounded-lg px-2.5 py-2 outline-none font-mono hover:border-border transition-colors"
              >
                <option value="">— non mappé —</option>
                {[...new Set(columns)].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={() => setLocal({ ...defaultMapping })}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-muted-foreground bg-muted rounded-xl hover:bg-accent transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={missingRequired.length > 0}
              title={
                missingRequired.length > 0
                  ? `Champs obligatoires manquants: ${missingRequired
                      .map((field) => field.label)
                      .join(", ")}`
                  : "Appliquer le mapping"
              }
              onClick={() => {
                if (missingRequired.length > 0) return;
                onChange(local);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Appliquer le Mapping
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
