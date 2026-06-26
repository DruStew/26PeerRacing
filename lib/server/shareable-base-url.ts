import "server-only";

import { networkInterfaces } from "os";

function isIPv4(family: string | number): boolean {
  return family === "IPv4" || family === 4;
}

/** Non-loopback IPv4 addresses on this machine, Wi‑Fi/Ethernet first. */
export function getLocalLanIPv4Addresses(): string[] {
  const nets = networkInterfaces();
  const preferred: string[] = [];
  const other: string[] = [];
  const preferAdapter = /wi-?fi|wlan|ethernet/i;

  for (const [name, addrs] of Object.entries(nets)) {
    for (const net of addrs ?? []) {
      if (!isIPv4(net.family) || net.internal) continue;
      if (preferAdapter.test(name)) preferred.push(net.address);
      else other.push(net.address);
    }
  }

  return [...new Set([...preferred, ...other])];
}

/** First LAN IPv4 (Wi‑Fi/Ethernet preferred). */
export function getLocalLanIPv4(): string | null {
  return getLocalLanIPv4Addresses()[0] ?? null;
}

function parseHostHeader(hostHeader: string): { hostname: string; port: string } {
  const host = hostHeader.split(",")[0]?.trim() ?? "";
  if (!host) return { hostname: "", port: "" };
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return { hostname: host, port: "" };
    const hostname = host.slice(0, end + 1);
    const port = host.slice(end + 1).startsWith(":") ? host.slice(end + 2) : "";
    return { hostname, port };
  }
  const colon = host.lastIndexOf(":");
  if (colon > -1 && host.indexOf(":") === colon) {
    return { hostname: host.slice(0, colon), port: host.slice(colon + 1) };
  }
  return { hostname: host, port: "" };
}

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/**
 * Base URL for links shared to other devices (kiosk tablets on the LAN).
 * Uses APP_PUBLIC_URL when set; otherwise replaces localhost with this machine's LAN IP.
 */
export function resolveShareableBaseUrl(hostHeader: string, proto: string): string {
  const fromEnv = process.env.APP_PUBLIC_URL?.trim() || process.env.KIOSK_PUBLIC_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  const { hostname, port } = parseHostHeader(hostHeader);
  if (!hostname) return "";

  const scheme = proto || "http";
  const portSuffix = port ? `:${port}` : "";

  if (isLoopbackHostname(hostname)) {
    const lan = getLocalLanIPv4();
    if (lan) {
      return `${scheme}://${lan}${portSuffix}`;
    }
  }

  return `${scheme}://${hostname}${portSuffix}`;
}

/** All shareable kiosk base URLs (one per detected LAN IP when on localhost). */
export function resolveShareableBaseUrls(hostHeader: string, proto: string): string[] {
  const fromEnv = process.env.APP_PUBLIC_URL?.trim() || process.env.KIOSK_PUBLIC_BASE_URL?.trim();
  if (fromEnv) {
    return [fromEnv.replace(/\/$/, "")];
  }

  const { hostname, port } = parseHostHeader(hostHeader);
  if (!hostname) return [];

  const scheme = proto || "http";
  const portSuffix = port ? `:${port}` : "";

  if (isLoopbackHostname(hostname)) {
    const lanIps = getLocalLanIPv4Addresses();
    if (lanIps.length > 0) {
      return lanIps.map((ip) => `${scheme}://${ip}${portSuffix}`);
    }
  }

  return [`${scheme}://${hostname}${portSuffix}`];
}
