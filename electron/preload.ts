import { contextBridge, ipcRenderer } from "electron";

const electronFS = {
  getDataDir: (): Promise<string> => ipcRenderer.invoke("fs:getDataDir"),

  readFile: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke("fs:readFile", filePath),

  writeFile: (filePath: string, data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke("fs:writeFile", filePath, data),

  deleteFile: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke("fs:deleteFile", filePath),

  listFiles: (dir?: string): Promise<string[]> =>
    ipcRenderer.invoke("fs:listFiles", dir),

  listFilesRecursive: (dir: string): Promise<string[]> =>
    ipcRenderer.invoke("fs:listFilesRecursive", dir),

  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke("fs:fileExists", filePath),

  openDialog: (options: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    properties?: string[];
  }): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke("fs:openDialog", options),

  saveDialog: (options: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke("fs:saveDialog", options),
} as const;

contextBridge.exposeInMainWorld("electronFS", electronFS);
