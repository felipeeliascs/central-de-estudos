import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { once } from "node:events";
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
let serverAvailable = true;
const server = createServer(async (req, res) => {
  if (!serverAvailable) return req.socket.destroy();
  const path = new URL(req.url, "http://localhost").pathname;
  if (!path.startsWith("/central-de-estudos/")) return res.writeHead(404).end();
  const file = resolve(
    root,
    path.slice("/central-de-estudos/".length) || "index.html",
  );
  if (!file.startsWith(root + sep)) return res.writeHead(404).end();
  try {
    const data = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}/central-de-estudos/`;
const scratch = resolve("work");
await mkdir(scratch, { recursive: true });
const profile = await mkdtemp(scratch + sep + "qa-chrome-");
const chrome = spawn(
  process.env.CENTRAL_CHROME ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "about:blank",
  ],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
);
let socket;
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Chrome debugger unavailable")),
      10000,
    );
    chrome.on("error", reject);
    chrome.on("exit", (code) => reject(new Error(`Chrome exited ${code}`)));
    chrome.stderr.on("data", (chunk) => {
      const match = String(chunk).match(
        /DevTools listening on (ws:\/\/[^\s]+)/,
      );
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const tabs = await (
    await fetch(new URL("/json/list", debuggerUrl.replace("ws:", "http:")))
  ).json();
  socket = new WebSocket(
    tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl,
  );
  await once(socket, "open");
  let messageId = 0;
  const pending = new Map();
  socket.addEventListener("message", (e) => {
    const message = JSON.parse(e.data);
    pending.get(message.id)?.(message);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++messageId;
      const timer = setTimeout(
        () => reject(new Error(method + " timed out")),
        6000,
      );
      pending.set(id, (message) => {
        clearTimeout(timer);
        pending.delete(id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          "Browser evaluation failed",
      );
    return result.result.value;
  }
  async function until(expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw new Error(
      "Condition not found: " +
        expression +
        " | " +
        (await evaluate("document.body.innerText.slice(-1100)")),
    );
  }
  const press = (key, code, virtualKey) =>
    call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      windowsVirtualKeyCode: virtualKey,
      text: "\r",
      unmodifiedText: "\r",
    }).then(() =>
      call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code,
        windowsVirtualKeyCode: virtualKey,
      }),
    );
  await call("Network.enable");
  await call("Page.navigate", { url: base });
  await until("!!document.querySelector('.home-page')");
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 800,
    });
    assert.equal(await evaluate("innerWidth"), width);
    assert.equal(
      await evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      ),
      true,
    );
    if (width <= 800) {
      await evaluate("document.querySelector('.menu').click()");
      assert.equal(
        await evaluate("!!document.querySelector('.mobile-open')"),
        true,
      );
      await evaluate("document.querySelector('.scrim').click()");
    } else {
      await evaluate("document.querySelector('.collapse-control').click()");
      assert.equal(
        await evaluate(
          "document.querySelector('.sidebar').getBoundingClientRect().width",
        ),
        76,
      );
      await evaluate("document.querySelector('.collapse-control').click()");
    }
    await evaluate("document.querySelector('.home-intro button').focus()");
    await press("Enter", "Enter", 13);
    await until("!!document.querySelector('.tabs')");
    assert.equal(
      await evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      ),
      true,
    );
    await evaluate("document.querySelector('.brand').click()");
    await until("!!document.querySelector('.home-page')");
    console.log(`OK: ${width}x${height}, início, navegação, estudo e Enter.`);
  }
  await evaluate("document.querySelector('.theme-toggle').click()");
  assert.equal(
    await evaluate("document.documentElement.dataset.theme"),
    "dark",
  );
  for (const path of [
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
  ]) {
    assert.equal((await fetch(base + path)).ok, true);
  }
  await until("navigator.serviceWorker.getRegistration().then(r=>!!r?.active)");
  const appCacheUrls = await evaluate(
    "caches.keys().then(async keys => (await Promise.all(keys.map(async k => (await (await caches.open(k)).keys()).map(r => r.url)))).flat())",
  );
  assert.deepEqual(appCacheUrls, [base + "offline.html"]);
  await call("Page.reload");
  await until(
    "!!navigator.serviceWorker.controller && !!document.querySelector('.home-page')",
  );
  await call("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await until("!!document.querySelector('.offline-notice')");
  await call("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  serverAvailable = false;
  await call("Page.reload");
  await until(
    "document.body.innerText.includes('A Central de Estudos precisa de conexão')",
  );
  console.log(
    "OK: subpasta, service worker ativo, cache só informativo, aviso e recarga offline.",
  );
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 2,
    retryDelay: 300,
  }).catch(() => {});
}
