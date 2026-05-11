"use client";

import { useEffect, useRef, useState } from "react";
import { RawDataTab } from "@/features/telecom/components/raw-data-tab";
import { useTelecomUI } from "@/features/telecom/hooks/use-telecom-ui";
import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import {
  fetchCustomerProfile as _fetchCustomerProfile,
  fetchFiltered as _fetchFiltered,
  fetchOperators as _fetchOperators,
  fetchRegions as _fetchRegions,
} from "@/features/telecom/lib/queries";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

let TABLE_NAME = TELECOM_TABLE_BASE;

const fetchFiltered = (
  m: Types.ColumnMapping,
  f: Types.FilterState,
  sm: Types.StatusMapping[],
  limit: number,
  offset: number,
  sortCol: string,
  sortDir: Types.SortDir,
) => _fetchFiltered(TABLE_NAME, m, f, sm, limit, offset, sortCol, sortDir);

const fetchCustomerProfile = (m: Types.ColumnMapping, msisdn: string) =>
  _fetchCustomerProfile(TABLE_NAME, m, msisdn);

export default function Page() {
  const fileNameRef = useRef("");
  const [operators, setOperators] = useState<Types.OperatorRow[]>([]);
  const [regions, setRegions] = useState<Types.RegionRow[]>([]);

  const { mapping, statusMapping } = useTelecomUI({
    defaultMapping: DEFAULT_MAPPING,
    fileNameRef,
  });

  useEffect(() => {
    _fetchOperators(TABLE_NAME, mapping, statusMapping).then(setOperators).catch(() => {});
    _fetchRegions(TABLE_NAME, mapping, statusMapping).then(setRegions).catch(() => {});
  }, [mapping, statusMapping]);

  return (
    <RawDataTab
      m={mapping}
      operators={operators}
      regions={regions}
      statusMapping={statusMapping}
      tableName={TABLE_NAME}
      fetchFiltered={fetchFiltered}
      fetchCustomerProfile={fetchCustomerProfile}
    />
  );
}
