import { useEffect, useState } from 'react';
import type { HiveDesktopBridge, HostInfo, LanServerInfo } from '@hive/protocol';
import { useNet } from '../net/store';

declare global {
  interface Window {
    hiveDesktop?: HiveDesktopBridge;
  }
}

/** Present only inside the Hive Pro desktop app. */
export const desktop: HiveDesktopBridge | undefined = typeof window !== 'undefined' ? window.hiveDesktop : undefined;

/** This computer's hosting info (LAN addresses, internet tunnel), when running the desktop app at home. */
export function useHostInfo(): HostInfo | null {
  const [info, setInfo] = useState<HostInfo | null>(null);
  useEffect(() => {
    if (!desktop?.isHome) return;
    desktop.getInfo().then(setInfo);
    return desktop.onInfo(setInfo);
  }, []);
  return info;
}

/** Other Hive Pro hosts announcing themselves on the local network. */
export function useLanServers(): LanServerInfo[] {
  const [list, setList] = useState<LanServerInfo[]>([]);
  useEffect(() => {
    if (!desktop) return;
    desktop.listLan().then(setList);
    return desktop.onLan(setList);
  }, []);
  return list;
}

/**
 * Base address friends should use to reach this server: the internet tunnel when
 * active, otherwise the LAN address (a "localhost" link is useless to others).
 */
export function useShareBase(): string {
  const info = useHostInfo();
  const serverUrl = useNet((s) => s.serverUrl);
  // In the mobile app the page is local; friends need the host's address.
  if (serverUrl) return serverUrl;
  if (info?.tunnel.status === 'on') return info.tunnel.url;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && info?.lanUrls[0]) return info.lanUrls[0];
  return location.origin;
}

export const copyText = async (text: string): Promise<void> => {
  if (desktop) return desktop.copy(text);
  await navigator.clipboard?.writeText(text);
};
