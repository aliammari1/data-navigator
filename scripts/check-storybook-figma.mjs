import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.storybook", quiet: true });

const fileUrl = process.env.STORYBOOK_FIGMA_FILE_URL?.trim();
const nodes = {
  STORYBOOK_FIGMA_BUTTON_NODE_ID: process.env.STORYBOOK_FIGMA_BUTTON_NODE_ID?.trim(),
  STORYBOOK_FIGMA_EMPTY_NODE_ID: process.env.STORYBOOK_FIGMA_EMPTY_NODE_ID?.trim(),
};

if (!fileUrl) {
  console.log("Figma embeds are disabled. Add .env.storybook to enable design links.");
  process.exit(0);
}

let parsedUrl;

try {
  parsedUrl = new URL(fileUrl);
} catch {
  console.error("STORYBOOK_FIGMA_FILE_URL must be a valid URL.");
  process.exit(1);
}

const isFigmaUrl =
  parsedUrl.protocol === "https:" &&
  (parsedUrl.hostname === "figma.com" || parsedUrl.hostname.endsWith(".figma.com"));

if (!isFigmaUrl) {
  console.error("STORYBOOK_FIGMA_FILE_URL must be an HTTPS figma.com URL.");
  process.exit(1);
}

const missingNodes = Object.entries(nodes)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingNodes.length > 0) {
  console.error(`Missing Figma node IDs: ${missingNodes.join(", ")}`);
  process.exit(1);
}

console.log(`Validated ${Object.keys(nodes).length} Storybook Figma links.`);
