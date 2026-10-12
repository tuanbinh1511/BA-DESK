import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, ApiError, getConnectionStatus, subscribeConnection, setConnectionStatus, setAccountRevision } from "../services/api";
import { emptyWorkspace, loadDemo } from "../services/demo";
import type { Workspace } from "../types";
import { today } from "../utils/dates";

export function useWorkspace(day: string) {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const connection = useSyncExternalStore(subscribeConnection, getConnectionStatus);
  const serverAvailable = connection === "connected";
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const loaded = useRef(false);
  const failures = useRef(0);
  const currentDay = useRef(day);
  currentDay.current = day;
  const latestRequest = useRef(0);
  const revision = useRef(0);
  const notificationAccount = useRef(0);
  const seenNotifications = useRef(new Set<string>());
  const notificationsInitialized = useRef(false);
  const [desktopEnabled, setDesktopEnabled] = useState(
    () => localStorage.getItem("ba-desk-desktop") === "true",
  );

  const refresh = useCallback(
    async (requestedDay = day) => {
      const ticket = ++latestRequest.current;
      if (!navigator.onLine) { setConnectionStatus("offline"); return; }
      try {
        const data = await api<Workspace>(`/state?day=${requestedDay}`);
        if (!navigator.onLine) return;
        if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.messages) ||
            !Number.isInteger(data.accountRevision) || !data.settings || !data.ai || !data.sync)
          throw new ApiError("Dữ liệu không hợp lệ.", 502);
        if (
          requestedDay !== currentDay.current ||
          data.accountRevision < revision.current
        )
          return;
        if (
          ticket < latestRequest.current &&
          data.accountRevision === revision.current
        )
          return;
        revision.current = data.accountRevision;
        setAccountRevision(data.accountRevision);
        failures.current = 0;
        setConnectionStatus("connected");
        setLastUpdatedAt(new Date().toISOString());
        if (data.mode !== "demo" || data.connected) setWorkspace(data);
        else if (!loaded.current) setWorkspace(loadDemo());
        loaded.current = true;
      } catch (error) {
        if (ticket !== latestRequest.current || requestedDay !== currentDay.current) return;
        failures.current += 1;
        const forbidden = error instanceof ApiError && [401, 403].includes(error.status);
        setConnectionStatus(forbidden ? "forbidden" : "offline");
        if (forbidden) {
          setWorkspace(emptyWorkspace());
          loaded.current = false;
          setLastUpdatedAt(null);
        }
      }
    },
    [day],
  );

  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer: number | undefined;
    async function poll() {
      if (stopped || running || document.hidden || !navigator.onLine) return;
      window.clearTimeout(timer);
      running = true;
      try { await refresh(); }
      finally {
        running = false;
        if (!stopped && !document.hidden && navigator.onLine)
          timer = window.setTimeout(() => void poll(), Math.min(30_000, 5_000 * 2 ** Math.min(failures.current, 3)));
      }
    }
    function wake() {
      window.clearTimeout(timer);
      if (!document.hidden) void poll();
    }
    function offline() {
      window.clearTimeout(timer);
      setConnectionStatus("offline");
    }
    void poll();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("offline", offline);
    return () => {
      stopped = true;
      latestRequest.current += 1;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("offline", offline);
    };
  }, [refresh]);

  useEffect(() => {
    if (connection === "forbidden") {
      setWorkspace(emptyWorkspace());
      loaded.current = false;
      setLastUpdatedAt(null);
    }
  }, [connection]);

  useEffect(() => {
    if (workspace.mode === "demo")
      localStorage.setItem(
        "ba-desk-demo",
        JSON.stringify({ day: today(), workspace }),
      );
    if (notificationAccount.current !== workspace.accountRevision) {
      seenNotifications.current.clear();
      notificationsInitialized.current = false;
      notificationAccount.current = workspace.accountRevision;
    }
    for (const notice of workspace.notifications) {
      if (
        notificationsInitialized.current &&
        !seenNotifications.current.has(notice.id) &&
        !notice.read &&
        desktopEnabled &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification(notice.title, {
          body: notice.body,
          icon: "/favicon.svg",
          tag: notice.id,
        });
      }
      seenNotifications.current.add(notice.id);
    }
    notificationsInitialized.current = true;
  }, [workspace, desktopEnabled]);

  function enableDesktop(enabled: boolean) {
    setDesktopEnabled(enabled);
    localStorage.setItem("ba-desk-desktop", String(enabled));
  }

  return {
    workspace,
    setWorkspace,
    refresh,
    serverAvailable,
    connection,
    lastUpdatedAt,
    desktopEnabled,
    enableDesktop,
  };
}
