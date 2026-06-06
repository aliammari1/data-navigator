// .storybook/preview.tsx
import type { Preview } from "@storybook/nextjs";
import { initialize, mswLoader } from "msw-storybook-addon";
import "../src/app/globals.css";
import "./storybook-electron-mocks";

initialize({
  onUnhandledRequest: "bypass",
});

const preview: Preview = {
  loaders: [mswLoader],

  parameters: {
    layout: "fullscreen",

    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      test: "todo",
    },

    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#020617" },
        { name: "light", value: "#f8fafc" },
      ],
    },

    viewport: {
      viewports: {
        desktop: {
          name: "Desktop 1440",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
        managerLaptop: {
          name: "Manager Laptop",
          styles: {
            width: "1280px",
            height: "800px",
          },
        },
        tablet: {
          name: "Tablet",
          styles: {
            width: "768px",
            height: "1024px",
          },
        },
      },
    },
  },

  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
};

export default preview;
