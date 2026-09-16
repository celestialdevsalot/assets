const PRIMARY_SRC = "//sx.peccaryentraps.com/sZrrz4dWAdZ5GatZ/147094";
const FALLBACK_POPUNDER_SRC = "//iw.maomaoschout.com/rXquNB8plNX/147093";
const SMARTLINK_URL = "https://hai8g.com/4/11651656";

const WINDOW_MS = 90_000;
const MAX_OPENS_PER_WINDOW = 2;
const SECOND_OPEN_DELAY_MS = 30_000;
const PROBE_TIMEOUT_MS = 6000;

let installed = false;
let popunderBound = false;
let probeStarted = false;
let laneGeneration = 0;
let clickHandler = null;

const popunder = {
  windowStart: Date.now(),
  opensInWindow: 0,
  lastOpenAt: 0,
};

function injectScript(src) {
  if (document.querySelector(`script[data-celestial-ad="${src}"]`)) return;
  const script = document.createElement("script");
  script.dataset.celestialAd = src;
  script.dataset.cfasync = "false";
  script.async = true;
  script.type = "text/javascript";
  script.src = src;
  (document.body ?? document.documentElement).appendChild(script);
}

function removeScript(src) {
  document.querySelector(`script[data-celestial-ad="${src}"]`)?.remove();
}

async function smartlinkReachable(url) {
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

function openPopunder(url) {
  const pop = window.open(url, "_blank", "noopener,noreferrer");
  if (!pop) return;
  try {
    pop.blur();
  } catch {}
  try {
    window.focus();
  } catch {}
}

function installSmartlinkPopunder(url) {
  if (popunderBound) return;
  popunderBound = true;

  const onClick = () => {
    const now = Date.now();
    if (now - popunder.windowStart >= WINDOW_MS) {
      popunder.windowStart = now;
      popunder.opensInWindow = 0;
      popunder.lastOpenAt = 0;
    }
    if (popunder.opensInWindow >= MAX_OPENS_PER_WINDOW) return;
    if (popunder.opensInWindow === 1 && now - popunder.lastOpenAt < SECOND_OPEN_DELAY_MS) return;
    popunder.opensInWindow += 1;
    popunder.lastOpenAt = now;
    openPopunder(url);
  };

  clickHandler = onClick;
  document.addEventListener("click", onClick, true);
}

function startPopunderLane() {
  if (probeStarted) return;
  probeStarted = true;
  const generation = laneGeneration;
  void (async () => {
    if (await smartlinkReachable(SMARTLINK_URL)) {
      if (generation !== laneGeneration) return;
      installSmartlinkPopunder(SMARTLINK_URL);
      return;
    }
    if (generation !== laneGeneration) return;
    injectScript(FALLBACK_POPUNDER_SRC);
  })();
}

export function uninstallAds() {
  laneGeneration += 1;
  removeScript(PRIMARY_SRC);
  removeScript(FALLBACK_POPUNDER_SRC);
  if (clickHandler) {
    document.removeEventListener("click", clickHandler, true);
    clickHandler = null;
  }
  popunderBound = false;
  probeStarted = false;
  installed = false;
  popunder.windowStart = Date.now();
  popunder.opensInWindow = 0;
  popunder.lastOpenAt = 0;
}

export function installAds() {
  if (window.location.href.includes("localhost")) return;
  if (installed) return;
  installed = true;

  injectScript(PRIMARY_SRC);
  startPopunderLane();
}
