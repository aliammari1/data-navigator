import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import {
  type DashboardCardItem,
  DraggableAutoGrid,
} from "./draggable-auto-grid";

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-bold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{body}</div>
    </div>
  );
}

const items: DashboardCardItem[] = [
  { id: "kpis", size: "full", node: <Card title="KPIs globaux" body="24 812 transactions · 94,7 % de réussite" /> },
  { id: "canal-share", size: "md", node: <Card title="Répartition par canal" body="Part de chaque canal sur la période" /> },
  { id: "daily-trend", size: "md", node: <Card title="Tendance journalière" body="Volume et taux sur 14 jours" /> },
  { id: "hourly", size: "lg", node: <Card title="Profil horaire" body="Distribution du trafic par heure" /> },
  { id: "status", size: "sm", node: <Card title="Statuts" body="Succès / échecs / remboursements" /> },
];

const meta = {
  title: "Src/Features/Telecom/Components/DraggableAutoGrid",
  component: DraggableAutoGrid,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    items,
    onChange: fn(),
  },
  argTypes: {
    items: { control: false },
    onChange: { control: false },
  },
} satisfies Meta<typeof DraggableAutoGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("KPIs globaux")).toBeInTheDocument();
    // Each card exposes a drag handle button.
    await expect(canvas.getAllByRole("button").length).toBe(items.length);
  },
};

export const TwoCards: Story = {
  args: {
    items: items.slice(0, 2),
  },
};

export const SingleCard: Story = {
  args: {
    items: [items[0]],
  },
};
