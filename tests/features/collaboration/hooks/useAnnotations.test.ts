/**
 * Tests for src/features/collaboration/hooks/useAnnotations.ts
 *
 * The module is a thin wrapper that:
 *  1. Re-exports type aliases from @/platform/collab (no runtime code).
 *  2. Exports `useAnnotations(sectionId)` which delegates to `useAnnotationsCRDT`.
 *
 * Strategy:
 *  - Mock `@/features/collaboration/collab/collab-hub-crdt` so the unit test
 *    never touches Yjs / IndexedDB / platform collab internals.
 *  - Verify that `useAnnotations` calls `useAnnotationsCRDT` with the correct
 *    sectionId and returns its result.
 *  - Also verify the `UseAnnotationsResult` type alias is structurally compatible
 *    (checked at the import level — no additional runtime test needed).
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mock factories ───────────────────────────────────────────────────

const { useAnnotationsCRDTMock } = vi.hoisted(() => {
  const useAnnotationsCRDTMock = vi.fn();
  return { useAnnotationsCRDTMock };
});

// ─── Module mock ──────────────────────────────────────────────────────────────

vi.mock("@/features/collaboration/collab/collab-hub-crdt", () => ({
  useAnnotationsCRDT: useAnnotationsCRDTMock,
  // Other exports from that module are not consumed by useAnnotations.ts
}));

// ─── Import target under test (after mocks are set up) ───────────────────────

import { useAnnotations } from "@/features/collaboration/hooks/useAnnotations";

// ─── Shared fixture ───────────────────────────────────────────────────────────

const MOCK_API = {
  notes: [],
  unresolvedCount: 0,
  addNote: vi.fn(),
  resolveNote: vi.fn(),
  unresolveNote: vi.fn(),
  deleteNote: vi.fn(),
  replyToNote: vi.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useAnnotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnnotationsCRDTMock.mockReturnValue(MOCK_API);
  });

  it("calls useAnnotationsCRDT with the provided sectionId", () => {
    // Arrange
    const sectionId = "overview";

    // Act
    renderHook(() => useAnnotations(sectionId));

    // Assert
    expect(useAnnotationsCRDTMock).toHaveBeenCalledWith(sectionId);
  });

  it("returns the result of useAnnotationsCRDT", () => {
    // Arrange
    const sectionId = "transactions";

    // Act
    const { result } = renderHook(() => useAnnotations(sectionId));

    // Assert
    expect(result.current).toBe(MOCK_API);
  });

  it("passes different sectionIds through to useAnnotationsCRDT", () => {
    // Arrange
    const sectionIds = [
      "overview",
      "transactions",
      "channels",
      "anomalies",
      "operators",
      "regions",
    ];

    for (const sectionId of sectionIds) {
      vi.clearAllMocks();
      useAnnotationsCRDTMock.mockReturnValue(MOCK_API);

      // Act
      renderHook(() => useAnnotations(sectionId));

      // Assert
      expect(useAnnotationsCRDTMock).toHaveBeenCalledWith(sectionId);
    }
  });

  it("returns notes from the CRDT result", () => {
    // Arrange
    const notes = [
      {
        id: "note-1",
        sectionId: "overview",
        author: "Alice",
        text: "Check this",
        color: "yellow" as const,
        priority: "normal" as const,
        at: Date.now(),
        resolved: false,
        replies: [],
      },
    ];
    useAnnotationsCRDTMock.mockReturnValue({ ...MOCK_API, notes, unresolvedCount: 1 });

    // Act
    const { result } = renderHook(() => useAnnotations("overview"));

    // Assert
    expect(result.current.notes).toBe(notes);
    expect(result.current.unresolvedCount).toBe(1);
  });

  it("returns the api functions from the CRDT result", () => {
    // Arrange
    const addNote = vi.fn();
    const resolveNote = vi.fn();
    const unresolveNote = vi.fn();
    const deleteNote = vi.fn();
    const replyToNote = vi.fn();

    useAnnotationsCRDTMock.mockReturnValue({
      notes: [],
      unresolvedCount: 0,
      addNote,
      resolveNote,
      unresolveNote,
      deleteNote,
      replyToNote,
    });

    // Act
    const { result } = renderHook(() => useAnnotations("channels"));

    // Assert
    expect(result.current.addNote).toBe(addNote);
    expect(result.current.resolveNote).toBe(resolveNote);
    expect(result.current.unresolveNote).toBe(unresolveNote);
    expect(result.current.deleteNote).toBe(deleteNote);
    expect(result.current.replyToNote).toBe(replyToNote);
  });

  it("calls useAnnotationsCRDT once per render", () => {
    // Arrange
    const sectionId = "anomalies";

    // Act
    const { rerender } = renderHook(() => useAnnotations(sectionId));
    rerender();

    // Assert: called twice total (initial render + rerender)
    expect(useAnnotationsCRDTMock).toHaveBeenCalledTimes(2);
    expect(useAnnotationsCRDTMock).toHaveBeenNthCalledWith(1, sectionId);
    expect(useAnnotationsCRDTMock).toHaveBeenNthCalledWith(2, sectionId);
  });

  it("forwards a new sectionId when the argument changes", () => {
    // Arrange
    let sectionId = "operators";
    useAnnotationsCRDTMock.mockReturnValue(MOCK_API);

    // Act
    const { rerender } = renderHook(() => useAnnotations(sectionId));
    expect(useAnnotationsCRDTMock).toHaveBeenLastCalledWith("operators");

    sectionId = "regions";
    rerender();

    // Assert
    expect(useAnnotationsCRDTMock).toHaveBeenLastCalledWith("regions");
  });
});
