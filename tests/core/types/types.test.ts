import { describe, expect, it } from "vitest";

describe("Core Types", () => {
  it("should validate DataColumn structure", () => {
    const column: import("@/core/types/data").DataColumn = {
      key: "name",
      label: "Name",
      type: "string",
      visible: true,
    };

    expect(column.key).toBe("name");
    expect(column.label).toBe("Name");
    expect(column.type).toBe("string");
    expect(column.visible).toBe(true);
  });

  it("should validate DataColumn with number type", () => {
    const column: import("@/core/types/data").DataColumn = {
      key: "age",
      label: "Age",
      type: "number",
      visible: false,
    };

    expect(column.type).toBe("number");
    expect(column.visible).toBe(false);
  });

  it("should validate DataTransform structure", () => {
    const transform: import("@/core/types/data").DataTransform = {
      type: "rename",
      column: "oldName",
      newName: "newName",
    };

    expect(transform.type).toBe("rename");
    expect(transform.column).toBe("oldName");
    expect(transform.newName).toBe("newName");
  });

  it("should validate filter DataTransform", () => {
    const transform: import("@/core/types/data").DataTransform = {
      type: "filter",
      column: "age",
      operator: "greater",
      value: 18,
    };

    expect(transform.type).toBe("filter");
    expect(transform.operator).toBe("greater");
    expect(transform.value).toBe(18);
  });

  it("should validate FileItem structure", () => {
    const file: import("@/core/types/file").FileItem = {
      id: "file-1",
      name: "data.csv",
      size: 1024,
      type: "text/csv",
      folderId: null,
      uploadDate: new Date("2024-01-01"),
      status: "complete",
    };

    expect(file.id).toBe("file-1");
    expect(file.name).toBe("data.csv");
    expect(file.size).toBe(1024);
    expect(file.status).toBe("complete");
    expect(file.folderId).toBeNull();
  });

  it("should validate Folder structure", () => {
    const folder: import("@/core/types/file").Folder = {
      id: "folder-1",
      name: "Documents",
      parentId: null,
      createdAt: new Date("2024-01-01"),
    };

    expect(folder.id).toBe("folder-1");
    expect(folder.name).toBe("Documents");
    expect(folder.parentId).toBeNull();
  });

  it("should validate ParsedData structure", () => {
    const parsed: import("@/core/types/file").ParsedData = {
      id: "parsed-1",
      fileId: "file-1",
      columns: ["name", "age"],
      rows: [{ name: "John", age: 30 }],
    };

    expect(parsed.fileId).toBe("file-1");
    expect(parsed.columns).toHaveLength(2);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toHaveProperty("name", "John");
  });
});
