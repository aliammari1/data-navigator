"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppCommands, useRegisterPages } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { fmtAmount, fmtCompact, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { ExportButton } from "../components/ExportButton";
import { InsightsPanel } from "../components/InsightsPanel";
import { RegionList } from "../components/RegionList";
import { type GeoFlow, useGeoData } from "../hooks/use-geo-data";
import { useGeoInsights } from "../hooks/use-geo-insights";
import { channelColor, successRateToColor } from "../lib/colors";
import { exportGeoReport, type GeoExportFormat, type GeoExportInput } from "../lib/geo-export";

const GEO_PAGES = [
  { id: "map", label: "Carte des régions" },
  { id: "flows", label: "Flux par canal" },
  { id: "distribution", label: "Distribution des canaux" },
] as const;

// ─── Browser-only chart/map components ────────────────────────────────────────

const GeoMap = dynamic(() => import("../components/GeoMap").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

const HeatmapChart = dynamic(
  () => import("../components/DistributionCharts").then((m) => m.HeatmapChart),
  { ssr: false },
);
const RegionPie = dynamic(
  () => import("../components/DistributionCharts").then((m) => m.RegionPie),
  { ssr: false },
);

// ─── Shared empty / error states ──────────────────────────────────────────────

function NoDatasetState() {
  return (
    <Card>
      <CardContent className="pt-8 pb-8">
        <div className="mx-auto max-w-md text-center text-sm text-muted-foreground">
          <div className="mb-2 text-4xl">🗺️</div>
          <div className="mb-1 font-medium text-foreground">No region data available</div>
          <p>
            Import a dataset with a region column (the telecom region mapping defaults to{" "}
            <code>ACCOUNT_GROUP_ID</code>) to populate the map, channel heatmap, and flows. Every
            figure here is computed directly from the active dataset in DuckDB.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

// ── Tab 1: Region map ─────────────────────────────────────────────────────────

function RegionMapTab({
  geo,
  insights,
}: {
  geo: ReturnType<typeof useGeoData>;
  insights: ReturnType<typeof useGeoInsights>;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const selectedRegion = useMemo(
    () => geo.regions.find((r) => r.name === selected) ?? null,
    [geo.regions, selected],
  );

  if (!geo.ready && !geo.loading) return <NoDatasetState />;
  if (geo.loading) return <LoadingState label="Aggregating regions…" />;

  const unmapped = geo.regions.length - geo.mappedRegions.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="text-xs text-muted-foreground">Regions</div>
            <div className="text-2xl font-bold">{geo.regions.length}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="text-xs text-muted-foreground">Transactions</div>
            <div className="text-2xl font-bold">{fmtCompact(geo.totalTransactions)}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="text-xs text-muted-foreground">Revenue</div>
            <div className="text-2xl font-bold">{fmtCompact(geo.totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="text-xs text-muted-foreground">Avg Success</div>
            <div className="text-2xl font-bold">{fmtPct(geo.avgSuccessRate)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <Card>
            <CardContent className="relative overflow-hidden rounded-xl p-0">
              {geo.mappedRegions.length > 0 ? (
                <GeoMap
                  regions={geo.mappedRegions}
                  selectedRegion={selected}
                  onSelect={setSelected}
                  height={500}
                />
              ) : (
                <div className="flex h-[500px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  None of the {geo.regions.length} regions matched a known governorate, so they
                  cannot be placed on the map. They remain listed on the right and in the channel
                  heatmap.
                </div>
              )}

              <div className="absolute bottom-8 right-4 z-[1000] space-y-2 rounded-lg border border-border bg-background/90 p-3 text-xs shadow-md">
                <div className="mb-1 font-semibold text-foreground">Legend</div>
                <div className="space-y-1">
                  <div className="font-medium text-muted-foreground">Circle size = volume</div>
                  <div className="flex items-center gap-1">
                    <div className="rounded-full bg-gray-400" style={{ width: 6, height: 6 }} />
                    <span>Low</span>
                    <div
                      className="ml-2 rounded-full bg-gray-400"
                      style={{ width: 12, height: 12 }}
                    />
                    <span>High</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="font-medium text-muted-foreground">Color = success rate</div>
                  <div className="flex items-center gap-1">
                    <div
                      className="rounded-full"
                      style={{ width: 10, height: 10, background: "hsl(0,70%,50%)" }}
                    />
                    <span>Low</span>
                    <div
                      className="ml-2 rounded-full"
                      style={{
                        width: 10,
                        height: 10,
                        background: "hsl(120,70%,50%)",
                      }}
                    />
                    <span>High</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {unmapped > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {unmapped} region{unmapped !== 1 ? "s" : ""} could not be matched to a known
              governorate and {unmapped !== 1 ? "are" : "is"} shown in the list only.
            </p>
          )}
        </div>

        <div className="w-72 shrink-0 space-y-3">
          {selectedRegion ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{selectedRegion.name}</span>
                  <button
                    type="button"
                    className="text-lg leading-none text-muted-foreground hover:text-foreground"
                    onClick={() => setSelected(null)}
                  >
                    ×
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Transactions</div>
                    <div className="text-xl font-bold">{fmtN(selectedRegion.transactions)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Revenue</div>
                    <div className="text-xl font-bold">{fmtAmount(selectedRegion.revenue)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Success Rate</div>
                    <div
                      className="text-xl font-bold"
                      style={{ color: successRateToColor(selectedRegion.successRate) }}
                    >
                      {fmtPct(selectedRegion.successRate)}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Performance</div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, selectedRegion.successRate)}%`,
                          background: successRateToColor(selectedRegion.successRate),
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Rank</div>
                    <div className="text-sm font-medium">#{selectedRegion.rank} by volume</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Regions</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <RegionList
                  regions={geo.regions}
                  selectedRegion={selected}
                  onSelect={setSelected}
                  height={420}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <InsightsPanel insights={insights} canGenerate={geo.regions.length > 0} />
    </div>
  );
}

// ── Tab 2: Channel -> region flows ────────────────────────────────────────────

type FlowSort = "volume" | "success";

function FlowsTab({ geo }: { geo: ReturnType<typeof useGeoData> }) {
  const [sort, setSort] = useState<FlowSort>("volume");
  const [channel, setChannel] = useState<string | null>(null);

  const channels = useMemo(() => {
    const set = new Set<string>();
    for (const f of geo.flows) set.add(f.channel);
    return [...set].sort();
  }, [geo.flows]);

  const filtered = useMemo(() => {
    let rows: GeoFlow[] = channel ? geo.flows.filter((f) => f.channel === channel) : geo.flows;
    rows = [...rows].sort((a, b) =>
      sort === "volume" ? b.transactions - a.transactions : b.successRate - a.successRate,
    );
    return rows.slice(0, 60);
  }, [geo.flows, channel, sort]);

  const maxVolume = useMemo(
    () => filtered.reduce((m, f) => Math.max(m, f.transactions), 0),
    [filtered],
  );

  if (!geo.ready && !geo.loading) return <NoDatasetState />;
  if (geo.loading) return <LoadingState label="Computing channel flows…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Channel:</span>
          <Button
            size="sm"
            variant={channel === null ? "default" : "outline"}
            onClick={() => setChannel(null)}
          >
            All
          </Button>
          {channels.slice(0, 6).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={channel === c ? "default" : "outline"}
              onClick={() => setChannel(c)}
            >
              {c}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort:</span>
          <Button
            size="sm"
            variant={sort === "volume" ? "default" : "outline"}
            onClick={() => setSort("volume")}
          >
            By Volume
          </Button>
          <Button
            size="sm"
            variant={sort === "success" ? "default" : "outline"}
            onClick={() => setSort("success")}
          >
            By Success
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channel → Region Flows</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No flows for this selection.
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((flow) => (
                <div
                  key={`${flow.channel}__${flow.region}`}
                  className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,2fr)_72px] items-center gap-3 text-xs"
                >
                  <span className="truncate font-medium">{flow.channel}</span>
                  <span className="truncate text-muted-foreground">{flow.region}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxVolume > 0 ? (flow.transactions / maxVolume) * 100 : 0}%`,
                        background: successRateToColor(flow.successRate),
                      }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {fmtN(flow.transactions)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab 3: Channel distribution ───────────────────────────────────────────────

function DistributionTab({ geo }: { geo: ReturnType<typeof useGeoData> }) {
  const [selectedRegionIdx, setSelectedRegionIdx] = useState<number | null>(null);

  if (!geo.ready && !geo.loading) return <NoDatasetState />;
  if (geo.loading) return <LoadingState label="Building distribution…" />;
  if (geo.matrix.regions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-8 pb-8 text-center text-sm text-muted-foreground">
          Not enough channel/region detail in this dataset to build a distribution heatmap.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {geo.channelSpread.slice(0, 3).map((ch, i) => (
          <Card key={ch.channel} size="sm">
            <CardContent className="pt-3">
              <div className="text-xs text-muted-foreground">
                {i === 0 ? "Widest Spread" : i === 1 ? "2nd Widest" : "3rd Widest"}
              </div>
              <div className="truncate text-base font-bold">{ch.channel}</div>
              <div className="text-xs text-muted-foreground">
                Strong in {ch.regionCount} region
                {ch.regionCount !== 1 ? "s" : ""}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <Card>
            <CardHeader>
              <CardTitle>Channel Distribution by Region (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <HeatmapChart
                matrix={geo.matrix}
                onSelectRegion={setSelectedRegionIdx}
                height={420}
              />
            </CardContent>
          </Card>
        </div>

        <div className="w-72 shrink-0 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Dominant Channel per Region</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {geo.dominantChannels.map((dom, ri) => (
                  <button
                    key={dom.region}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted"
                    onClick={() => setSelectedRegionIdx(ri)}
                  >
                    <span className="truncate font-medium">{dom.region}</span>
                    <span
                      className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs text-white"
                      style={{ background: channelColor(dom.channelIndex) }}
                    >
                      {dom.pct.toFixed(0)}%
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedRegionIdx !== null && selectedRegionIdx < geo.matrix.regions.length && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{geo.matrix.regions[selectedRegionIdx]}</span>
                  <button
                    type="button"
                    className="text-lg leading-none text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedRegionIdx(null)}
                  >
                    ×
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RegionPie matrix={geo.matrix} regionIndex={selectedRegionIdx} height={220} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GeoAnalysisScreen() {
  const geo = useGeoData();
  const insights = useGeoInsights(geo);
  const windowId = useWindowId();
  const [tab, setTab] = useState<string>("map");

  // Built lazily on export so aggregates are never serialised until requested.
  const getExportInput = useCallback(
    (): GeoExportInput => ({
      datasetName: geo.datasetName,
      regions: geo.regions,
      totalTransactions: geo.totalTransactions,
      totalRevenue: geo.totalRevenue,
      avgSuccessRate: geo.avgSuccessRate,
      matrix: geo.matrix,
      dominantChannels: geo.dominantChannels,
      insight: insights.insight,
    }),
    [geo, insights.insight],
  );

  // Surface the three tabs in the desktop View menu and reflect the active one.
  useRegisterPages(windowId, [...GEO_PAGES], tab);

  // Handle menu commands dispatched from the desktop menu bar.
  useAppCommands("geo", {
    navigate: (payload) => {
      const pageId = (payload as { pageId?: string } | undefined)?.pageId;
      if (pageId) setTab(pageId);
    },
    export: (payload) => {
      if (!geo.ready) return;
      const format = (payload as { format?: GeoExportFormat } | undefined)?.format ?? "pdf";
      void exportGeoReport(getExportInput(), format).catch(() => {});
    },
    insights: () => {
      void insights.generate();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Geographic &amp; Network Analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Regional transaction distribution, channel → region flows, and channel mix — all
            computed from the active dataset in DuckDB, fully offline.
          </p>
        </div>
        <ExportButton getInput={getExportInput} disabled={!geo.ready} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="map">Region Map</TabsTrigger>
          <TabsTrigger value="flows">Channel Flows</TabsTrigger>
          <TabsTrigger value="distribution">Channel Distribution</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="mt-4">
          <RegionMapTab geo={geo} insights={insights} />
        </TabsContent>

        <TabsContent value="flows" className="mt-4">
          <FlowsTab geo={geo} />
        </TabsContent>

        <TabsContent value="distribution" className="mt-4">
          <DistributionTab geo={geo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
