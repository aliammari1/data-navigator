const figmaFile =
  "https://www.figma.com/design/REPLACE_WITH_FILE_KEY/Data-Navigator-Design-System";

export const figmaLinks = {
  button: `${figmaFile}?node-id=button-component`,
  empty: `${figmaFile}?node-id=empty-state-component`,
} as const;

export function figmaDesign(url: string) {
  return {
    type: "figma",
    url,
  } as const;
}
