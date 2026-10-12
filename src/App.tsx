import { flushSync } from "react-dom";
import { GroupsPage } from "./pages/GroupsPage";
import { LibraryPage } from "./pages/LibraryPage";
import { AIStatus } from "./components/AIStatus";
import { ReportPreview } from "./components/ReportPreview";
import { TaskDetail } from "./components/TaskDetail";
import { Empty } from "./components/WorkspaceUI";
import { download } from "./utils/files";

import { OverviewPage } from "./pages/OverviewPage";
import { TasksPage } from "./pages/TasksPage";
import { InboxPage } from "./pages/InboxPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ToolkitPage } from "./pages/ToolkitPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  ArrowUpRight,
  ArrowsClockwise,
  Bell,
  CalendarBlank,
  CaretRight,
  ChartBar,
  ChatCircleDots,
  Check,
  CheckCircle,
  CheckSquare,
  Copy,
  DownloadSimple,
  GearSix,
  Folder,
  List,
  MagnifyingGlass,
  Plus,
  Sparkle,
  SquaresFour,
  TelegramLogo,
  Toolbox,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import { Modal } from "./components/Modal";
import {
  ConnectForm,
  EventForm,
  ImportForm,
  TaskForm,
} from "./components/Forms";
import { useWorkspace } from "./hooks/useWorkspace";
import { requireConnection, api } from "./services/api";
import type {
  BAResource,
  CalendarEvent,
  Page,
  Report,
  Task,
  TelegramGroup,
} from "./types";
import {
  buildReport,
  clock,
  dateOf,
  initials,
  longDate,
  shortDate,
  today,
} from "./utils/dates";

const nav: { id: Page; title: string; icon: Icon }[] = [
  { id: "overview", title: "Tổng quan", icon: SquaresFour },
  { id: "tasks", title: "Công việc", icon: CheckSquare },
  { id: "inbox", title: "Hộp thư Telegram", icon: ChatCircleDots },
  { id: "groups", title: "Nhóm Telegram", icon: TelegramLogo },
  { id: "library", title: "Tài liệu & liên kết", icon: Folder },
  { id: "calendar", title: "Lịch làm việc", icon: CalendarBlank },
  { id: "reports", title: "Báo cáo", icon: ChartBar },
  { id: "toolkit", title: "Bộ công cụ BA", icon: Toolbox },
];

export default function App() {
  const [page, setPage] = useState<Page>("overview"),
    [day, setDay] = useState(today);
  const {
    workspace: ws,
    setWorkspace,
    refresh,
    serverAvailable,
    connection,
    lastUpdatedAt,
    desktopEnabled,
    enableDesktop,
  } = useWorkspace(day);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [inboxFilter, setInboxFilter] = useState("waiting");
  const [inboxView, setInboxView] = useState<"action" | "messages">("action");
  const [modal, setModal] = useState<
    "task" | "event" | "connect" | "import" | "notifications" | null
  >(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null),
    [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<BAResource | null>(
      null,
    ),
    [templateBody, setTemplateBody] = useState("");
  const [report, setReport] = useState<Report | null>(null),
    [toast, setToast] = useState(""),
    [menuOpen, setMenuOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 800px)").matches,
  );
  const searchRef = useRef<HTMLInputElement>(null),
    toastTimer = useRef<number | undefined>(undefined);
  const isDemo = ws.mode === "demo";
  const tasks = ws.tasks.filter(
    (task) =>
      !ws.groups.some(
        (group) =>
          group.ignored &&
          group.id === (task.chatId || task.context[0]?.chatId),
      ) &&
      (dateOf(task.createdAt) === day ||
        (task.completedAt && dateOf(task.completedAt) === day) ||
        ((task.status !== "done" ||
          ["unanswered", "uncertain"].includes(task.replyStatus)) &&
          dateOf(task.createdAt) <= day)),
  );
  const active = tasks.filter((task) => task.status !== "done");
  const waiting = tasks.filter((task) =>
    ["unanswered", "uncertain"].includes(task.replyStatus),
  );
  const done = tasks.filter((task) => task.status === "done");
  const agenda = ws.events.filter((event) => dateOf(event.start) === day);
  const unread = ws.notifications.filter((notice) => !notice.read).length;
  const high = active.filter((task) => task.priority === "high").length;
  const matchedTasks = tasks.filter((task) =>
    `${task.title} ${task.project} ${task.sender} ${task.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visibleTasks = matchedTasks.filter((task) =>
    filter === "all"
      ? task.status !== "done"
      : filter === "priority"
        ? task.priority === "high" && task.status !== "done"
        : filter === "waiting"
          ? ["unanswered", "uncertain"].includes(task.replyStatus)
          : filter === "overdue"
            ? task.status !== "done" &&
              !!task.dueAt &&
              new Date(task.dueAt) < new Date()
            : filter === "review"
              ? task.status !== "done" &&
                !task.ai?.stale &&
                !!task.ai?.completionSuggested
              : task.status === filter,
  );
  const inboxTasks = matchedTasks.filter(
    (task) =>
      task.kind !== "manual" &&
      (inboxFilter === "all" ||
        (inboxFilter === "private"
          ? task.kind === "private"
          : inboxFilter === "waiting"
            ? ["unanswered", "uncertain"].includes(task.replyStatus)
            : task.replyStatus === inboxFilter)),
  );
  const name = ws.user === "Bạn" ? "bạn" : ws.user.split(" ").at(-1) || "bạn";

  function notify(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4500);
  }
  function navigate(next: Page) {
    if (next !== "calendar" && day > today()) setDay(today());
    if (
      !isMobile &&
      document.startViewTransition &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      document.startViewTransition(() => flushSync(() => setPage(next)));
    else setPage(next);
    setFilter("all");
    setQuery("");
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const change = () => setIsMobile(media.matches);
    change();
    media.addEventListener("change", change);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      media.removeEventListener("change", change);
      window.removeEventListener("keydown", key);
      window.clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (selectedTask) {
      const current = ws.tasks.find((task) => task.id === selectedTask.id);
      if (current) setSelectedTask(current);
    }
  }, [ws.tasks, selectedTask?.id]);

  useEffect(() => {
    setSelectedTask(null);
    setSelectedEvent(null);
    setSelectedTemplate(null);
    setReport(null);
    setModal(null);
    setQuery("");
    setFilter("all");
    setInboxFilter("waiting");
  }, [ws.accountRevision]);

  useEffect(() => {
    if (connection === "forbidden") {
      setSelectedTask(null);
      setSelectedEvent(null);
      setReport(null);
      setModal(null);
    }
  }, [connection]);

  async function analyze(chatId?: string) {
    try {
      await api("/ai/analyze", {
        day,
        ...(chatId ? { chatId } : {}),
      });
      setWorkspace((previous) => ({
        ...previous,
        ai: {
          ...previous.ai,
          running: true,
          error: null,
          progress: "Chuẩn bị phân tích…",
        },
      }));
      await refresh();
      notify(
        "AI đang phân tích tin trong ngày đã chọn. Bạn có thể tiếp tục làm việc.",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Không thể phân tích AI.",
      );
    }
  }
  async function toggleGroup(group: TelegramGroup) {
    try {
      requireConnection();
      if (!isDemo)
        await api(
          `/groups/${encodeURIComponent(group.id)}`,
          { ignored: !group.ignored },
          "PATCH",
        );
      setWorkspace((previous) => ({
        ...previous,
        groups: previous.groups.map((item) =>
          item.id === group.id ? { ...item, ignored: !group.ignored } : item,
        ),
      }));
      if (!isDemo) await refresh();
      notify(
        group.ignored
          ? "Đã theo dõi lại nhóm."
          : "Đã bỏ qua nhóm trong công việc và nhắc việc.",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Không thể cập nhật nhóm.",
      );
    }
  }

  async function patchTask(
    task: Task,
    patch: Partial<
      Pick<Task, "status" | "replyStatus" | "priority" | "snoozedUntil">
    >,
  ) {
    try {
      requireConnection();
      if (!isDemo)
        await api(`/tasks/${encodeURIComponent(task.id)}`, patch, "PATCH");
      setWorkspace((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) =>
          item.id === task.id
            ? {
                ...item,
                ...patch,
                ...(patch.status
                  ? {
                      completedAt:
                        patch.status === "done"
                          ? new Date().toISOString()
                          : null,
                    }
                  : {}),
              }
            : item,
        ),
      }));
      if (!isDemo) await refresh();
      if (patch.status)
        notify(
          patch.status === "done"
            ? "Đã hoàn thành. Thêm một việc được gỡ xuống!"
            : "Đã cập nhật trạng thái công việc.",
        );
      if (patch.replyStatus)
        notify("Đã xác nhận trạng thái phản hồi trong BA Desk.");
      if (patch.snoozedUntil)
        notify(`Sẽ nhắc lại lúc ${clock(patch.snoozedUntil)}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể cập nhật.");
    }
  }
  async function saveTask(
    data: Pick<
      Task,
      "title" | "project" | "description" | "priority" | "dueAt"
    >,
  ) {
    requireConnection();
    const task = isDemo
      ? {
          ...data,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          sender: "Bạn",
          kind: "manual" as const,
          status: "todo" as const,
          replyStatus: "na" as const,
          sourceId: null,
          context: [],
          tags: [],
          snoozedUntil: null,
        }
      : await api<Task>("/tasks", data);
    setWorkspace((previous) => ({
      ...previous,
      tasks: [task, ...previous.tasks],
    }));
    setDay(today());
    notify(
      isDemo ? "Đã thêm vào không gian trải nghiệm." : "Đã tạo công việc mới.",
    );
  }
  async function saveEvent(data: Omit<CalendarEvent, "id">) {
    requireConnection();
    const event = isDemo
      ? { ...data, id: crypto.randomUUID() }
      : await api<CalendarEvent>("/events", data);
    setWorkspace((previous) => ({
      ...previous,
      events: [...previous.events, event].sort((a, b) =>
        a.start.localeCompare(b.start),
      ),
    }));
    notify("Đã thêm cuộc hẹn vào lịch.");
  }
  async function removeTask(task: Task) {
    try {
      requireConnection();
      if (!isDemo) await api(`/tasks/${task.id}`, undefined, "DELETE");
      setWorkspace((previous) => ({
        ...previous,
        tasks: previous.tasks.filter((item) => item.id !== task.id),
      }));
      setSelectedTask(null);
      notify("Đã xóa công việc thủ công.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Không thể xóa công việc.",
      );
    }
  }
  async function removeEvent(event: CalendarEvent) {
    try {
      requireConnection();
      if (!isDemo) await api(`/events/${event.id}`, undefined, "DELETE");
      setWorkspace((previous) => ({
        ...previous,
        events: previous.events.filter((item) => item.id !== event.id),
      }));
      setSelectedEvent(null);
      notify("Đã xóa cuộc hẹn.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Không thể xóa cuộc hẹn.",
      );
    }
  }
  async function makeReport(open = true) {
    setBusy(true);
    try {
      requireConnection();
      const next = isDemo
        ? {
            id: crypto.randomUUID(),
            date: day,
            kind: "manual" as const,
            body: buildReport(tasks, day),
            createdAt: new Date().toISOString(),
          }
        : await api<Report>("/reports", { day });
      setWorkspace((previous) => ({
        ...previous,
        reports: [next, ...previous.reports],
      }));
      if (open) setReport(next);
      else {
        download(next.body, `ba-desk-${day}.md`);
        notify("Đã xuất báo cáo Markdown.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tạo báo cáo.");
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (!ws.connected) {
      setModal("connect");
      return;
    }
    try {
      await api("/sync", { day });
      setWorkspace((previous) => ({
        ...previous,
        sync: { running: true, progress: "Chuẩn bị đồng bộ…", error: null },
      }));
      notify("Đang tổng hợp Telegram. Bạn có thể tiếp tục làm việc.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể đồng bộ.");
    }
  }
  async function readNotifications() {
    setModal("notifications");
    if (!serverAvailable) return;
    try {
      if (!isDemo) await api("/notifications/read", {});
      setWorkspace((previous) => ({
        ...previous,
        notifications: previous.notifications.map((notice) => ({
          ...notice,
          read: true,
        })),
      }));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Không thể đánh dấu đã đọc.",
      );
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Đã sao chép vào clipboard.");
    } catch {
      notify(
        "Trình duyệt chưa cho phép sao chép. Bạn có thể chọn văn bản hoặc tải file.",
      );
    }
  }
  const datePicker = (
    <label className="date-picker">
      <CalendarBlank size={17} />
      <input
        aria-label="Ngày cần xem"
        type="date"
        value={day}
        max={page === "calendar" ? undefined : today()}
        onChange={(event) => {
          if (event.target.value) setDay(event.target.value);
        }}
      />
    </label>
  );
  const addButton = (
    <button className="button primary" disabled={!serverAvailable} onClick={() => setModal("task")}>
      <Plus size={18} weight="bold" />
      Thêm công việc
    </button>
  );

  return (
    <div className="app-shell">
      {menuOpen && (
        <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}
        inert={isMobile && !menuOpen}
      >
        <button
          className="brand"
          onClick={() => navigate("overview")}
          aria-label="BA Desk — Tổng quan"
        >
          <span className="brand-mark">
            <span />
            <span />
          </span>
          <span>
            ba<span className="brand-light">desk</span>
            <small>RÕ VIỆC, NHẸ ĐẦU.</small>
          </span>
        </button>
        <div className="workspace-label">
          <span className="workspace-icon">B</span>
          <span>
            Không gian của tôi<small>Senior Business Analyst</small>
          </span>
          <CaretRight size={14} />
        </div>
        <span className="nav-label">KHÔNG GIAN LÀM VIỆC</span>
        <nav>
          {nav.map(({ id, title, icon: IconComponent }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
            >
              <IconComponent
                size={20}
                weight={page === id ? "fill" : "regular"}
              />
              <span>{title}</span>
              {id === "tasks" && active.length > 0 && (
                <small className="nav-count">{active.length}</small>
              )}
              {id === "inbox" && waiting.length > 0 && (
                <span className="nav-dot" />
              )}
              {id === "toolkit" && <small className="new-label">NEW</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="telegram-card">
          <div className="telegram-card-top">
            <span className="telegram-logo">
              <TelegramLogo size={22} weight="fill" />
            </span>
            <span
              className={`connection-pill ${ws.connected ? "connected" : ""}`}
            >
              <span />
              {ws.connected ? "Đã kết nối" : "Chưa kết nối"}
            </span>
          </div>
          <h3>Telegram, gọn hơn.</h3>
          <p>
            Biến hội thoại thành công việc.
            <br />
            Để bạn tập trung vào điều cần làm.
          </p>
          <button
            onClick={() => (ws.connected ? void sync() : setModal("connect"))}
            disabled={!serverAvailable || ws.sync.running}
          >
            {ws.connected ? "Đồng bộ tin nhắn" : "Kết nối Telegram"}
            <ArrowUpRight size={16} />
          </button>
        </div>
        <button
          className={`nav-item settings-link ${page === "settings" ? "active" : ""}`}
          onClick={() => navigate("settings")}
        >
          <GearSix size={20} />
          <span>Cài đặt & tích hợp</span>
        </button>
        <div className="profile">
          <span className="avatar avatar-profile">{initials(ws.user)}</span>
          <span>
            <strong>{ws.user}</strong>
            <small>Không gian cá nhân</small>
          </span>
          <span className="profile-status" />
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Mở menu"
              aria-expanded={menuOpen}
              aria-controls="workspace-navigation"
            >
              <List size={23} />
            </button>
            <span>Không gian làm việc</span>
            <CaretRight size={13} />
            <strong>
              {nav.find((item) => item.id === page)?.title ?? "Cài đặt"}
            </strong>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <MagnifyingGlass size={18} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (!["tasks", "inbox"].includes(page) && event.target.value)
                    setPage("tasks");
                }}
                placeholder="Tìm công việc, tin nhắn…"
                aria-label="Tìm công việc và tin nhắn"
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className="icon-button notification-button"
              onClick={() => void readNotifications()}
              aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`}
            >
              <Bell size={21} />
              {unread > 0 && <i />}
            </button>
            <span className="topbar-divider" />
            <span className="avatar avatar-top">{initials(ws.user)}</span>
          </div>
        </header>
        <main>
          <div className={`connection-strip connection-${connection}`} role="status" aria-live="polite">
            <div>
              <strong>{connection === "connected" ? "Đã kết nối với Mac" : connection === "connecting" ? "Đang kết nối với Mac…" : connection === "forbidden" ? "Không có quyền truy cập" : "Mất kết nối · Chỉ đọc"}</strong>
              <span>{connection === "forbidden"
                ? "Kiểm tra tài khoản Tailscale và quyền truy cập. Dữ liệu đã được ẩn."
                : lastUpdatedAt
                  ? `Cập nhật lúc ${new Date(lastUpdatedAt).toLocaleTimeString("vi-VN")}${serverAvailable ? "" : ". Dữ liệu có thể chưa mới nhất; thao tác lưu đang tạm khóa."}`
                  : "Chưa tải dữ liệu. Kiểm tra Tailscale và backend trên Mac."}</span>
            </div>
            {!serverAvailable && <button className="button secondary" onClick={() => void refresh()}>Thử kết nối lại</button>}
          </div>
          {(ws.sync.running || ws.sync.error) && (
            <div className={`system-banner ${ws.sync.error ? "warning-banner" : ""}`} role="status">
              {ws.sync.running ? <ArrowsClockwise className="spin" size={17} /> : <WarningCircle size={17} />}
              {ws.sync.running ? ws.sync.progress : ws.sync.error}
            </div>
          )}
          {lastUpdatedAt && <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "overview" ? longDate(day) : "KHÔNG GIAN CỦA BẠN"}
              </span>
              <h1>
                {page === "overview"
                  ? `Chào ${name}, một ngày rõ việc.`
                  : {
                      tasks: "Công việc của bạn",
                      inbox: "Không bỏ lỡ một lời nhắn.",
                      groups: "Chọn nhóm đáng để quan tâm.",
                      library: "Tìm lại tài liệu, đúng người, đúng việc.",
                      calendar: "Dành chỗ cho việc quan trọng.",
                      reports: "Nhìn lại, để đi tiếp.",
                      toolkit: "Một trợ thủ cho mọi bước BA.",
                      settings: "Theo nhịp làm việc của bạn.",
                    }[page]}
              </h1>
              <p>
                {page === "overview"
                  ? "Bớt tìm trong hội thoại. Thêm thời gian cho công việc có ý nghĩa."
                  : {
                      tasks:
                        "Tất cả đầu việc, từ Telegram đến những điều bạn tự ghi nhớ.",
                      inbox:
                        "Nhắc đến bạn, tin nhắn riêng và những phản hồi còn đang chờ.",
                      groups:
                        "Theo dõi nhóm đang làm việc, bỏ qua các dự án đã bàn giao.",
                      library:
                        "File, thư mục và liên kết bạn đã trao đổi, cùng tin nhắn gốc.",
                      calendar:
                        "Cuộc hẹn, thời gian tập trung và nhịp nhắc việc mỗi ngày.",
                      reports: "Thông tin vừa đủ. Việc cần làm luôn rõ ràng.",
                      toolkit:
                        "Những mẫu thực dụng dành cho một Business Analyst ở IT.",
                      settings:
                        "Kết nối Telegram và thiết lập cách BA Desk nhắc bạn.",
                    }[page]}
              </p>
            </div>
            <div className="heading-actions">
              {page === "overview" || page === "tasks" ? (
                <>
                  {page === "overview" && (
                    <button
                      className="button secondary"
                      onClick={() => void makeReport(false)}
                      disabled={!serverAvailable || busy}
                    >
                      <DownloadSimple size={17} />
                      Xuất báo cáo
                    </button>
                  )}
                  {addButton}
                </>
              ) : page === "calendar" ? (
                <button
                  className="button primary"
                  disabled={!serverAvailable}
                  onClick={() => setModal("event")}
                >
                  <Plus size={18} />
                  Đặt lịch
                </button>
              ) : page === "reports" ? (
                <button
                  className="button primary"
                  onClick={() => void makeReport()}
                  disabled={!serverAvailable || busy || ws.ai.running}
                >
                  <Sparkle size={17} />
                  Tạo báo cáo
                </button>
              ) : page === "inbox" ? (
                <button
                  className="button primary"
                  onClick={() => void sync()}
                  disabled={!serverAvailable || ws.sync.running}
                >
                  <ArrowsClockwise
                    size={17}
                    className={ws.sync.running ? "spin" : ""}
                  />
                  {ws.sync.running ? "Đang đồng bộ" : "Đồng bộ Telegram"}
                </button>
              ) : null}
            </div>
          </div>
          {ws.ai.running && page !== "reports" && page !== "inbox" && (
            <AIStatus ai={ws.ai} onAnalyze={() => analyze()} />
          )}
          {isDemo && (
            <div className="demo-banner">
              <span className="demo-badge">TRẢI NGHIỆM</span>
              <span>
                Bạn đang xem dữ liệu mẫu. Kết nối Telegram để bắt đầu với công
                việc của mình.
              </span>
              <button onClick={() => setModal("connect")}>
                Kết nối ngay
                <ArrowRight size={14} />
              </button>
            </div>
          )}

          {page === "overview" && (
            <OverviewPage
              ws={ws}
              tasks={tasks}
              active={active}
              waiting={waiting}
              done={done}
              agenda={agenda}
              high={high}
              day={day}
              filter={filter}
              setFilter={setFilter}
              visibleTasks={visibleTasks}
              setSelectedTask={setSelectedTask}
              patchTask={patchTask}
              setModal={setModal}
              setSelectedEvent={setSelectedEvent}
              navigate={navigate}
              makeReport={makeReport}
              busy={busy}
              isDemo={isDemo}
            />
          )}

          {page === "tasks" && (
            <TasksPage
              filter={filter}
              setFilter={setFilter}
              active={active}
              done={done}
              datePicker={datePicker}
              visibleTasks={visibleTasks}
              setSelectedTask={setSelectedTask}
              patchTask={patchTask}
              query={query}
            />
          )}

          {page === "inbox" && (
            <AIStatus ai={ws.ai} onAnalyze={() => analyze()} />
          )}
          {page === "inbox" && (
            <InboxPage
              inboxView={inboxView}
              setInboxView={setInboxView}
              inboxFilter={inboxFilter}
              setInboxFilter={setInboxFilter}
              datePicker={datePicker}
              ws={ws}
              day={day}
              inboxTasks={inboxTasks}
              setSelectedTask={setSelectedTask}
              tasks={tasks}
              query={query}
            />
          )}

          {page === "groups" && (
            <GroupsPage
              groups={ws.groups}
              onToggle={toggleGroup}
              onSync={sync}
              syncing={ws.sync.running}
            />
          )}
          {page === "library" && (
            <LibraryPage
              key={ws.accountRevision}
              accountRevision={ws.accountRevision}
              isDemo={isDemo}
              lastSync={ws.lastSync}
              notify={notify}
            />
          )}
          {page === "calendar" && (
            <CalendarPage
              day={day}
              setDay={setDay}
              datePicker={datePicker}
              ws={ws}
              agenda={agenda}
              setSelectedEvent={setSelectedEvent}
              setModal={setModal}
              isDemo={isDemo}
              navigate={navigate}
            />
          )}

          {page === "reports" && (
            <ReportsPage
              ws={ws}
              isDemo={isDemo}
              active={active}
              waiting={waiting}
              done={done}
              day={day}
              datePicker={datePicker}
              busy={busy}
              makeReport={makeReport}
              setReport={setReport}
              onAnalyze={() => analyze()}
            />
          )}

          {page === "toolkit" && (
            <ToolkitPage
              setSelectedTemplate={setSelectedTemplate}
              setTemplateBody={setTemplateBody}
            />
          )}

          {page === "settings" && (
            <SettingsPage
              key={ws.accountRevision}
              ai={ws.ai}
              settings={ws.settings}
              bot={ws.bot}
              connected={ws.connected}
              isDemo={isDemo}
              desktopEnabled={desktopEnabled}
              onConnect={() => setModal("connect")}
              onSwitch={async () => {
                try {
                  await api("/telegram/disconnect", {});
                  await refresh();
                  setModal("connect");
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Không thể đổi tài khoản.",
                  );
                }
              }}
              onImport={() => setModal("import")}
              onNotify={notify}
              onDesktop={enableDesktop}
              onRefresh={() => refresh()}
              onSave={async (next) => {
                requireConnection();
                if (!isDemo) await api("/settings", next, "PUT");
                setWorkspace((previous) => ({
                  ...previous,
                  settings: { ...previous.settings, ...next },
                }));
                notify(
                  isDemo
                    ? "Đã lưu lịch mẫu. Kết nối hoặc nhập dữ liệu để chạy nhắc việc."
                    : "Đã lưu nhịp nhắc việc của bạn.",
                );
              }}
              onDisconnect={async () => {
                try {
                  await api("/telegram/disconnect", {});
                  await refresh();
                  notify(
                    "Đã thu hồi phiên Telegram. Dữ liệu công việc vẫn được giữ.",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Không thể ngắt kết nối.",
                  );
                }
              }}
              onStart={async () => {
                try {
                  await api("/workspace/start", {});
                  await refresh();
                  notify(
                    "Không gian của bạn đã sẵn sàng. Bắt đầu với một công việc mới.",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Không thể tạo không gian.",
                  );
                }
              }}
            />
          )}
          <footer className="main-footer">
            <span>
              <span className="mini-dot" />
              {isDemo
                ? "Dữ liệu mẫu · Chưa kết nối Telegram"
                : ws.connected
                  ? `Telegram đã kết nối${ws.lastSync ? ` · Đồng bộ ${clock(ws.lastSync)}` : ""}`
                  : "Dữ liệu cục bộ · Không đồng bộ trực tiếp"}
            </span>
            <span>
              Được thiết kế để bạn nhẹ đầu hơn.
              <span className="footer-brand">ba desk</span>
            </span>
          </footer>
          </>}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={19} weight="fill" />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Đóng thông báo">
            <X size={17} />
          </button>
        </div>
      )}
      {modal === "task" && (
        <TaskForm onClose={() => setModal(null)} onSave={saveTask} />
      )}
      {modal === "event" && (
        <EventForm
          day={day}
          onClose={() => setModal(null)}
          onSave={saveEvent}
        />
      )}
      {modal === "connect" && (
        <ConnectForm onClose={() => setModal(null)} onConnected={refresh} />
      )}
      {modal === "import" && (
        <ImportForm
          day={day}
          onClose={() => setModal(null)}
          onImported={async (importedDay) => {
            setDay(importedDay);
            await refresh(importedDay);
          }}
        />
      )}
      {modal === "notifications" && (
        <Modal
          title="Thông báo của bạn"
          subtitle="Những điều BA Desk đã ghi nhớ giúp bạn."
          onClose={() => setModal(null)}
        >
          {ws.notifications.length ? (
            <div className="notification-list">
              {ws.notifications.map((notice) => (
                <div key={notice.id}>
                  <span className="schedule-icon tone-green">
                    <Bell size={21} />
                  </span>
                  <span>
                    <strong>{notice.title}</strong>
                    <p>{notice.body}</p>
                    <small>
                      {shortDate(notice.createdAt)} · {clock(notice.createdAt)}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={Bell}
              title="Chưa có thông báo mới"
              text="Nhắc việc và báo cáo sẽ xuất hiện ở đây."
            />
          )}
        </Modal>
      )}
      {selectedTask && (
        <TaskDetail
          selectedTask={selectedTask}
          setSelectedTask={setSelectedTask}
          patchTask={patchTask}
          removeTask={removeTask}
          isDemo={isDemo}
          onAnalyze={analyze}
          analyzing={ws.ai.running}
          onCopy={copy}
        />
      )}
      {selectedEvent && (
        <Modal
          title={selectedEvent.title}
          subtitle={`${longDate(dateOf(selectedEvent.start))} · ${clock(selectedEvent.start)} – ${clock(selectedEvent.end)}`}
          onClose={() => setSelectedEvent(null)}
        >
          <div className="event-detail">
            <CalendarBlank size={43} weight="duotone" />
            <p>{selectedEvent.note || "Chưa có ghi chú cho cuộc hẹn này."}</p>
            <span className="field-note">
              Nhắc trước 10 phút khi máy chủ đang chạy.
              {isDemo && " Đây là lịch trải nghiệm."}
            </span>
            <div className="form-actions">
              <button
                className="button secondary danger"
                onClick={() => void removeEvent(selectedEvent)}
              >
                <Trash size={16} />
                Xóa cuộc hẹn
              </button>
              <button
                className="button primary"
                onClick={() => setSelectedEvent(null)}
              >
                Đã rõ
                <Check size={16} />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {report && (
        <Modal
          title={
            report.kind === "evening"
              ? "Rà soát cuối ngày"
              : "Bản tóm tắt công việc"
          }
          subtitle={`${longDate(report.date)}${isDemo ? " · Dữ liệu mẫu" : ""}`}
          onClose={() => setReport(null)}
          wide
        >
          <ReportPreview report={report} />
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => void copy(report.body)}
            >
              <Copy size={17} />
              Sao chép
            </button>
            <button
              className="button primary"
              onClick={() => download(report.body, `ba-desk-${report.date}.md`)}
            >
              <DownloadSimple size={17} />
              Tải báo cáo
            </button>
          </div>
        </Modal>
      )}
      {selectedTemplate && (
        <Modal
          title={selectedTemplate.title}
          subtitle={
            selectedTemplate.id.startsWith("prompt-")
              ? "Điền các phần [ngoặc vuông], sao chép sang ChatGPT/Codex và thêm tài liệu nguồn."
              : "Chỉnh sửa mẫu theo ngữ cảnh dự án của bạn."
          }
          onClose={() => setSelectedTemplate(null)}
          wide
        >
          <textarea
            className="template-editor"
            value={templateBody}
            onChange={(event) => setTemplateBody(event.target.value)}
            aria-label="Nội dung mẫu BA"
            spellCheck={false}
          />
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => void copy(templateBody)}
            >
              <Copy size={17} />
              Sao chép
            </button>
            <button
              className="button primary"
              onClick={() =>
                download(templateBody, `${selectedTemplate.id}.md`)
              }
            >
              <DownloadSimple size={17} />
              Tải mẫu
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
