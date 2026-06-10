import type { Meta, StoryObj } from "@storybook/nextjs";
import { Database, FileSearch, WandSparkles } from "lucide-react";
import { fn } from "storybook/test";

import { AtlasStepper, type Step } from "./step-stepper";

const demoSteps: Step[] = [
  {
    id: "upload",
    label: "Upload file",
    hint: "CSV, XLSX, or JSON",
    status: "done",
    icon: <Database />,
    durationMs: 420,
  },
  {
    id: "inspect",
    label: "Inspect schema",
    hint: "Detect columns and types",
    status: "running",
    icon: <FileSearch />,
  },
  {
    id: "clean",
    label: "Clean data",
    hint: "Normalize missing values",
    status: "idle",
    icon: <WandSparkles />,
  },
  {
    id: "export",
    label: "Export results",
    hint: "Generate final dataset",
    status: "idle",
  },
];

const meta = {
  title: "Src/Design/Blocks/StepStepper",
  component: AtlasStepper,
  tags: ["autodocs"],
  args: {
    steps: demoSteps,
    activeId: "inspect",
    onSelect: fn(),
  },
  argTypes: {
    steps: {
      control: "object",
    },
    activeId: {
      control: "text",
    },
    onSelect: {
      control: false,
    },
  },
} satisfies Meta<typeof AtlasStepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllIdle: Story = {
  args: {
    activeId: "upload",
    steps: [
      {
        id: "upload",
        label: "Upload file",
        hint: "Waiting for input",
        status: "idle",
      },
      {
        id: "inspect",
        label: "Inspect schema",
        hint: "Not started",
        status: "idle",
      },
      {
        id: "clean",
        label: "Clean data",
        hint: "Not started",
        status: "idle",
      },
    ],
  },
};

export const InProgress: Story = {
  args: {
    activeId: "clean",
    steps: [
      {
        id: "upload",
        label: "Upload file",
        status: "done",
        durationMs: 300,
      },
      {
        id: "inspect",
        label: "Inspect schema",
        status: "done",
        durationMs: 850,
      },
      {
        id: "clean",
        label: "Clean data",
        hint: "Applying transformations",
        status: "running",
      },
      {
        id: "export",
        label: "Export results",
        status: "idle",
      },
    ],
  },
};

export const WithError: Story = {
  args: {
    activeId: "validate",
    steps: [
      {
        id: "upload",
        label: "Upload file",
        status: "done",
        durationMs: 280,
      },
      {
        id: "validate",
        label: "Validate schema",
        hint: "Missing required column: email",
        status: "error",
      },
      {
        id: "clean",
        label: "Clean data",
        status: "idle",
      },
    ],
  },
};

export const Completed: Story = {
  args: {
    activeId: "export",
    steps: [
      {
        id: "upload",
        label: "Upload file",
        status: "done",
        durationMs: 240,
      },
      {
        id: "inspect",
        label: "Inspect schema",
        status: "done",
        durationMs: 620,
      },
      {
        id: "clean",
        label: "Clean data",
        status: "done",
        durationMs: 1400,
      },
      {
        id: "export",
        label: "Export results",
        status: "done",
        durationMs: 980,
      },
    ],
  },
};

export const WithoutActiveStep: Story = {
  args: {
    activeId: undefined,
  },
};
