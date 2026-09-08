const { app } = require("electron");
app.whenReady().then(() => {
  console.log("modules:", process.versions.modules);
  console.log("node:", process.versions.node);
  console.log("electron:", process.versions.electron);
  app.quit();
});
