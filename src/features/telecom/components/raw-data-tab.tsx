"use client";

import { memo, useMemo, useState } from "react";
import type * as Types from "@/features/telecom/types";
import { CustomerProfilePanel } from "./customer-profile-panel";
import { DataGrid } from "./data-grid";
import { FilterBar } from "./filter-bar";

export const RawDataTab = memo(function RawDataTab({
  m,
  operators,
  regions,
  statusMapping,
  tableName: _tableName,
  fetchFiltered,
  fetchFilteredCount,
  fetchFilteredPage,
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
  fetchFilteredCount?: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
  ) => Promise<number>;
  fetchFilteredPage?: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
    limit: number,
    offset: number,
    sortCol: string,
    sortDir: Types.SortDir,
  ) => Promise<Types.RawRow[]>;
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

  const operatorOptions = useMemo(
    () => [...new Set(operators.map((o) => o.operator))],
    [operators],
  );
  const regionOptions = useMemo(() => [...new Set(regions.map((r) => r.region))], [regions]);

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        onChange={setFilters}
        operators={operatorOptions}
        regions={regionOptions}
      />
      <DataGrid
        m={m}
        filters={filters}
        statusMapping={statusMapping}
        onMsisdnClick={(ms) => setSelectedMsisdn(ms)}
        fetchFiltered={fetchFiltered}
        fetchFilteredCount={fetchFilteredCount}
        fetchFilteredPage={fetchFilteredPage}
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
});
