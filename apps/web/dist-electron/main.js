import { ipcMain as l, BrowserWindow as p, dialog as _, app as i } from "electron";
import { Worker as R } from "node:worker_threads";
import { dirname as h, join as c } from "node:path";
import { fileURLToPath as f } from "node:url";
function y(e, r) {
  return { id: e, type: "error", error: r };
}
const E = h(f(import.meta.url));
let s = null;
function k() {
  if (s) return s;
  const e = c(E, "workers", "nodeGitWorker.js");
  return s = new R(e), s;
}
l.handle("git:call", async (e, r) => {
  try {
    const n = Number(r?.id ?? 0), t = String(r?.type ?? ""), a = k(), g = t === "loadRepo" && r?.repoPath ? { id: n, type: "loadRepo", repoPath: String(r.repoPath) } : { id: n, type: t, ...r };
    return await new Promise((w) => {
      const d = (o) => {
        if (!(!o || o.id !== n)) {
          if (o.type === "progress") {
            p.getFocusedWindow()?.webContents.send("git:progress", { id: n, message: o.message });
            return;
          }
          a.off("message", d), w(o);
        }
      };
      a.on("message", d), a.postMessage(g);
    });
  } catch (n) {
    const t = Number(r?.id ?? 0);
    return y(t, n?.message ?? String(n));
  }
});
l.handle("dialog:pick-repo", async () => {
  try {
    const e = await _.showOpenDialog({ properties: ["openDirectory"] });
    if (e.canceled || !e.filePaths?.length)
      return { type: "error", error: "cancelled" };
    const r = e.filePaths[0], n = r.split(/[\\/]/).pop() || "";
    return { type: "ok", data: { path: r, baseName: n } };
  } catch (e) {
    return { type: "error", error: e?.message ?? String(e) };
  }
});
const v = process.env.VITE_DEV_SERVER_URL !== void 0, u = h(f(import.meta.url));
function m() {
  const e = new p({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: !0,
      nodeIntegration: !1,
      nodeIntegrationInWorker: !0,
      preload: c(u, "preload.mjs")
    }
  });
  v && process.env.VITE_DEV_SERVER_URL ? (e.loadURL(process.env.VITE_DEV_SERVER_URL), e.webContents.openDevTools({ mode: "detach" })) : e.loadFile(c(u, "../dist/index.html"));
}
i.whenReady().then(() => {
  l.handle("fetch-models", async () => {
    try {
      const e = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { "Content-Type": "application/json" }
      });
      if (!e.ok) return null;
      const r = await e.json();
      return !r || !Array.isArray(r.data) ? null : r.data.map((t) => ({
        id: t.id,
        name: t.name || t.id,
        description: t.description || "",
        context_length: t.context_length || 0,
        pricing: t.pricing || "",
        available: t.available !== !1
      }));
    } catch {
      return null;
    }
  }), m(), i.on("activate", () => {
    p.getAllWindows().length === 0 && m();
  });
});
i.on("window-all-closed", () => {
  process.platform !== "darwin" && i.quit();
});
//# sourceMappingURL=main.js.map
