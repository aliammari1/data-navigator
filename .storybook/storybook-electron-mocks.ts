const noop = async () => undefined;

if (typeof window !== "undefined") {
  Object.assign(window, {
    electronAPI: {
      getAppVersion: async () => "storybook",
      openFile: noop,
      saveFile: noop,
      readFile: noop,
      writeFile: noop,
      registerCSVPathDataset: noop,
      registerParquetPathDataset: noop,
      listDatasets: async () => [],
      previewDataset: async () => [],
      summarizeDataset: async () => [],
      exportDataset: noop,
      deleteDataset: noop,
      runReadOnlyQuery: async () => [],
      getDuckDBStatus: async () => ({
        active: false,
        dbPath: null,
        datasetsDir: null,
        readConnections: 0,
        pendingReads: 0,
        pendingWrites: 0,
      }),
      getQueryMetrics: async () => [],
      clearQueryMetrics: noop,
    },
  });
}
