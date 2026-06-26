import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type {
  ColType,
  ColumnDef,
  ColumnStats,
  SortConfig,
} from "@/features/data-browser/model/types";
import {
  ColumnHeader,
  ColumnStatPanel,
  ColumnTypeChip,
  DBStatusBadge,
  LoadingOverlay,
  MiniSparkline,
} from "@/features/data-browser/components/table-widgets";

const columnDef: ColumnDef = {
  id: "revenue",
  name: "revenue",
  type: "number",
  width: 180,
  visible: true,
  pinned: null,
  sortable: true,
  filterable: true,
  dbType: "DOUBLE",
};

const sorts: SortConfig[] = [
  {
    column: "revenue",
    direction: "desc",
    priority: 1,
  },
];

const stats: ColumnStats = {
  loading: false,
  min: 120,
  max: 9800,
  avg: 1842.56,
  nullCount: 12,
  distinctCount: 420,
  histogram: [
    { bucket: "0-1k", count: 24 },
    { bucket: "1k-2k", count: 42 },
    { bucket: "2k-3k", count: 31 },
    { bucket: "3k-4k", count: 18 },
    { bucket: "4k+", count: 9 },
  ],
};

const columnTypes: ColType[] = ["string", "number", "date", "boolean", "email", "url"];

const meta = {
  title: "Src/Features/DataBrowser/Components/TableWidgets",
  component: ColumnHeader,
  tags: ["autodocs"],
  args: {
    col: columnDef,
    sorts,
    activeColStats: null,
    onSort: fn(),
    onStats: fn(),
    onResize: fn(),
    onPin: fn(),
    onHide: fn(),
    pinned: false,
  },
  argTypes: {
    col: {
      control: "object",
    },
    sorts: {
      control: "object",
    },
    activeColStats: {
      control: "text",
    },
    onSort: {
      control: false,
    },
    onStats: {
      control: false,
    },
    onResize: {
      control: false,
    },
    onPin: {
      control: false,
    },
    onHide: {
      control: false,
    },
    pinned: {
      control: "boolean",
    },
  },
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[560px] rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ColumnHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HeaderDefault: Story = {};

export const HeaderSortedAsc: Story = {
  args: {
    sorts: [
      {
        column: "revenue",
        direction: "asc",
        priority: 1,
      },
    ],
  },
};

export const HeaderMultiSort: Story = {
  args: {
    sorts: [
      {
        column: "revenue",
        direction: "desc",
        priority: 1,
      },
      {
        column: "region",
        direction: "asc",
        priority: 2,
      },
    ],
  },
};

export const HeaderWithStatsActive: Story = {
  args: {
    activeColStats: "revenue",
  },
};

export const HeaderPinnedLeft: Story = {
  args: {
    pinned: true,
    col: {
      ...columnDef,
      pinned: "left",
    },
  },
};

export const HeaderPinnedRight: Story = {
  args: {
    pinned: true,
    col: {
      ...columnDef,
      pinned: "right",
    },
  },
};

export const LoadingState: Story = {
  render: () => (
    <div className="relative h-48 rounded-lg border border-zinc-800 bg-zinc-950">
      <LoadingOverlay message="Profiling columns..." />
    </div>
  ),
};

export const DBReady: Story = {
  render: () => <DBStatusBadge initialized />,
};

export const DBInitializing: Story = {
  render: () => <DBStatusBadge initialized={false} />,
};

export const TypeChips: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {columnTypes.map((type) => (
        <ColumnTypeChip key={type} type={type} />
      ))}
    </div>
  ),
};

export const Sparkline: Story = {
  render: () => <MiniSparkline data={[12, 18, 14, 24, 31, 28, 42, 39, 51, 63]} />,
};

export const StatsPanel: Story = {
  render: () => (
    <div className="w-[320px] rounded-xl border border-zinc-800 bg-zinc-950">
      <ColumnStatPanel stats={stats} colDef={columnDef} />
    </div>
  ),
};

export const StatsPanelForStringColumn: Story = {
  render: () => (
    <div className="w-[320px] rounded-xl border border-zinc-800 bg-zinc-950">
      <ColumnStatPanel
        stats={{
          loading: false,
          min: "Aachen",
          max: "Zurich",
          avg: null,
          nullCount: 4,
          distinctCount: 82,
          histogram: [
            { bucket: "A-D", count: 12 },
            { bucket: "E-H", count: 18 },
            { bucket: "I-L", count: 9 },
            { bucket: "M-P", count: 21 },
            { bucket: "Q-Z", count: 14 },
          ],
        }}
        colDef={{
          ...columnDef,
          id: "city",
          name: "city",
          type: "string",
          dbType: "VARCHAR",
        }}
      />
    </div>
  ),
};

export const StatsPanelLoading: Story = {
  render: () => (
    <div className="w-[320px] rounded-xl border border-zinc-800 bg-zinc-950">
      <ColumnStatPanel
        stats={{
          ...stats,
          loading: true,
          histogram: [],
        }}
        colDef={columnDef}
      />
    </div>
  ),
};
