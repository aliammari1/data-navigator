# Vendored WebGazer bundle

`webgazer.js` is the self-contained UMD build, loaded at runtime via a `<script>`
tag (see `src/features/eye-tracking/core/eyetracker.ts`) instead of through the
module bundler — `@mediapipe/face_mesh` ships no ESM and breaks Turbopack.

## Local patch — DO NOT lose on re-vendor

The stock bundle hardcodes the MediaPipe FaceMesh asset path as a **relative**
URL:

```
faceMeshSolutionPath:"./mediapipe/face_mesh"
```

MediaPipe resolves that relative to the *document* (e.g. `http://host/`), so it
requests `/mediapipe/face_mesh/*` from the site root — which 404s, because the
assets live next to this bundle. The missing model then surfaces downstream as
`TypeError: t is not a function`.

We patch it to the **absolute** path matching the on-disk layout:

```
faceMeshSolutionPath:"/vendor/webgazer/mediapipe/face_mesh"
```

The FaceMesh assets are committed under `mediapipe/face_mesh/` here. If you ever
re-download / upgrade `webgazer.js`, re-apply this one-line change or the eye
tracker will fail to start.
