// .storybook/preview.tsx
import type { Preview } from "@storybook/nextjs";
import { initialize, mswLoader } from "msw-storybook-addon";
import { Fira_Code, Poppins } from "next/font/google";
import { useEffect, type ReactNode } from "react";

import { QueryProvider } from "../src/components/query-provider";
import {
  ThemeProvider,
  useTheme,
} from "../src/components/theme-provider";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/app/globals.css";
import "../src/design/tokens.css";
import "./storybook-electron-mocks";

initialize({
  onUnhandledRequest: "bypass",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-data-navigator-sans",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-moudir-mono",
});

type StorybookTheme = "light" | "dark";

function ThemeSynchronizer({
  children,
  theme,
}: {
  children: ReactNode;
  theme: StorybookTheme;
}) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  return children;
}

const preview: Preview = {
  loaders: [mswLoader],

  globalTypes: {
    theme: {
      description: "Global color theme",
      toolbar: {
        icon: "paintbrush",
        items: [
          { title: "Dark", value: "dark" },
          { title: "Light", value: "light" },
        ],
      },
    },
  },

  initialGlobals: {
    theme: "dark",
  },

  parameters: {
    layout: "fullscreen",

    nextjs: {
      appDirectory: true,
    },

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
    (Story, context) => {
      const theme: StorybookTheme =
        context.globals.theme === "light" ? "light" : "dark";

      return (
        <div className={`${poppins.variable} ${firaCode.variable}`}>
          <ThemeProvider
            attribute="class"
            defaultTheme={theme}
            disableTransitionOnChange
            enableSystem={false}
          >
            <ThemeSynchronizer theme={theme}>
              <QueryProvider>
                <TooltipProvider>
                  <div className="min-h-screen bg-background font-sans text-foreground antialiased">
                    <Story />
                  </div>
                </TooltipProvider>
              </QueryProvider>
            </ThemeSynchronizer>
          </ThemeProvider>
        </div>
      );
    },
  ],
};

export default preview;
