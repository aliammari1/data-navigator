import type { Meta, StoryObj } from "@storybook/nextjs";
import { Database } from "lucide-react";

import { figmaDesign, figmaLinks } from "../../../.storybook/figma-links";
import { Button } from "./button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

const meta = {
  title: "UI/Empty",
  component: Empty,
  parameters: {
    layout: "padded",
    design: figmaDesign(figmaLinks.empty),
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoDatasets: Story = {
  render: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Database />
        </EmptyMedia>
        <EmptyTitle>No datasets loaded</EmptyTitle>
        <EmptyDescription>
          Import a CSV or Excel workbook to start profiling columns and building
          dashboards.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Import dataset</Button>
      </EmptyContent>
    </Empty>
  ),
};
