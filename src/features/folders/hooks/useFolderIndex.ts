import { useMemo } from "react";
import { buildFolderIndex, type FolderIndex } from "../lib/folderTree";
import type { FSNode } from "../types";

export function useFolderIndex(nodes: FSNode[]): FolderIndex {
  return useMemo(() => buildFolderIndex(nodes), [nodes]);
}
