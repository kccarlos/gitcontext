import { contextBridge as n, ipcRenderer as r } from "electron";
const l = /* @__PURE__ */ new Set(["git:call", "fetch-models", "tokenizer:count", "dialog:pick-repo"]), s = /* @__PURE__ */ new Set(["git:progress"]);
n.exposeInMainWorld("electron", {
  invoke: (e, o) => {
    if (!l.has(e)) throw new Error("Channel not allowed: " + e);
    return r.invoke(e, o);
  },
  on: (e, o) => {
    if (!s.has(e)) throw new Error("Event not allowed: " + e);
    const t = (w, i) => o(i);
    return r.on(e, t), () => r.off(e, t);
  }
});
window.isElectron = !0;
n.exposeInMainWorld("isElectron", !0);
