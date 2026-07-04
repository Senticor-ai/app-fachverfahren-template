#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { inflateSync } from "node:zlib";

const root = process.cwd();
const appRoot = join(root, "apps/fachverfahren");
const staticDir = resolve(appRoot, "dist");
const serverEntry = resolve(appRoot, "dist-server/index.js");
const evidenceDir = join(root, "dist/evidence/pwa-browser");
const failures = [];
const observations = [];
const auditResults = [];

const routes = ["/buerger", "/buerger/anmelden", "/amt", "/aufsicht"];
const visualModes = [
  {
    name: "standard",
    classes: [],
    colorScheme: "light",
    prefersContrast: "no-preference",
    viewportNames: ["iphone-se", "iphone-14", "ipad", "reflow-400", "desktop"],
  },
  {
    name: "dark",
    classes: ["dark"],
    colorScheme: "dark",
    prefersContrast: "no-preference",
    viewportNames: ["reflow-400", "desktop"],
  },
  {
    name: "high-contrast",
    classes: ["high-contrast"],
    colorScheme: "light",
    prefersContrast: "more",
    viewportNames: ["reflow-400", "desktop"],
  },
];
const viewports = [
  {
    name: "iphone-se",
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "iphone-14",
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "ipad",
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "reflow-400",
    width: 320,
    height: 640,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "desktop",
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
];

if (!existsSync(join(staticDir, "index.html"))) {
  failures.push("built app missing apps/fachverfahren/dist/index.html");
}
if (!existsSync(serverEntry)) {
  failures.push("built server missing apps/fachverfahren/dist-server/index.js");
}

const chromeBin = findChrome();
if (!chromeBin) {
  failures.push(
    "Chrome/Chromium not found. Set CHROME_BIN or install Google Chrome/Chromium for check:pwa:browser.",
  );
}

if (failures.length === 0) {
  await rm(evidenceDir, { recursive: true, force: true });
  await mkdir(evidenceDir, { recursive: true });

  const appPort = Number(
    process.env["PWA_BROWSER_APP_PORT"] ?? (await findOpenPort()),
  );
  const debugPort = Number(
    process.env["PWA_BROWSER_DEBUG_PORT"] ?? (await findOpenPort()),
  );
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const userDataDir = join(tmpdir(), `fachverfahren-chrome-${process.pid}`);

  const server = spawn(process.execPath, [serverEntry], {
    cwd: appRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(appPort),
      STATIC_DIR: staticDir,
      APP_ENABLE_SERVICE_WORKER: "true",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLogs = collectLogs(server);

  const chrome = spawn(
    chromeBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const chromeLogs = collectLogs(chrome);

  try {
    await waitForServer(baseUrl);
    const browser = await connectToBrowser(debugPort, chromeLogs);
    try {
      await runBrowserAudit(browser, baseUrl);
    } finally {
      browser.close();
    }
    observations.push(`runtime ${baseUrl}`);
    observations.push(`screenshots ${display(evidenceDir)}`);
  } catch (error) {
    failures.push(String(error));
    if (serverLogs.length > 0) {
      failures.push(`server log:\n${serverLogs.join("").trim()}`);
    }
    if (chromeLogs.length > 0) {
      failures.push(`chrome log:\n${chromeLogs.join("").trim()}`);
    }
  } finally {
    server.kill("SIGTERM");
    chrome.kill("SIGTERM");
    await Promise.all([waitForExit(server), waitForExit(chrome)]);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error("PWA browser check violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `PWA browser check passed.${observations.length ? ` ${observations.join("; ")}` : ""}`,
);

async function runBrowserAudit(browser, baseUrl) {
  await browser.send("Page.enable");
  await browser.send("Runtime.enable");
  await browser.send("Log.enable");
  await browser.send("Network.enable");
  await browser.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__pwaBrowserErrors = [];
      window.addEventListener("error", (event) => {
        window.__pwaBrowserErrors.push(String(event.message || event.error || "error"));
      });
      window.addEventListener("unhandledrejection", (event) => {
        window.__pwaBrowserErrors.push(String(event.reason || "unhandled rejection"));
      });
    `,
  });

  const runtimeErrors = [];
  browser.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") {
      runtimeErrors.push(formatConsoleArgs(event.args));
    }
  });
  browser.on("Log.entryAdded", (event) => {
    if (["error", "warning"].includes(event.entry?.level)) {
      const text = String(event.entry?.text ?? "");
      if (!/favicon|DevTools/.test(text)) runtimeErrors.push(text);
    }
  });

  const pwa = await assertPwaBrowserRuntime(browser, baseUrl, runtimeErrors);

  for (const mode of visualModes) {
    for (const viewport of viewportsForMode(mode)) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        mobile: viewport.isMobile,
      });
      await browser.send("Emulation.setTouchEmulationEnabled", {
        enabled: viewport.hasTouch,
        ...(viewport.hasTouch ? { maxTouchPoints: 5 } : {}),
      });
      await browser.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [
          { name: "prefers-reduced-motion", value: "reduce" },
          { name: "prefers-color-scheme", value: mode.colorScheme },
          { name: "prefers-contrast", value: mode.prefersContrast },
          { name: "pointer", value: viewport.hasTouch ? "coarse" : "fine" },
          { name: "hover", value: viewport.hasTouch ? "none" : "hover" },
        ],
      });

      for (const route of routes) {
        runtimeErrors.length = 0;
        const label = `${mode.name} ${viewport.name} ${route}`;
        await navigate(browser, `${baseUrl}${route}`);
        await waitForHydration(browser, label);
        await applyVisualMode(browser, mode);
        const audit = await assertLayout(
          browser,
          mode,
          viewport,
          route,
          label,
          runtimeErrors,
        );
        const keyboard = await assertKeyboardNavigation(browser, label);
        const screenshot = await captureScreenshot(
          browser,
          mode,
          viewport,
          route,
        );
        auditResults.push({
          mode: mode.name,
          viewport: viewport.name,
          route,
          ...audit,
          keyboard,
          screenshot,
        });
      }
    }
  }
  await writeFile(
    join(evidenceDir, "audit-summary.json"),
    `${JSON.stringify({ pwa, routes: auditResults }, null, 2)}\n`,
  );
}

async function assertPwaBrowserRuntime(browser, baseUrl, runtimeErrors) {
  const label = "pwa-browser-runtime";
  runtimeErrors.length = 0;
  await navigate(browser, `${baseUrl}/buerger`);
  await waitForHydration(browser, label);

  const registration = await browser.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        wait(ms).then(() => {
          throw new Error(`timeout after ${ms}ms`);
        }),
      ]);
    const manifestLink = document.querySelector("link[rel='manifest']");
    const manifestHref = manifestLink?.href ?? "";
    const [runtimeResponse, manifestResponse] = await Promise.all([
      fetch("/runtime-config.json", {
        cache: "no-store",
        credentials: "same-origin",
      }),
      manifestHref ? fetch(manifestHref, { cache: "no-store" }) : null,
    ]);
    const runtimeConfig = runtimeResponse.ok
      ? await runtimeResponse.json()
      : null;
    const manifest =
      manifestResponse?.ok === true ? await manifestResponse.json() : null;

    let registration = null;
    let ready = null;
    if ("serviceWorker" in navigator) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        registration =
          registrations.find((candidate) =>
            candidate.active?.scriptURL.endsWith("/service-worker.js"),
          ) ??
          registrations.find((candidate) =>
            candidate.installing?.scriptURL.endsWith("/service-worker.js"),
          ) ??
          registrations.find((candidate) =>
            candidate.waiting?.scriptURL.endsWith("/service-worker.js"),
          ) ??
          null;
        if (registration?.active) break;
        await wait(150);
      }
      try {
        ready = await withTimeout(navigator.serviceWorker.ready, 8000);
      } catch {
        ready = null;
      }
    }

    return {
      manifestHref,
      manifest,
      runtimeServiceWorkerEnabled:
        runtimeConfig?.delivery?.serviceWorkerEnabled === true,
      serviceWorkerSupported: "serviceWorker" in navigator,
      registrationScope: registration?.scope ?? "",
      registrationActiveScript:
        registration?.active?.scriptURL ??
        registration?.waiting?.scriptURL ??
        registration?.installing?.scriptURL ??
        "",
      readyScope: ready?.scope ?? "",
      controllerBeforeReload: Boolean(navigator.serviceWorker?.controller),
    };
  });

  expect(
    registration.manifestHref.endsWith("/manifest.webmanifest"),
    `${label} must expose a manifest link, got "${registration.manifestHref}"`,
  );
  expect(
    registration.manifest?.id === "/" &&
      registration.manifest?.start_url === "/" &&
      registration.manifest?.scope === "/" &&
      registration.manifest?.display === "standalone",
    `${label} manifest is not installable enough: ${JSON.stringify(registration.manifest)}`,
  );
  expect(
    registration.runtimeServiceWorkerEnabled === true,
    `${label} runtime-config.json must enable service worker registration`,
  );
  expect(
    registration.serviceWorkerSupported === true,
    `${label} must run in a browser with service worker support`,
  );
  expect(
    registration.registrationActiveScript.endsWith("/service-worker.js"),
    `${label} did not activate /service-worker.js: ${JSON.stringify(registration)}`,
  );
  expect(
    registration.readyScope === `${baseUrl}/`,
    `${label} service worker ready scope mismatch: ${JSON.stringify(registration)}`,
  );

  await reload(browser);
  await waitForHydration(browser, `${label} reload`);

  const controlled = await browser.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    if ("serviceWorker" in navigator && !navigator.serviceWorker.controller) {
      await Promise.race([
        new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            resolve,
            {
              once: true,
            },
          ),
        ),
        wait(4000),
      ]);
    }
    const assetUrl = [
      ...document.querySelectorAll("script[src],link[rel='stylesheet'][href]"),
    ]
      .map((element) => element.src || element.href)
      .find((url) =>
        new URL(url, location.href).pathname.startsWith("/assets/"),
      );

    if (assetUrl) {
      await fetch(assetUrl, {
        cache: "reload",
        credentials: "same-origin",
      });
      await wait(150);
    }

    const cacheDetails = [];
    if ("caches" in window) {
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        cacheDetails.push({
          key,
          paths: requests.map(
            (request) => new URL(request.url, location.href).pathname,
          ),
        });
      }
    }

    return {
      controlled: Boolean(navigator.serviceWorker?.controller),
      controllerScript: navigator.serviceWorker?.controller?.scriptURL ?? "",
      assetFetched: assetUrl ? new URL(assetUrl, location.href).pathname : "",
      cacheDetails,
    };
  });

  const cachedPaths = controlled.cacheDetails.flatMap((cache) => cache.paths);
  const forbiddenCachedPaths = cachedPaths.filter(
    (path) =>
      !/^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|svg)$/.test(path),
  );
  expect(
    controlled.controlled === true,
    `${label} must be controlled by the activated service worker after reload: ${JSON.stringify(controlled)}`,
  );
  expect(
    controlled.controllerScript.endsWith("/service-worker.js"),
    `${label} controller script mismatch: ${JSON.stringify(controlled)}`,
  );
  expect(
    controlled.assetFetched.startsWith("/assets/"),
    `${label} could not fetch a built asset through the controlled page: ${JSON.stringify(controlled)}`,
  );
  expect(
    controlled.cacheDetails.every((cache) =>
      cache.key.startsWith("fachverfahren-assets"),
    ),
    `${label} must only create fachverfahren asset caches: ${JSON.stringify(controlled.cacheDetails)}`,
  );
  expect(
    cachedPaths.length > 0,
    `${label} must cache at least one hashed built asset after a controlled asset fetch: ${JSON.stringify(controlled)}`,
  );
  expect(
    forbiddenCachedPaths.length === 0,
    `${label} cached non-asset paths: ${JSON.stringify(forbiddenCachedPaths)}`,
  );
  expect(
    runtimeErrors.length === 0,
    `${label} emitted console/runtime errors: ${JSON.stringify(runtimeErrors)}`,
  );

  const summary = {
    manifest: {
      id: registration.manifest?.id ?? "",
      startUrl: registration.manifest?.start_url ?? "",
      scope: registration.manifest?.scope ?? "",
      display: registration.manifest?.display ?? "",
    },
    serviceWorker: {
      script: controlled.controllerScript
        ? new URL(controlled.controllerScript).pathname
        : "",
      scope: registration.readyScope,
      controlledAfterReload: controlled.controlled,
    },
    cache: {
      assetFetched: controlled.assetFetched,
      keys: controlled.cacheDetails.map((cache) => cache.key),
      cachedPathCount: cachedPaths.length,
    },
  };
  observations.push(
    `pwa: sw=${summary.serviceWorker.script}, controlled=${summary.serviceWorker.controlledAfterReload}, cachedAssets=${summary.cache.cachedPathCount}`,
  );
  return summary;
}

function viewportsForMode(mode) {
  return viewports.filter((viewport) =>
    mode.viewportNames.includes(viewport.name),
  );
}

async function applyVisualMode(browser, mode) {
  await browser.evaluate(
    ({ classes, colorScheme }) => {
      document.documentElement.classList.remove("dark", "high-contrast");
      document.documentElement.classList.add(...classes);
      document.documentElement.style.colorScheme = colorScheme;
    },
    { classes: mode.classes, colorScheme: mode.colorScheme },
  );
  await delay(120);
}

async function assertLayout(
  browser,
  mode,
  viewport,
  route,
  label,
  runtimeErrors,
) {
  const result = await browser.evaluate(
    ({ isMobile }) => {
      const root = document.querySelector("#root");
      const bodyText = document.body.innerText.replace(/\s+/g, " ").trim();
      const html = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(html.scrollWidth, body.scrollWidth);
      const overflowX = Math.max(0, scrollWidth - window.innerWidth);
      const rootRect = root?.getBoundingClientRect();
      const interactiveSelector =
        'button,input,select,textarea,[role="button"],a[href],.ps-btn';
      const interactive = [...document.querySelectorAll(interactiveSelector)]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const className =
            typeof element.className === "string" ? element.className : "";
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            !className.includes("sr-only") &&
            !className.includes("ps-visually-hidden") &&
            rect.width > 2 &&
            rect.height > 2 &&
            rect.bottom >= 0 &&
            rect.right >= 0 &&
            rect.top <= window.innerHeight &&
            rect.left <= window.innerWidth
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label:
              element.getAttribute("aria-label") ||
              element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
              element.tagName.toLowerCase(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });
      const minTarget = isMobile ? 40 : 24;
      const smallTargets = interactive.filter(
        (target) => target.width < minTarget || target.height < minTarget,
      );
      const overflowingControls = [
        ...document.querySelectorAll("button,.ps-btn"),
      ]
        .filter((element) => element.scrollWidth > element.clientWidth + 2)
        .map((element) =>
          (
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.tagName
          )
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 80),
        );
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !element.closest("[hidden],[aria-hidden='true']") &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth
        );
      };
      const textOf = (element) =>
        element?.textContent?.trim().replace(/\s+/g, " ") ?? "";
      const labelText = (label) => {
        const clone = label.cloneNode(true);
        for (const control of clone.querySelectorAll(
          "button,input,select,textarea",
        )) {
          control.remove();
        }
        return textOf(clone);
      };
      const referencedText = (element, attribute) =>
        (element.getAttribute(attribute) ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => textOf(document.getElementById(id)))
          .filter(Boolean)
          .join(" ");
      const controlName = (element) => {
        const labelledBy = referencedText(element, "aria-labelledby");
        if (labelledBy) return labelledBy;
        const aria = element.getAttribute("aria-label")?.trim();
        if (aria) return aria;
        if ("labels" in element && element.labels?.length) {
          return [...element.labels].map(labelText).filter(Boolean).join(" ");
        }
        const title = element.getAttribute("title")?.trim();
        if (title) return title;
        return "";
      };
      const interactiveName = (element) => {
        const fromControl = controlName(element);
        if (fromControl) return fromControl;
        const alt = element.getAttribute("alt")?.trim();
        if (alt) return alt;
        return textOf(element);
      };
      const mainElements = [
        ...new Set([...document.querySelectorAll("main,[role='main']")]),
      ].filter(visible);
      const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
        .filter(visible)
        .map((element) => ({
          level: Number(element.tagName.slice(1)),
          text: textOf(element).slice(0, 80),
        }));
      const headingSkips = [];
      for (let index = 1; index < headings.length; index += 1) {
        const previous = headings[index - 1];
        const current = headings[index];
        if (current.level - previous.level > 1) {
          headingSkips.push(`${previous.text} -> ${current.text}`);
        }
      }
      const formControls = [
        ...document.querySelectorAll("input,select,textarea"),
      ].filter(
        (element) =>
          visible(element) &&
          element.getAttribute("type") !== "hidden" &&
          !element.disabled,
      );
      const unlabeledFormControls = formControls
        .filter((element) => !controlName(element))
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute("type") ?? "",
          placeholder: element.getAttribute("placeholder") ?? "",
        }));
      const namedInteractiveSelector =
        "button,a[href],[role='button'],[role='link'],input,select,textarea";
      const unnamedInteractive = [
        ...document.querySelectorAll(namedInteractiveSelector),
      ]
        .filter((element) => {
          const tag = element.tagName.toLowerCase();
          return (
            visible(element) &&
            !(tag === "input" && element.getAttribute("type") === "hidden") &&
            !element.disabled &&
            !interactiveName(element)
          );
        })
        .map((element) => element.outerHTML.slice(0, 120));
      const missingReferences = [];
      for (const element of document.querySelectorAll(
        "[aria-labelledby],[aria-describedby]",
      )) {
        for (const attribute of ["aria-labelledby", "aria-describedby"]) {
          const value = element.getAttribute(attribute);
          if (!value) continue;
          for (const id of value.split(/\s+/).filter(Boolean)) {
            if (!document.getElementById(id)) {
              missingReferences.push(`${attribute}=${id}`);
            }
          }
        }
      }
      const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
      const rounded = (value) => Math.round(value * 100) / 100;
      const parseAlpha = (part) => {
        if (!part) return 1;
        const trimmed = part.trim();
        if (trimmed.endsWith("%")) {
          return clamp(Number.parseFloat(trimmed) / 100, 0, 1);
        }
        return clamp(Number.parseFloat(trimmed), 0, 1);
      };
      const parseColorParts = (parts, unitIntervalChannels = false) => {
        if (
          parts.length < 3 ||
          parts.slice(0, 3).some((part) => part === "none")
        ) {
          return null;
        }
        const channel = (part) => {
          const trimmed = part.trim();
          if (trimmed.endsWith("%")) {
            return clamp((Number.parseFloat(trimmed) / 100) * 255, 0, 255);
          }
          const value = Number.parseFloat(trimmed);
          return clamp(unitIntervalChannels ? value * 255 : value, 0, 255);
        };
        return {
          r: channel(parts[0]),
          g: channel(parts[1]),
          b: channel(parts[2]),
          a: parseAlpha(parts[3]),
        };
      };
      const parseCssColor = (value) => {
        const color = value.trim().toLowerCase();
        if (!color || color === "transparent") {
          return { r: 0, g: 0, b: 0, a: 0 };
        }
        const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hex) {
          const raw = hex[1];
          const full =
            raw.length === 3
              ? raw
                  .split("")
                  .map((digit) => digit + digit)
                  .join("")
              : raw;
          return {
            r: Number.parseInt(full.slice(0, 2), 16),
            g: Number.parseInt(full.slice(2, 4), 16),
            b: Number.parseInt(full.slice(4, 6), 16),
            a: 1,
          };
        }
        const rgb = color.match(/^rgba?\((.*)\)$/);
        if (rgb) {
          return parseColorParts(
            rgb[1]
              .replace(/\s*\/\s*/g, " ")
              .split(/[\s,]+/)
              .filter(Boolean),
          );
        }
        const srgb = color.match(/^color\(srgb\s+(.*)\)$/);
        if (srgb) {
          return parseColorParts(
            srgb[1]
              .replace(/\s*\/\s*/g, " ")
              .split(/[\s,]+/)
              .filter(Boolean),
            true,
          );
        }
        const oklch = color.match(/^oklch\((.*)\)$/);
        if (oklch) {
          const parts = oklch[1]
            .replace(/\s*\/\s*/g, " ")
            .split(/[\s,]+/)
            .filter(Boolean);
          if (parts.length < 3) return null;
          const lightness = parts[0].endsWith("%")
            ? Number.parseFloat(parts[0]) / 100
            : Number.parseFloat(parts[0]);
          const chroma = parts[1].endsWith("%")
            ? Number.parseFloat(parts[1]) / 100
            : Number.parseFloat(parts[1]);
          const hue = Number.parseFloat(parts[2]);
          if (![lightness, chroma, hue].every(Number.isFinite)) return null;
          return {
            ...oklchToSrgb(lightness, chroma, hue),
            a: parseAlpha(parts[3]),
          };
        }
        return null;
      };
      const oklchToSrgb = (lightness, chroma, hue) => {
        const hueRadians = (hue * Math.PI) / 180;
        const a = chroma * Math.cos(hueRadians);
        const b = chroma * Math.sin(hueRadians);
        const labL = lightness + 0.3963377774 * a + 0.2158037573 * b;
        const labM = lightness - 0.1055613458 * a - 0.0638541728 * b;
        const labS = lightness - 0.0894841775 * a - 1.291485548 * b;
        const l = labL ** 3;
        const m = labM ** 3;
        const s = labS ** 3;
        const linearToSrgb = (channel) => {
          const clamped = clamp(channel, 0, 1);
          return clamped <= 0.0031308
            ? 12.92 * clamped
            : 1.055 * clamped ** (1 / 2.4) - 0.055;
        };
        return {
          r:
            linearToSrgb(
              4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            ) * 255,
          g:
            linearToSrgb(
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            ) * 255,
          b:
            linearToSrgb(
              -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
            ) * 255,
        };
      };
      const composite = (foreground, background) => {
        const alpha = foreground.a + background.a * (1 - foreground.a);
        if (alpha <= 0) return { r: 255, g: 255, b: 255, a: 1 };
        return {
          r:
            (foreground.r * foreground.a +
              background.r * background.a * (1 - foreground.a)) /
            alpha,
          g:
            (foreground.g * foreground.a +
              background.g * background.a * (1 - foreground.a)) /
            alpha,
          b:
            (foreground.b * foreground.a +
              background.b * background.a * (1 - foreground.a)) /
            alpha,
          a: alpha,
        };
      };
      const effectiveBackground = (element) => {
        const stack = [];
        for (let current = element; current; current = current.parentElement) {
          stack.unshift(current);
        }
        let background = { r: 255, g: 255, b: 255, a: 1 };
        for (const current of stack) {
          const color = parseCssColor(
            getComputedStyle(current).backgroundColor,
          );
          if (color && color.a > 0) {
            background = composite(color, background);
          }
        }
        return background;
      };
      const linearChannel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const relativeLuminance = (color) =>
        0.2126 * linearChannel(color.r) +
        0.7152 * linearChannel(color.g) +
        0.0722 * linearChannel(color.b);
      const contrastRatio = (foreground, background) => {
        const foregroundLuminance = relativeLuminance(foreground);
        const backgroundLuminance = relativeLuminance(background);
        const lighter = Math.max(foregroundLuminance, backgroundLuminance);
        const darker = Math.min(foregroundLuminance, backgroundLuminance);
        return (lighter + 0.05) / (darker + 0.05);
      };
      const elementPath = (element) => {
        const id = element.id ? `#${element.id}` : "";
        const className =
          typeof element.className === "string"
            ? `.${element.className
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 3)
                .join(".")}`
            : "";
        return `${element.tagName.toLowerCase()}${id}${className}`;
      };
      const textRects = (node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = [...range.getClientRects()].filter(
          (rect) =>
            rect.width > 1 &&
            rect.height > 1 &&
            rect.bottom >= 0 &&
            rect.right >= 0 &&
            rect.top <= window.innerHeight &&
            rect.left <= window.innerWidth,
        );
        range.detach();
        return rects;
      };
      const contrastSamples = [];
      const lowContrastText = [];
      const textWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const element = node.parentElement;
            const value = node.textContent?.trim().replace(/\s+/g, " ") ?? "";
            if (
              !element ||
              value.length < 2 ||
              !visible(element) ||
              element.closest(
                "script,style,noscript,svg,[hidden],[aria-hidden='true']",
              )
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            return textRects(node).length > 0
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        },
      );
      while (textWalker.nextNode()) {
        const node = textWalker.currentNode;
        const element = node.parentElement;
        const style = getComputedStyle(element);
        const foreground = parseCssColor(style.color);
        const background = effectiveBackground(element);
        if (!foreground || foreground.a <= 0) continue;
        const ratio = contrastRatio(
          composite(foreground, background),
          background,
        );
        const fontSize = Number.parseFloat(style.fontSize) || 16;
        const fontWeight =
          Number.parseInt(style.fontWeight, 10) ||
          (style.fontWeight === "bold" ? 700 : 400);
        const largeText =
          fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const required = largeText ? 3 : 4.5;
        const sample = {
          text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
          ratio: rounded(ratio),
          required,
          path: elementPath(element),
        };
        contrastSamples.push(sample);
        if (ratio + 0.02 < required) {
          lowContrastText.push(sample);
        }
      }
      return {
        title: document.title,
        lang: document.documentElement.lang,
        bodyTextLength: bodyText.length,
        rootChildCount: root?.childElementCount ?? 0,
        rootHeight: Math.round(rootRect?.height ?? 0),
        overflowX,
        smallTargets: smallTargets.slice(0, 8),
        overflowingControls: overflowingControls.slice(0, 8),
        mainCount: mainElements.length,
        h1Texts: headings
          .filter((heading) => heading.level === 1)
          .map((heading) => heading.text),
        headingSkips: headingSkips.slice(0, 8),
        formControlCount: formControls.length,
        unlabeledFormControls: unlabeledFormControls.slice(0, 8),
        unnamedInteractive: unnamedInteractive.slice(0, 8),
        missingReferences: [...new Set(missingReferences)].slice(0, 8),
        contrastSampleCount: contrastSamples.length,
        minTextContrast:
          contrastSamples.length > 0
            ? rounded(
                Math.min(
                  ...contrastSamples.map((sample) => Number(sample.ratio)),
                ),
              )
            : 0,
        lowContrastText: lowContrastText
          .sort((a, b) => a.ratio - b.ratio)
          .slice(0, 8),
        browserErrors: window.__pwaBrowserErrors ?? [],
      };
    },
    { isMobile: viewport.isMobile },
  );

  expect(result.title.length > 0, `${label} must set a document title`);
  expect(
    /^de\b/i.test(result.lang),
    `${label} must declare German document language, got "${result.lang}"`,
  );
  expect(result.bodyTextLength > 40, `${label} must render visible text`);
  expect(result.rootChildCount > 0, `${label} must hydrate #root`);
  expect(result.rootHeight > 100, `${label} root height is unexpectedly small`);
  expect(
    result.mainCount === 1,
    `${label} must expose exactly one visible main landmark, got ${result.mainCount}`,
  );
  expect(
    result.h1Texts.length === 1,
    `${label} must expose exactly one visible h1, got ${JSON.stringify(result.h1Texts)}`,
  );
  expect(
    result.headingSkips.length === 0,
    `${label} has skipped heading levels: ${JSON.stringify(result.headingSkips)}`,
  );
  expect(
    result.unlabeledFormControls.length === 0,
    `${label} has visible form controls without labels: ${JSON.stringify(result.unlabeledFormControls)}`,
  );
  expect(
    result.unnamedInteractive.length === 0,
    `${label} has interactive controls without an accessible name: ${JSON.stringify(result.unnamedInteractive)}`,
  );
  expect(
    result.missingReferences.length === 0,
    `${label} has broken ARIA references: ${JSON.stringify(result.missingReferences)}`,
  );
  expect(
    result.contrastSampleCount > 0,
    `${label} did not expose measurable text contrast samples`,
  );
  expect(
    result.lowContrastText.length === 0,
    `${label} has text below WCAG contrast thresholds: ${JSON.stringify(result.lowContrastText)}`,
  );
  expect(
    result.overflowX <= 2,
    `${label} has body horizontal overflow ${result.overflowX}px`,
  );
  expect(
    result.smallTargets.length === 0,
    `${label} has undersized ${viewport.isMobile ? "touch" : "interactive"} targets: ${JSON.stringify(result.smallTargets)}`,
  );
  expect(
    result.overflowingControls.length === 0,
    `${label} has clipped button/control text: ${JSON.stringify(result.overflowingControls)}`,
  );
  expect(
    result.browserErrors.length === 0,
    `${label} reported browser errors: ${JSON.stringify(result.browserErrors)}`,
  );
  expect(
    runtimeErrors.length === 0,
    `${label} emitted console/runtime errors: ${JSON.stringify(runtimeErrors)}`,
  );

  observations.push(
    `${mode.name}/${viewport.name}${route}: text=${result.bodyTextLength}, overflowX=${result.overflowX}, h1=${result.h1Texts[0]}`,
  );
  return {
    textLength: result.bodyTextLength,
    overflowX: result.overflowX,
    h1: result.h1Texts[0] ?? "",
    formControls: result.formControlCount,
    contrast: {
      samples: result.contrastSampleCount,
      minRatio: result.minTextContrast,
    },
  };
}

async function assertKeyboardNavigation(browser, label) {
  const setup = await browser.evaluate(() => {
    const focusableSelector = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[tabindex]",
      "[role='button']",
      "[role='link']",
    ].join(",");
    const focusable = [...document.querySelectorAll(focusableSelector)].filter(
      (element) => {
        const style = getComputedStyle(element);
        const tabIndex = element.getAttribute("tabindex");
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !element.closest("[hidden],[aria-hidden='true']") &&
          !element.disabled &&
          tabIndex !== "-1"
        );
      },
    );
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    return {
      focusableCount: focusable.length,
      steps: Math.min(8, Math.max(1, focusable.length)),
    };
  });

  expect(
    setup.focusableCount > 0,
    `${label} must expose at least one keyboard-focusable control`,
  );
  const sequence = [];
  for (let index = 0; index < setup.steps; index += 1) {
    await pressTab(browser);
    const focused = await readFocusedElement(browser);
    if (
      ["body", "html"].includes(focused.tag) &&
      sequence.some((entry) => !["body", "html"].includes(entry.tag))
    ) {
      break;
    }
    sequence.push(focused);
  }

  const activeSequence = sequence.filter(
    (entry) => !["body", "html"].includes(entry.tag),
  );
  const failedTargets = activeSequence.filter(
    (entry) => !entry.visible || !entry.hasFocusIndicator,
  );
  const uniqueTargets = new Set(activeSequence.map((entry) => entry.path));

  expect(
    activeSequence.length > 0,
    `${label} keyboard tab order did not reach a focusable control: ${JSON.stringify(sequence)}`,
  );
  expect(
    failedTargets.length === 0,
    `${label} has focused controls without visible focus indication: ${JSON.stringify(failedTargets)}`,
  );
  expect(
    setup.focusableCount <= 1 ||
      activeSequence.length < 2 ||
      uniqueTargets.size >= Math.min(2, activeSequence.length),
    `${label} keyboard focus appears trapped: ${JSON.stringify(activeSequence)}`,
  );

  return {
    focusableCount: setup.focusableCount,
    checked: activeSequence.length,
    sequence: activeSequence
      .map((entry) => entry.label || entry.path)
      .slice(0, 8),
  };
}

async function pressTab(browser) {
  const keyEvent = {
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  };
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    ...keyEvent,
  });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", ...keyEvent });
  await delay(90);
}

async function readFocusedElement(browser) {
  return browser.evaluate(() => {
    const element = document.activeElement;
    const textOf = (target) =>
      target?.textContent?.trim().replace(/\s+/g, " ") ?? "";
    const labelText = (label) => {
      const clone = label.cloneNode(true);
      for (const control of clone.querySelectorAll(
        "button,input,select,textarea",
      )) {
        control.remove();
      }
      return textOf(clone);
    };
    const referencedText = (target, attribute) =>
      (target.getAttribute(attribute) ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => textOf(document.getElementById(id)))
        .filter(Boolean)
        .join(" ");
    const accessibleName = (target) => {
      if (!target) return "";
      const labelledBy = referencedText(target, "aria-labelledby");
      if (labelledBy) return labelledBy;
      const aria = target.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      if ("labels" in target && target.labels?.length) {
        return [...target.labels].map(labelText).filter(Boolean).join(" ");
      }
      const alt = target.getAttribute("alt")?.trim();
      if (alt) return alt;
      const title = target.getAttribute("title")?.trim();
      if (title) return title;
      return textOf(target);
    };
    const pathOf = (target) => {
      if (!target) return "none";
      const id = target.id ? `#${target.id}` : "";
      const className =
        typeof target.className === "string"
          ? `.${target.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
          : "";
      return `${target.tagName.toLowerCase()}${id}${className}`;
    };
    const rect = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    const outlineWidth = Number.parseFloat(style?.outlineWidth ?? "0") || 0;
    const visible =
      Boolean(element) &&
      style?.display !== "none" &&
      style?.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left <= window.innerWidth;
    const hasFocusIndicator =
      Boolean(style) &&
      ((style.outlineStyle !== "none" && outlineWidth > 0) ||
        style.boxShadow !== "none" ||
        style.textDecorationLine.includes("underline"));
    return {
      tag: element?.tagName.toLowerCase() ?? "none",
      label: accessibleName(element).slice(0, 80),
      path: pathOf(element),
      visible,
      hasFocusIndicator,
      width: Math.round(rect?.width ?? 0),
      height: Math.round(rect?.height ?? 0),
    };
  });
}

async function captureScreenshot(browser, mode, viewport, route) {
  const response = await browser.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const buffer = Buffer.from(response.data, "base64");
  expect(
    buffer.byteLength > 3000,
    `${viewport.name} ${route} screenshot is unexpectedly small`,
  );
  const analysis = analyzePngScreenshot(buffer);
  const expectedWidth = viewport.width * viewport.deviceScaleFactor;
  const expectedHeight = viewport.height * viewport.deviceScaleFactor;
  expect(
    analysis.width === expectedWidth,
    `${viewport.name} ${route} screenshot width ${analysis.width}px does not match expected ${expectedWidth}px`,
  );
  expect(
    analysis.height === expectedHeight,
    `${viewport.name} ${route} screenshot height ${analysis.height}px does not match expected ${expectedHeight}px`,
  );
  expect(
    analysis.uniqueSampledColors >= 8 && analysis.luminanceRange >= 24,
    `${viewport.name} ${route} screenshot looks blank: ${JSON.stringify(analysis)}`,
  );
  const file = join(
    evidenceDir,
    `${screenshotPrefix(mode, viewport)}-${slugRoute(route)}.png`,
  );
  await writeFile(file, buffer);
  return analysis;
}

function analyzePngScreenshot(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error("captured screenshot is not a PNG image");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];

  let offset = signature.length;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error(`invalid PNG chunk ${type}`);
    }

    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || idatChunks.length === 0) {
    throw new Error("PNG screenshot is missing IHDR or IDAT data");
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(
      `unsupported PNG screenshot format bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`,
    );
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const expectedLength = height * (rowBytes + 1);
  if (inflated.length < expectedLength) {
    throw new Error(
      `PNG screenshot pixel data is truncated: ${inflated.length} < ${expectedLength}`,
    );
  }

  const previous = Buffer.alloc(rowBytes);
  const current = Buffer.alloc(rowBytes);
  const colorSamples = new Set();
  const sampleEvery = Math.max(1, Math.floor((width * height) / 50000));
  let sourceOffset = 0;
  let minLuminance = 255;
  let maxLuminance = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = sourceOffset;
    sourceOffset += rowBytes;

    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[rowStart + x];
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      current[x] = (raw + pngFilterDelta(filter, left, up, upLeft)) & 0xff;
    }

    for (let x = 0; x < rowBytes; x += bytesPerPixel) {
      const pixelIndex = y * width + x / bytesPerPixel;
      if (pixelIndex % sampleEvery !== 0) continue;
      const red = current[x];
      const green = current[x + 1];
      const blue = current[x + 2];
      const luminance = Math.round(
        (red * 299 + green * 587 + blue * 114) / 1000,
      );
      minLuminance = Math.min(minLuminance, luminance);
      maxLuminance = Math.max(maxLuminance, luminance);
      if (colorSamples.size < 256) {
        colorSamples.add(`${red},${green},${blue}`);
      }
    }

    previous.set(current);
  }

  return {
    width,
    height,
    uniqueSampledColors: colorSamples.size,
    luminanceRange: maxLuminance - minLuminance,
  };
}

function pngFilterDelta(filter, left, up, upLeft) {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return Math.floor((left + up) / 2);
    case 4:
      return paethPredictor(left, up, upLeft);
    default:
      throw new Error(`unsupported PNG row filter ${filter}`);
  }
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

async function navigate(browser, url) {
  const loaded = browser.waitForEvent("Page.loadEventFired", 8000);
  await browser.send("Page.navigate", { url });
  await loaded;
  await delay(350);
}

async function reload(browser) {
  const loaded = browser.waitForEvent("Page.loadEventFired", 8000);
  await browser.send("Page.reload");
  await loaded;
  await delay(350);
}

async function waitForHydration(browser, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = await browser.evaluate(() => {
      const root = document.querySelector("#root");
      return Boolean(
        root?.childElementCount && document.body.innerText.trim().length > 20,
      );
    });
    if (result === true) return;
    await delay(150);
  }
  throw new Error(`${label} did not hydrate in time`);
}

async function connectToBrowser(debugPort, chromeLogs) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const version = await fetchJson(
        `http://127.0.0.1:${debugPort}/json/version`,
      );
      if (version.webSocketDebuggerUrl) {
        return createPageConnection(version.webSocketDebuggerUrl);
      }
    } catch {
      // Chrome opens the debugging endpoint shortly after the process starts.
    }
    const loggedUrl = chromeLogs
      .join("")
      .match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (loggedUrl) {
      return createPageConnection(loggedUrl);
    }
    await delay(250);
  }
  throw new Error("Chrome DevTools endpoint did not become available");
}

async function createPageConnection(webSocketDebuggerUrl) {
  const connection = new CdpConnection(webSocketDebuggerUrl);
  const { targetId } = await connection.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await connection.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  return new CdpPage(connection, sessionId);
}

function CdpPage(connection, sessionId) {
  this.connection = connection;
  this.sessionId = sessionId;
  this.send = (method, params = {}) =>
    this.connection.send(method, params, this.sessionId);
  this.evaluate = (expression, argument) =>
    this.connection.evaluate(expression, argument, this.sessionId);
  this.on = (event, listener) => this.connection.on(event, listener);
  this.waitForEvent = (event, timeoutMs) =>
    this.connection.waitForEvent(event, timeoutMs);
  this.close = () => this.connection.close();
}

CdpPage.prototype.send = function send(method, params = {}) {
  return this.connection.send(method, params, this.sessionId);
};

CdpPage.prototype.evaluate = function evaluate(expression, argument) {
  return this.connection.evaluate(expression, argument, this.sessionId);
};

CdpPage.prototype.on = function on(event, listener) {
  this.connection.on(event, listener);
};

CdpPage.prototype.waitForEvent = function waitForEvent(event, timeoutMs) {
  return this.connection.waitForEvent(event, timeoutMs);
};

CdpPage.prototype.close = function close() {
  this.connection.close();
};

function CdpConnection(url) {
  this.socket = new WebSocket(url);
  this.nextId = 1;
  this.pending = new Map();
  this.listeners = new Map();
  this.ready = new Promise((resolve, reject) => {
    this.socket.addEventListener("open", resolve, { once: true });
    this.socket.addEventListener("error", reject, { once: true });
  });
  this.socket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id) {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) {
        pending.reject(new Error(data.error.message));
      } else {
        pending.resolve(data.result);
      }
      return;
    }
    const listeners = this.listeners.get(data.method) ?? [];
    for (const listener of listeners) listener(data.params ?? {});
  });
  this.send = async (method, params = {}, sessionId) => {
    await this.ready;
    const id = this.nextId++;
    const message = JSON.stringify({
      id,
      method,
      params,
      ...(sessionId ? { sessionId } : {}),
    });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(message);
    });
  };
  this.evaluate = async (expression, argument, sessionId) => {
    const source =
      typeof expression === "function"
        ? `(${expression})(${JSON.stringify(argument)})`
        : expression;
    const result = await this.send(
      "Runtime.evaluate",
      {
        expression: source,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.text ?? "Runtime.evaluate failed",
      );
    }
    return result.result.value;
  };
  this.on = (event, listener) => {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  };
  this.waitForEvent = (event, timeoutMs) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timed out waiting for ${event}`));
      }, timeoutMs);
      const listener = (payload) => {
        clearTimeout(timer);
        const listeners = this.listeners.get(event) ?? [];
        this.listeners.set(
          event,
          listeners.filter((candidate) => candidate !== listener),
        );
        resolve(payload);
      };
      this.on(event, listener);
    });
  this.close = () => this.socket.close();
}

CdpConnection.prototype.send = async function send(
  method,
  params = {},
  sessionId,
) {
  await this.ready;
  const id = this.nextId++;
  const message = JSON.stringify({
    id,
    method,
    params,
    ...(sessionId ? { sessionId } : {}),
  });
  return new Promise((resolve, reject) => {
    this.pending.set(id, { resolve, reject });
    this.socket.send(message);
  });
};

CdpConnection.prototype.evaluate = async function evaluate(
  expression,
  argument,
  sessionId,
) {
  const source =
    typeof expression === "function"
      ? `(${expression})(${JSON.stringify(argument)})`
      : expression;
  const result = await this.send(
    "Runtime.evaluate",
    {
      expression: source,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
  }
  return result.result.value;
};

CdpConnection.prototype.on = function on(event, listener) {
  const listeners = this.listeners.get(event) ?? [];
  listeners.push(listener);
  this.listeners.set(event, listeners);
};

CdpConnection.prototype.waitForEvent = function waitForEvent(event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (payload) => {
      clearTimeout(timer);
      const listeners = this.listeners.get(event) ?? [];
      this.listeners.set(
        event,
        listeners.filter((candidate) => candidate !== listener),
      );
      resolve(payload);
    };
    this.on(event, listener);
  });
};

CdpConnection.prototype.close = function close() {
  this.socket.close();
};

function findChrome() {
  if (process.env["CHROME_BIN"] && existsSync(process.env["CHROME_BIN"])) {
    return process.env["CHROME_BIN"];
  }
  const absoluteCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of absoluteCandidates) {
    if (existsSync(candidate)) return candidate;
  }
  for (const command of [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ]) {
    const found = spawnSync("sh", ["-c", `command -v ${command}`], {
      encoding: "utf8",
    }).stdout.trim();
    if (found) return found;
  }
  return "";
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/livez`);
      if (response.ok) return;
    } catch {
      // Retry until the server has bound the port.
    }
    await delay(250);
  }
  throw new Error("server did not become ready for the PWA browser check");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function formatConsoleArgs(args = []) {
  return args
    .map((arg) => arg.value ?? arg.description ?? arg.type ?? "")
    .join(" ")
    .trim();
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function collectLogs(child) {
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return logs;
}

async function findOpenPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (typeof address === "object" && address?.port) return address.port;
  throw new Error("could not allocate a local port");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2000).then(() => child.kill("SIGKILL")),
  ]);
}

function slugRoute(route) {
  return route
    .replace(/^\/$/, "root")
    .replace(/^\//, "")
    .replace(/[^\w-]+/g, "-");
}

function screenshotPrefix(mode, viewport) {
  return mode.name === "standard"
    ? viewport.name
    : `${mode.name}-${viewport.name}`;
}

function display(path) {
  return path.replace(`${root}/`, "");
}
