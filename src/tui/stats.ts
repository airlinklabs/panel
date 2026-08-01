import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, statfsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import crypto from "node:crypto";

const TUI_DIR = __dirname;
const DB_PATH = process.env.AIRLINK_DB_PATH ?? `${TUI_DIR}/../../../storage/dev.db`;
const LOG_DIR = process.env.AIRLINK_LOG_DIR ?? `${TUI_DIR}/../../logs`;
export const PANEL_URL = process.env.AIRLINK_PANEL_URL ?? "http://127.0.0.1:3000";

let db: Database | null | undefined;
function openDb(): Database | null {
  if (db === undefined) {
    db = null;
    if (existsSync(DB_PATH)) {
      try {
        db = new Database(DB_PATH, { readonly: true });
      } catch {
        db = null;
      }
    }
  }
  return db;
}

export interface Stats {
  panelOnline: boolean;
  panelPid: number | null;
  panelUptimeSec: number | null;
  daemonOnline: boolean;
  daemonName: string | null;
  serverName: string | null;
  serverOnline: boolean | null;
  serverExists: boolean | null;
  users: number | null;
  sessions: number | null;
  logins24h: number | null;
  cpu: number | null;
  memUsedGb: number | null;
  memTotalGb: number | null;
  swapUsedGb: number | null;
  swapTotalGb: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  load: string;
  sysUptimeSec: number;
  errors24h: number | null;
  logBytes: number;
  dbBytes: number | null;
  nets: { iface: string; rxBps: number; txBps: number }[];
  daemonRttMs: number | null;
  panelRttMs: number | null;
  apiSuccessRate: number | null;
  nodeAddr: string | null;
  nodePort: number | null;
  nodeKeyPrefix: string | null;
  lastDaemonCheckAtMs: number | null;
}

interface CpuSample {
  total: number;
  idle: number;
}

interface NodeRow {
  name: string;
  address: string;
  port: number;
  key: string;
}

let prevCpu: CpuSample | null = null;
let prevNet: { time: number; byIface: Map<string, { rx: number; tx: number }> } | null = null;

function readCpu(): CpuSample {
  const parts = (readFileSync("/proc/stat", "utf8").split("\n")[0] ?? "").split(/\s+/).slice(1).map(Number);
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
  return { total: parts.reduce((a, b) => a + b, 0), idle };
}

function readMem(): { totalKb: number; availKb: number; swapTotalKb: number; swapFreeKb: number } {
  const text = readFileSync("/proc/meminfo", "utf8");
  const get = (key: string) => {
    const m = text.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
    return m ? Number(m[1]) : 0;
  };
  return {
    totalKb: get("MemTotal"),
    availKb: get("MemAvailable"),
    swapTotalKb: get("SwapTotal"),
    swapFreeKb: get("SwapFree"),
  };
}

function readNetDev(now: number): { iface: string; rxBps: number; txBps: number }[] {
  let text = "";
  try {
    text = readFileSync("/proc/net/dev", "utf8");
  } catch {
    return [];
  }
  const cur = new Map<string, { rx: number; tx: number }>();
  for (const line of text.split("\n").slice(2)) {
    const [head, rest] = line.split(":");
    const iface = head?.trim();
    if (!iface || iface === "lo") continue;
    const nums = rest?.trim().split(/\s+/).map(Number) ?? [];
    cur.set(iface, { rx: nums[0] ?? 0, tx: nums[8] ?? 0 });
  }
  const out: { iface: string; rxBps: number; txBps: number }[] = [];
  if (prevNet) {
    const dt = (now - prevNet.time) / 1000;
    for (const [iface, v] of cur) {
      const p = prevNet.byIface.get(iface);
      if (!p || dt <= 0) continue;
      const rxBps = Math.max(0, (v.rx - p.rx) / dt);
      const txBps = Math.max(0, (v.tx - p.tx) / dt);
      if (rxBps > 0 || txBps > 0) out.push({ iface, rxBps, txBps });
    }
  }
  prevNet = { time: now, byIface: cur };
  out.sort((a, b) => b.rxBps + b.txBps - (a.rxBps + a.txBps));
  return out.slice(0, 2);
}

export async function measureRtt(url: string, ms: number): Promise<number | null> {
  try {
    const started = Date.now();
    await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(ms) });
    return Date.now() - started;
  } catch {
    return null;
  }
}

function hmacSign(key: string, method: string, path: string, body: string, timestamp: number, nonce: string): string {
  const payload = `${timestamp}:${nonce}:${method.toUpperCase()}:${path}:${body}`;
  return crypto.createHmac("sha256", key).update(payload).digest("hex");
}

export async function probe(url: string, ms: number): Promise<boolean> {
  try {
    await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(ms) });
    return true;
  } catch {
    return false;
  }
}

export function panelPid(): { pid: number | null; uptimeSec: number | null } {
  const sysUptime = Number(readFileSync("/proc/uptime", "utf8").split(" ")[0]);
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const cmdline = readFileSync(`/proc/${entry}/cmdline`, "utf8");
      if (!cmdline.includes("dist/app.js")) continue;
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      const startJiffies = Number(stat.split(" ")[21]);
      return { pid: Number(entry), uptimeSec: Math.floor(sysUptime - startJiffies / 100) };
    } catch {
      /* process may have exited */
    }
  }
  return { pid: null, uptimeSec: null };
}

function countErrors24h(): number {
  const path = `${LOG_DIR}/combined.log`;
  if (!existsSync(path)) return 0;
  const size = statSync(path).size;
  const chunk = size > 524288 ? 524288 : size;
  const fd = openSync(path, "r");
  let text = "";
  try {
    const buf = Buffer.alloc(chunk);
    readSync(fd, buf, 0, chunk, size - chunk);
    text = buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
  const cutoff = Date.now() - 86_400_000;
  let count = 0;
  const re = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/g;
  let m: RegExpExecArray | null;
  let lastIdx = 0;
  while ((m = re.exec(text)) !== null) {
    const ts = Date.parse(m[1] + "Z");
    if (Number.isNaN(ts)) continue;
    if (ts >= cutoff) {
      const line = text.slice(lastIdx, m.index);
      if (/ERROR|Error/.test(line)) count++;
      lastIdx = m.index;
    }
  }
  return count;
}

async function daemonStatus(): Promise<{
  online: boolean;
  name: string | null;
  serverName: string | null;
  serverOnline: boolean | null;
  serverExists: boolean | null;
  daemonRttMs: number | null;
  nodeAddr: string | null;
  nodePort: number | null;
  nodeKeyPrefix: string | null;
  lastDaemonCheckAtMs: number | null;
}> {
  const database = openDb();
  const empty = {
    online: false,
    name: null,
    serverName: null,
    serverOnline: null,
    serverExists: null,
    daemonRttMs: null,
    nodeAddr: null,
    nodePort: null,
    nodeKeyPrefix: null,
    lastDaemonCheckAtMs: null,
  } as const;
  if (!database) return { ...empty };
  let node: NodeRow | undefined;
  try {
    const row = database.query("SELECT name, address, port, key FROM Node LIMIT 1").get() as
      | { name: unknown; address: unknown; port: unknown; key: unknown }
      | undefined;
    if (!row) return { ...empty };
    node = {
      name: String(row.name ?? ""),
      address: String(row.address ?? ""),
      port: Number(row.port ?? 0),
      key: String(row.key ?? ""),
    };
  } catch {
    return { ...empty };
  }
  if (!node) return { ...empty };
  const checkedAt = Date.now();
  const rttPromise = node.address ? measureRtt(`http://${node.address}:${node.port}/healthz`, 1500) : Promise.resolve(null);
  let server: { name: unknown; UUID: unknown } | undefined;
  try {
    server = database.query("SELECT name, UUID FROM Server LIMIT 1").get() as
      | { name: unknown; UUID: unknown }
      | undefined;
  } catch {
    /* no servers table */
  }
  if (!server) {
    const daemonRttMs = await rttPromise;
    return {
      online: true,
      name: node.name,
      serverName: null,
      serverOnline: null,
      serverExists: null,
      daemonRttMs,
      nodeAddr: node.address,
      nodePort: node.port,
      nodeKeyPrefix: node.key.slice(0, 4),
      lastDaemonCheckAtMs: checkedAt,
    };
  }
  const path = `/container/status?id=${server.UUID}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");
  const signature = hmacSign(node.key, "GET", path.split("?")[0] ?? "", "", timestamp, nonce);
  try {
    const res = await fetch(`http://${node.address}:${node.port}${path}`, {
      signal: AbortSignal.timeout(2500),
      headers: {
        "X-Airlink-Timestamp": String(timestamp),
        "X-Airlink-Signature": signature,
        "X-Airlink-Nonce": nonce,
        "X-Airlink-Payload-Version": "1",
        Authorization: "Basic " + Buffer.from(`Airlink:${node.key}`).toString("base64"),
      },
    });
    const daemonRttMs = await rttPromise;
    if (res.status === 200) {
      const data = (await res.json().catch(() => null)) as { running?: unknown; exists?: unknown } | null;
      return {
        online: true,
        name: node.name,
        serverName: String(server.name ?? ""),
        serverOnline: data?.running === true,
        serverExists: data?.exists === true,
        daemonRttMs,
        nodeAddr: node.address,
        nodePort: node.port,
        nodeKeyPrefix: node.key.slice(0, 4),
        lastDaemonCheckAtMs: checkedAt,
      };
    }
    return {
      online: true,
      name: node.name,
      serverName: String(server.name ?? ""),
      serverOnline: null,
      serverExists: null,
      daemonRttMs,
      nodeAddr: node.address,
      nodePort: node.port,
      nodeKeyPrefix: node.key.slice(0, 4),
      lastDaemonCheckAtMs: checkedAt,
    };
  } catch {
    const daemonRttMs = await rttPromise;
    return {
      online: false,
      name: node.name,
      serverName: String(server.name ?? ""),
      serverOnline: null,
      serverExists: null,
      daemonRttMs,
      nodeAddr: node.address,
      nodePort: node.port,
      nodeKeyPrefix: node.key.slice(0, 4),
      lastDaemonCheckAtMs: checkedAt,
    };
  }
}

export async function collectStats(): Promise<Stats> {
  const database = openDb();
  const now = Date.now();
  const cpuNow = readCpu();
  let cpu: number | null = null;
  if (prevCpu && cpuNow.total > prevCpu.total) {
    const deltaTotal = cpuNow.total - prevCpu.total;
    cpu = deltaTotal > 0 ? Math.round(((deltaTotal - (cpuNow.idle - prevCpu.idle)) / deltaTotal) * 100) : 0;
  }
  prevCpu = cpuNow;

  const mem = readMem();
  const disk = statfsSync("/");
  const load = readFileSync("/proc/loadavg", "utf8").split(" ").slice(0, 3).join(" ");
  const sysUptimeSec = Math.floor(Number(readFileSync("/proc/uptime", "utf8").split(" ")[0]));

  const [panelOnline, daemon, pid, panelRttMs] = await Promise.all([
    probe(PANEL_URL, 1500),
    daemonStatus(),
    Promise.resolve(panelPid()),
    measureRtt(PANEL_URL, 1500),
  ]);
  const nets = readNetDev(now);

  let users: number | null = null;
  let sessions: number | null = null;
  let logins24h: number | null = null;
  let dbBytes: number | null = null;
  if (database) {
    try {
      users = (database.query("SELECT COUNT(*) AS c FROM Users").get() as any).c;
      sessions = (database.query("SELECT COUNT(*) AS c FROM Session WHERE expires > datetime('now')").get() as any).c;
      logins24h = (database.query("SELECT COUNT(*) AS c FROM LoginHistory WHERE timestamp > datetime('now', '-1 day')").get() as any).c;
    } catch {
      /* tables may not exist yet */
    }
    try {
      dbBytes = statSync(DB_PATH).size;
    } catch {
      /* DB vanished */
    }
  }

  let logBytes = 0;
  for (const name of ["combined.log", "error.log"]) {
    try {
      logBytes += statSync(`${LOG_DIR}/${name}`).size;
    } catch {
      /* not yet created */
    }
  }

  const errors24h = countErrors24h();
  let apiSuccessRate: number | null = null;
  if (logins24h !== null) {
    const total = logins24h + errors24h;
    if (total > 0) apiSuccessRate = Math.round((logins24h / total) * 1000) / 10;
  }

  return {
    panelOnline,
    panelPid: pid.pid,
    panelUptimeSec: pid.uptimeSec,
    daemonOnline: daemon.online,
    daemonName: daemon.name,
    serverName: daemon.serverName,
    serverOnline: daemon.serverOnline,
    serverExists: daemon.serverExists,
    users,
    sessions,
    logins24h,
    cpu,
    memUsedGb: mem.totalKb ? Number(((mem.totalKb - mem.availKb) / 1048576).toFixed(1)) : null,
    memTotalGb: mem.totalKb ? Number((mem.totalKb / 1048576).toFixed(1)) : null,
    swapUsedGb: mem.swapTotalKb ? Number(((mem.swapTotalKb - mem.swapFreeKb) / 1048576).toFixed(1)) : null,
    swapTotalGb: mem.swapTotalKb ? Number((mem.swapTotalKb / 1048576).toFixed(1)) : null,
    diskUsedGb: Number(((disk.blocks - disk.bavail) * disk.bsize / 2 ** 30).toFixed(1)),
    diskTotalGb: Number((disk.blocks * disk.bsize / 2 ** 30).toFixed(1)),
    load,
    sysUptimeSec,
    errors24h,
    logBytes,
    dbBytes,
    nets,
    daemonRttMs: daemon.daemonRttMs,
    panelRttMs,
    apiSuccessRate,
    nodeAddr: daemon.nodeAddr,
    nodePort: daemon.nodePort,
    nodeKeyPrefix: daemon.nodeKeyPrefix,
    lastDaemonCheckAtMs: daemon.lastDaemonCheckAtMs,
  };
}
