---
"data-navigator": patch
---

Fix packaged AppImage startup by resolving auth-database Drizzle migrations from the bundled app path instead of the user's launch directory. Use electron-builder's static AppImage runtime so modern Arch/Omarchy systems no longer require legacy FUSE2.
