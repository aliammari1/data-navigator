import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ShortcutsButton } from "@/features/dashboard-shell/shell/shortcuts-overlay";

// Radix Popover touches a few DOM APIs jsdom doesn't implement. Polyfill them
// as no-ops so the controlled popover can open/close in tests.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= vi.fn();
  proto.hasPointerCapture ??= vi.fn(() => false);
  proto.setPointerCapture ??= vi.fn();
  proto.releasePointerCapture ??= vi.fn();
});

function getButton() {
  return screen.getByRole("button", { name: /afficher les raccourcis/i });
}

describe("ShortcutsButton", () => {
  it("renders a collapsed floating button by default", () => {
    render(<ShortcutsButton />);
    expect(getButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Palette de commandes")).not.toBeInTheDocument();
  });

  it("opens the shortcuts panel on click and lists the shortcuts", async () => {
    const user = userEvent.setup();
    render(<ShortcutsButton />);

    await user.click(getButton());

    expect(getButton()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Palette de commandes")).toBeInTheDocument();
    expect(screen.getByText("Assistant Moudir")).toBeInTheDocument();
    expect(screen.getByText("Barre latérale")).toBeInTheDocument();
    // Modifier resolves to Ctrl on the non-mac jsdom platform.
    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
  });

  it("toggles open when the ? key is pressed outside a text field", () => {
    render(<ShortcutsButton />);
    expect(screen.queryByText("Palette de commandes")).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "?" });

    expect(screen.getByText("Palette de commandes")).toBeInTheDocument();
  });

  it("ignores ? while typing in an input field", () => {
    render(
      <>
        <input aria-label="search" />
        <ShortcutsButton />
      </>,
    );
    const input = screen.getByLabelText("search");
    input.focus();

    fireEvent.keyDown(input, { key: "?" });

    expect(screen.queryByText("Palette de commandes")).not.toBeInTheDocument();
  });
});
