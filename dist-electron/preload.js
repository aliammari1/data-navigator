// electron/preload.ts
var import_electron = require("electron");
var electronFS = {
  getDataDir: () => import_electron.ipcRenderer.invoke("fs:getDataDir"),
  readFile: (filePath) => import_electron.ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath, data) => import_electron.ipcRenderer.invoke("fs:writeFile", filePath, data),
  deleteFile: (filePath) => import_electron.ipcRenderer.invoke("fs:deleteFile", filePath),
  listFiles: (dir) => import_electron.ipcRenderer.invoke("fs:listFiles", dir),
  listFilesRecursive: (dir) => import_electron.ipcRenderer.invoke("fs:listFilesRecursive", dir),
  fileExists: (filePath) => import_electron.ipcRenderer.invoke("fs:fileExists", filePath),
  openDialog: (options) => import_electron.ipcRenderer.invoke("fs:openDialog", options),
  saveDialog: (options) => import_electron.ipcRenderer.invoke("fs:saveDialog", options)
};
import_electron.contextBridge.exposeInMainWorld("electronFS", electronFS);
