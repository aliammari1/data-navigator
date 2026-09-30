import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteDialog } from "@/features/collaboration/components/InviteDialog";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,AA==") },
}));

describe("InviteDialog copy controls", () => {
  afterEach(() => {
    delete (window as Window & { electronClipboard?: unknown }).electronClipboard;
  });

  it("copies the join URL through Electron", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    (window as Window & { electronClipboard?: unknown }).electronClipboard = { writeText };
    render(
      <InviteDialog
        open
        onOpenChange={() => {}}
        joinUrl="http://lan/guest/join?token=abc"
        pairingCode="123456"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copier Lien d'invitation" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://lan/guest/join?token=abc"));
    await screen.findByAltText("QR code d'invitation à la session LAN");
  });

  it("keeps empty links disabled", async () => {
    render(<InviteDialog open onOpenChange={() => {}} joinUrl="" pairingCode="123456" />);
    expect(screen.getByRole("button", { name: "Copier Lien d'invitation" })).toBeDisabled();
    expect(screen.getByText("Génération du QR…")).toBeInTheDocument();
  });
});
