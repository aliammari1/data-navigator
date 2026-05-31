import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

vi.mock("@base-ui/react/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));

describe("Button", () => {
  it("should render with default variant", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it("should render with different variants", () => {
    const { rerender } = render(<Button variant="outline">Outline</Button>);
    let button = screen.getByRole("button", { name: /outline/i });
    expect(button).toBeInTheDocument();

    rerender(<Button variant="destructive">Destructive</Button>);
    button = screen.getByRole("button", { name: /destructive/i });
    expect(button).toBeInTheDocument();

    rerender(<Button variant="ghost">Ghost</Button>);
    button = screen.getByRole("button", { name: /ghost/i });
    expect(button).toBeInTheDocument();

    rerender(<Button variant="link">Link</Button>);
    button = screen.getByRole("button", { name: /link/i });
    expect(button).toBeInTheDocument();
  });

  it("should render with different sizes", () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    let button = screen.getByRole("button", { name: /small/i });
    expect(button).toBeInTheDocument();

    rerender(<Button size="lg">Large</Button>);
    button = screen.getByRole("button", { name: /large/i });
    expect(button).toBeInTheDocument();

    rerender(<Button size="icon">Icon</Button>);
    button = screen.getByRole("button", { name: /icon/i });
    expect(button).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole("button", { name: /custom/i });
    expect(button).toHaveClass("custom-class");
  });

  it("should handle click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    const button = screen.getByRole("button", { name: /click/i });
    button.click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("should be disabled when disabled prop is passed", () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole("button", { name: /disabled/i });
    expect(button).toBeDisabled();
  });
});
