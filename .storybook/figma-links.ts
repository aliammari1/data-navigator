const figmaFileUrl = process.env.STORYBOOK_FIGMA_FILE_URL?.trim();

export const figmaLinks = {
  button: createFigmaNodeUrl(process.env.STORYBOOK_FIGMA_BUTTON_NODE_ID),
  empty: createFigmaNodeUrl(process.env.STORYBOOK_FIGMA_EMPTY_NODE_ID),
} as const;

function createFigmaNodeUrl(nodeId: string | undefined) {
  if (!figmaFileUrl || !nodeId?.trim()) {
    return undefined;
  }

  try {
    const url = new URL(figmaFileUrl);
    const isFigmaUrl =
      url.protocol === "https:" &&
      (url.hostname === "figma.com" || url.hostname.endsWith(".figma.com"));

    if (!isFigmaUrl) {
      return undefined;
    }

    url.searchParams.set("node-id", nodeId.trim());
    return url.toString();
  } catch {
    return undefined;
  }
}

export function figmaDesign(url: string | undefined) {
  return url
    ? ({
        type: "figma",
        url,
      } as const)
    : undefined;
}
