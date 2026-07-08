/// <reference lib="webworker" />

/**
 * Profiling Web Worker.
 *
 * Moves the profile orchestration *post-processing* off the renderer main
 * thread so a profile run never blocks paint:
 * - `buildProfiles`: SUMMARIZE rows -> `ColProfile[]` + quality dimensions.
 * - `filterSort`: the search / type / quality / sort pipeline, called on every
 *   (deferred) keystroke without touching the main thread.
 * - `parseDetail`: lazy per-column detail parsing incl. the MAD-based / regex
 *   validity score from `simple-statistics`.
 *
 * Mirrors the Comlink worker conventions in
 * `@/features/csv-parser/workers/csv.worker` and `src/workers/*`.
 */

import * as Comlink from "comlink";
import {
  buildQualityDimensions,
  type DetailQueryResult,
  filterSortProfiles,
  parseColumnDetail,
  profilesFromSummary,
  type ProfileQuery,
  type SummarizeRow,
} from "../model/summary-map";
import type { ColProfile, ColumnDetail, QualityDimension } from "../model/types";

export interface BuildProfilesResult {
  profiles: ColProfile[];
  dimensions: QualityDimension[];
}

export interface ProfileWorkerApi {
  buildProfiles(rows: SummarizeRow[]): BuildProfilesResult;
  filterSort(profiles: ColProfile[], query: ProfileQuery): ColProfile[];
  parseDetail(result: DetailQueryResult): ColumnDetail;
}

const api: ProfileWorkerApi = {
  buildProfiles(rows) {
    const profiles = profilesFromSummary(rows);
    return { profiles, dimensions: buildQualityDimensions(profiles) };
  },
  filterSort(profiles, query) {
    return filterSortProfiles(profiles, query);
  },
  parseDetail(result) {
    return parseColumnDetail(result);
  },
};

Comlink.expose(api);
