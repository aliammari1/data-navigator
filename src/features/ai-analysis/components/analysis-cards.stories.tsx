import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AnalysisCards } from "./analysis-cards";
import { AlertTriangle, CheckCircle2, GitBranch, Layers, } from "lucide-react";

const meta = {
  title: "Src/Features/AiAnalysis/Components/AnalysisCards",
  component: AnalysisCards,
  tags: ["autodocs"],
} satisfies Meta<typeof AnalysisCards>;

export default meta;

type Story = StoryObj<typeof meta>;

const mockStats = [
  {
    label: "Total Anomalies",
    value: 12,
    sub: "3 critical",
    icon: AlertTriangle,
    color: "bg-red-500",
    trend: -15.2,
  },
  {
    label: "Insights Generated",
    value: 48,
    sub: "8 new today",
    icon: CheckCircle2,
    color: "bg-green-500",
    trend: 8.4,
  },
  {
    label: "Correlations Found",
    value: 6,
    sub: "2 strong",
    icon: GitBranch,
    color: "bg-purple-500",
    trend: 12.1,
  },
  {
    label: "Patterns Detected",
    value: 15,
    sub: "3 recurring",
    icon: Layers,
    color: "bg-yellow-500",
    trend: -5.3,
  },
];

const mockInsights = [
  {
    id: "1",
    category: "anomaly" as const,
    title: "Revenue Drop Detected",
    description: "Unexpected 23% revenue decrease in Q3 compared to forecast. Check regional sales data for root cause.",
    severity: "critical" as const,
    confidence: 0.92,
    impact: "high" as const,
    metric: "revenue",
    value: "$2.3M",
    change: -23,
    acknowledged: false,
  },
  {
    id: "2",
    category: "trend" as const,
    title: "User Engagement Upward Trend",
    description: "Daily active users have increased 15% over the last 30 days, driven by new feature adoption.",
    severity: "success" as const,
    confidence: 0.87,
    impact: "medium" as const,
    metric: "dau",
    value: "12.5K",
    change: 15,
    acknowledged: false,
  },
  {
    id: "3",
    category: "correlation" as const,
    title: "Marketing Spend vs Revenue",
    description: "Strong positive correlation (r=0.84) between marketing spend and revenue in EMEA region.",
    severity: "info" as const,
    confidence: 0.84,
    impact: "medium" as const,
    metric: "correlation",
    value: "r=0.84",
    acknowledged: true,
  },
  {
    id: "4",
    category: "pattern" as const,
    title: "Seasonal Purchase Pattern",
    description: "Recurring purchase spikes detected every Friday afternoon, suggesting weekend preparation behavior.",
    severity: "warning" as const,
    confidence: 0.78,
    impact: "low" as const,
    metric: "purchases",
    value: "+34%",
    acknowledged: false,
  },
  {
    id: "5",
    category: "forecast" as const,
    title: "Q4 Revenue Forecast",
    description: "Predicted 18% revenue growth in Q4 based on current pipeline and historical patterns.",
    severity: "success" as const,
    confidence: 0.75,
    impact: "high" as const,
    metric: "forecast",
    value: "$4.2M",
    change: 18,
    acknowledged: false,
  },
];

export const Default: Story = {
  args: {
    stats: mockStats,
    insights: mockInsights,
    onAcknowledge: (id: string) => console.log("Acknowledged:", id),
  },
};

export const Empty: Story = {
  args: {
    stats: [],
    insights: [],
    onAcknowledge: (id: string) => console.log("Acknowledged:", id),
  },
};

export const StatsOnly: Story = {
  args: {
    stats: mockStats,
    insights: [],
    onAcknowledge: (id: string) => console.log("Acknowledged:", id),
  },
};

export const InsightsOnly: Story = {
  args: {
    stats: [],
    insights: mockInsights,
    onAcknowledge: (id: string) => console.log("Acknowledged:", id),
  },
};

export const AllAcknowledged: Story = {
  args: {
    stats: mockStats,
    insights: mockInsights.map(i => ({ ...i, acknowledged: true })),
    onAcknowledge: (id: string) => console.log("Acknowledged:", id),
  },
};
