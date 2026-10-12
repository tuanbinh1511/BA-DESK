import { useCallback, useEffect, useRef, useState } from "react";
import { api, setAccountRevision } from "../services/api";
import { loadDemo } from "../services/demo";
import type { Workspace } from "../types";
import { today } from "../utils/dates";

export function useWorkspace(day: string) {
  const [workspace, setWorkspace] = useState<Workspace>(loadDemo);
  const [serverAvailable, setServerAvailable] = useState(true);
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
      try {
        const data = await api<Workspace>(`/state?day=${requestedDay}`);
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
        setServerAvailable(true);
        if (data.mode !== "demo" || data.connected) setWorkspace(data);
      } catch {
        if (ticket === latestRequest.current) setServerAvailable(false);
      }
    },
    [day],
  );

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refresh]);

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
    desktopEnabled,
    enableDesktop,
  };
}
