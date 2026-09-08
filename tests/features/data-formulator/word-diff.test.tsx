import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WordDiff } from "@/features/data-formulator/components/moudir-chat/word-diff";

describe("WordDiff", () => {
  it("renders insertions and deletions without crashing (regression: diff_main needs strings)", () => {
    render(
      <WordDiff
        before="Le chiffre est 12 et le total est bon"
        after="Le chiffre est 15 et le total est mauvais"
        ariaLabel="Changements"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Changements" }));
    const region = screen.getByLabelText("Changements", { selector: "div" });
    expect(region.innerHTML).toContain("15");
    expect(region.innerHTML).toContain("line-through");
  });

  it("escapes HTML in compared text", () => {
    render(
      <WordDiff before="a <b> test" after="a <c> test" ariaLabel="Changements" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Changements" }));
    const region = screen.getByLabelText("Changements", { selector: "div" });
    expect(region.innerHTML).not.toContain("<b>");
    expect(region.innerHTML).toContain("&lt;");
    expect(region.innerHTML).toContain("&gt;");
  });
});
