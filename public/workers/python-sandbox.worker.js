"use strict";
(() => {
  // src/workers/python-sandbox.worker.ts
  var PYODIDE_VERSION = "0.26.4";
  var PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  var pyodide = null;
  var loadPromise = null;
  var sessions = /* @__PURE__ */ new Map();
  var activeSession = { id: null };
  function post(msg) {
    self.postMessage(msg);
  }
  var scientificPromise = null;
  async function ensurePyodide(reqId) {
    if (pyodide) return pyodide;
    if (!loadPromise) {
      loadPromise = (async () => {
        post({
          id: reqId,
          type: "LOAD_PROGRESS",
          text: "Loading Pyodide runtime\u2026"
        });
        try {
          self.importScripts(`${PYODIDE_CDN}pyodide.js`);
        } catch (err) {
          throw new Error(
            `Pyodide CDN unreachable (${PYODIDE_CDN}pyodide.js). Check your network connection and try again. Underlying: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        const loader = self.loadPyodide;
        if (!loader)
          throw new Error(
            "Pyodide loader script imported but `loadPyodide` is undefined. Possible CDN content mismatch."
          );
        pyodide = await loader({
          indexURL: PYODIDE_CDN,
          stdout: (s) => activeSession.id && post({
            id: reqId,
            type: "STDOUT",
            sessionId: activeSession.id,
            text: s
          }),
          stderr: (s) => activeSession.id && post({
            id: reqId,
            type: "STDERR",
            sessionId: activeSession.id,
            text: s
          })
        });
        post({
          id: reqId,
          type: "LOAD_PROGRESS",
          text: "Pyodide ready (Python 3 in browser)"
        });
      })();
    }
    await loadPromise;
    if (!pyodide) throw new Error("Pyodide failed to initialize");
    return pyodide;
  }
  async function ensureScientific(py, reqId) {
    if (!scientificPromise) {
      scientificPromise = (async () => {
        post({
          id: reqId,
          type: "LOAD_PROGRESS",
          text: "Loading numpy, pandas, micropip\u2026"
        });
        await py.loadPackage(["numpy", "pandas", "micropip"]);
        post({ id: reqId, type: "LOAD_PROGRESS", text: "Sandbox ready" });
      })();
    }
    await scientificPromise;
  }
  function configureStreams(py, reqId, sessionId) {
    activeSession.id = sessionId;
    py.setStdout({
      batched: (s) => post({ id: reqId, type: "STDOUT", sessionId, text: `${s}
` })
    });
    py.setStderr({
      batched: (s) => post({ id: reqId, type: "STDERR", sessionId, text: `${s}
` })
    });
  }
  function getSession(sessionId, py) {
    let s = sessions.get(sessionId);
    if (!s) {
      const ns = py.toPy({});
      s = { ns };
      sessions.set(sessionId, s);
    }
    return s;
  }
  function setSessionValue(session, key, value) {
    if (typeof session.ns.set === "function") {
      session.ns.set(key, value);
      return;
    }
    throw new Error(
      "Pyodide session namespace does not support variable binding."
    );
  }
  function safeJSON(value) {
    if (value === null || value === void 0) return null;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") return value;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
      return "<binary>";
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  self.onmessage = async (e) => {
    const msg = e.data;
    try {
      if (msg.type === "INIT") {
        await ensurePyodide(msg.id);
        post({ id: msg.id, type: "READY" });
        return;
      }
      if (msg.type === "HEALTHCHECK") {
        post({
          id: msg.id,
          type: "HEALTH",
          pyodideVersion: PYODIDE_VERSION,
          sessions: sessions.size,
          scientificReady: scientificPromise !== null
        });
        return;
      }
      const py = await ensurePyodide(msg.id);
      if (msg.type === "LOAD_DATAFRAME") {
        await ensureScientific(py, msg.id);
        const session = getSession(msg.sessionId, py);
        configureStreams(py, msg.id, msg.sessionId);
        setSessionValue(session, "__sandbox_rows", py.toPy(msg.rows));
        setSessionValue(session, "__sandbox_var", msg.varName);
        const code = `
import pandas as _pd
__sandbox_df = _pd.DataFrame(__sandbox_rows.to_py() if hasattr(__sandbox_rows, 'to_py') else __sandbox_rows)
globals()[__sandbox_var] = __sandbox_df
del __sandbox_rows, __sandbox_var, __sandbox_df
`;
        await py.runPythonAsync(code, { globals: session.ns });
        post({
          id: msg.id,
          type: "RESULT",
          sessionId: msg.sessionId,
          value: { ok: true }
        });
        return;
      }
      if (msg.type === "INSTALL") {
        await ensureScientific(py, msg.id);
        configureStreams(py, msg.id, msg.sessionId);
        const micropip = py.pyimport("micropip");
        await micropip.install(msg.packages);
        post({
          id: msg.id,
          type: "RESULT",
          sessionId: msg.sessionId,
          value: { installed: msg.packages }
        });
        return;
      }
      if (msg.type === "RESET") {
        sessions.get(msg.sessionId)?.ns.destroy?.();
        sessions.delete(msg.sessionId);
        post({
          id: msg.id,
          type: "RESULT",
          sessionId: msg.sessionId,
          value: { ok: true }
        });
        return;
      }
      if (msg.type === "RUN") {
        await ensureScientific(py, msg.id);
        const session = getSession(msg.sessionId, py);
        configureStreams(py, msg.id, msg.sessionId);
        try {
          await py.loadPackagesFromImports(msg.code);
        } catch {
        }
        const wrapped = `
import json as __json
__last = None
try:
    exec(compile(${JSON.stringify(msg.code)}, "<sandbox>", "exec"), globals())
except Exception as __e:
    import traceback as __tb
    __tb.print_exc()
    raise

# Capture last expression if user wrote one as the trailing line
`;
        const result = await py.runPythonAsync(wrapped, { globals: session.ns });
        post({
          id: msg.id,
          type: "RESULT",
          sessionId: msg.sessionId,
          value: safeJSON(result)
        });
        return;
      }
    } catch (err) {
      post({
        id: msg.id,
        type: "ERROR",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  };
})();
