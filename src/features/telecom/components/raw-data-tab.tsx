"use client";

import { useState } from "react";
import type * as Types from "@/features/telecom/types";
import { CustomerProfilePanel } from "./customer-profile-panel";
import { DataGrid } from "./data-grid";
import { FilterBar } from "./filter-bar";

export function RawDataTab({
  m,
  operators,
  regions,
  statusMapping,
  tableName,
  fetchFiltered,
  fetchCustomerProfile,
}: {
  m: Types.ColumnMapping;
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  statusMapping: Types.StatusMapping[];
  tableName: string;
  fetchFiltered: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
    limit: number,
    offset: number,
    sortCol: string,
    sortDir: Types.SortDir,
  ) => Promise<{ rows: Types.RawRow[]; total: number }>;
  fetchCustomerProfile: (
    m: Types.ColumnMapping,
    msisdn: string,
  ) => Promise<Types.CustomerProfileData | null>;
}) {
  const [filters, setFilters] = useState<Types.FilterState>({
    status: "",
    canal: "",
    region: "",
    operator: "",
    search: "",
    minAmount: "",
    maxAmount: "",
    hourFrom: "",
    hourTo: "",
  });
  const [selectedMsisdn, setSelectedMsisdn] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        onChange={setFilters}
        operators={[...new Set(operators.map((o) => o.operator))]}
        regions={[...new Set(regions.map((r) => r.region))]}
      />
      <DataGrid
        m={m}
        filters={filters}
        statusMapping={statusMapping}
        onMsisdnClick={(ms) => setSelectedMsisdn(ms)}
        fetchFiltered={fetchFiltered}
      />
      {selectedMsisdn && (
        <CustomerProfilePanel
          msisdn={selectedMsisdn}
          m={m}
          onClose={() => setSelectedMsisdn(null)}
          fetchCustomerProfile={fetchCustomerProfile}
        />
      )}
    </div>
  );
}
