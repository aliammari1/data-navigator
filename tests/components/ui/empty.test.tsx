import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

describe("Empty component", () => {
  it("should render with default classes", () => {
    render(<Empty data-testid="empty">Content</Empty>);
    const element = screen.getByTestId("empty");
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass("flex", "flex-col", "items-center");
  });

  it("should merge custom className", () => {
    render(
      <Empty data-testid="empty" className="custom-class">
        Content
      </Empty>,
    );
    const element = screen.getByTestId("empty");
    expect(element).toHaveClass("custom-class");
  });

  it("should render children", () => {
    render(<Empty>Test Content</Empty>);
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });
});

describe("EmptyHeader", () => {
  it("should render with correct classes", () => {
    render(<EmptyHeader data-testid="header">Header</EmptyHeader>);
    const element = screen.getByTestId("header");
    expect(element).toHaveClass("flex", "flex-col", "items-center");
  });
});

describe("EmptyMedia", () => {
  it("should render with default variant", () => {
    render(<EmptyMedia data-testid="media">Icon</EmptyMedia>);
    const element = screen.getByTestId("media");
    expect(element).toHaveAttribute("data-variant", "default");
  });

  it("should render with icon variant", () => {
    render(
      <EmptyMedia data-testid="media" variant="icon">
        Icon
      </EmptyMedia>,
    );
    const element = screen.getByTestId("media");
    expect(element).toHaveAttribute("data-variant", "icon");
    expect(element).toHaveClass("rounded-lg", "bg-muted");
  });

  it("should merge custom className", () => {
    render(
      <EmptyMedia data-testid="media" className="custom-media">
        Icon
      </EmptyMedia>,
    );
    const element = screen.getByTestId("media");
    expect(element).toHaveClass("custom-media");
  });
});

describe("EmptyTitle", () => {
  it("should render with heading styles", () => {
    render(<EmptyTitle data-testid="title">Title</EmptyTitle>);
    const element = screen.getByTestId("title");
    expect(element).toHaveClass("font-heading", "text-lg");
  });
});

describe("EmptyDescription", () => {
  it("should render with description styles", () => {
    render(<EmptyDescription data-testid="desc">Description</EmptyDescription>);
    const element = screen.getByTestId("desc");
    expect(element).toHaveClass("text-muted-foreground");
  });
});

describe("EmptyContent", () => {
  it("should render with content styles", () => {
    render(<EmptyContent data-testid="content">Content</EmptyContent>);
    const element = screen.getByTestId("content");
    expect(element).toHaveClass("flex", "flex-col", "items-center");
  });
});
