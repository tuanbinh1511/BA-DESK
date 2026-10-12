import type { Message, Task, Workspace } from "../types";
import { today } from "../utils/dates";
const day = today();
const at = (time: string) => `${day}T${time}:00+07:00`;
function task(
  id: string,
  title: string,
  project: string,
  sender: string,
  time: string,
  priority: Task["priority"],
  kind: Task["kind"],
  tags: string[],
  status: Task["status"] = "todo",
  replyStatus: Task["replyStatus"] = "unanswered",
): Task {
  const context: Message[] =
    kind === "manual"
      ? []
      : [
          {
            id: `${id}-context`,
            chatId: project,
            sender,
            text: "Team đang chuẩn bị cho sprint mới. Mình cần chốt phần yêu cầu trước buổi review chiều nay.",
            date: at("08:15"),
            outgoing: false,
            replyTo: null,
            chat: project,
            kind,
            mentioned: false,
            url: null,
          },
          {
            id: `${id}-source`,
            chatId: project,
            sender,
            text: `${kind === "group" ? "@binh " : "Bình ơi, "}${title.toLowerCase()}. Bạn kiểm tra và phản hồi giúp mình trước ${time} nhé.`,
            date: at("08:32"),
            outgoing: false,
            replyTo: null,
            chat: project,
            kind,
            mentioned: kind === "group",
            url: null,
          },
        ];
  return {
    id,
    title,
    description:
      context.at(-1)?.text ??
      "Chuẩn bị tài liệu và kiểm tra lại trước hạn hoàn thành.",
    project,
    sender,
    kind,
    priority,
    tags,
    status,
    replyStatus,
    createdAt: at("08:32"),
    dueAt: at(time),
    sourceId: context.at(-1)?.id ?? null,
    context,
    snoozedUntil: null,
  };
}
export function createDemo(): Workspace {
  const tasks = [
    task(
      "demo-1",
      "Review luồng thanh toán & cập nhật BRD",
      "Payment Platform",
      "Minh Anh",
      "11:30",
      "high",
      "group",
      ["BRD", "Review"],
    ),
    task(
      "demo-2",
      "Xác nhận acceptance criteria cho sprint 24",
      "Mobile Banking",
      "Hoàng Nam",
      "14:00",
      "high",
      "private",
      ["User story", "Sprint 24"],
    ),
    task(
      "demo-3",
      "Làm rõ quy tắc hoàn tiền với stakeholder",
      "Payment Platform",
      "Thu Hà",
      "15:30",
      "medium",
      "group",
      ["Clarification"],
      "doing",
      "uncertain",
    ),
    task(
      "demo-4",
      "Chuẩn bị agenda cho buổi UAT",
      "CRM Internal",
      "Bạn",
      "16:00",
      "medium",
      "manual",
      ["UAT"],
      "todo",
      "na",
    ),
    task(
      "demo-5",
      "Cập nhật traceability matrix",
      "Mobile Banking",
      "Bạn",
      "17:00",
      "low",
      "manual",
      ["Documentation"],
      "todo",
      "na",
    ),
    task(
      "demo-6",
      "Gửi meeting notes buổi refinement",
      "CRM Internal",
      "Quỳnh Chi",
      "16:30",
      "medium",
      "private",
      ["Meeting notes"],
      "todo",
      "replied",
    ),
    task(
      "demo-7",
      "Chốt phạm vi chức năng đăng nhập",
      "Mobile Banking",
      "Hoàng Nam",
      "09:00",
      "medium",
      "group",
      ["Scope"],
      "done",
      "replied",
    ),
    task(
      "demo-8",
      "Review wireframe trang khách hàng",
      "CRM Internal",
      "Quỳnh Chi",
      "09:30",
      "low",
      "private",
      ["Wireframe"],
      "done",
      "replied",
    ),
  ];
  return {
    tasks,
    messages: tasks.flatMap((task) => task.context),
    events: [
      {
        id: "demo-e1",
        title: "Refinement · Sprint 24",
        start: at("10:00"),
        end: at("10:45"),
        note: "Mobile Banking · Product team",
        color: "green",
      },
      {
        id: "demo-e2",
        title: "Làm rõ yêu cầu thanh toán",
        start: at("14:00"),
        end: at("15:00"),
        note: "Payment Platform · Stakeholders",
        color: "orange",
      },
      {
        id: "demo-e3",
        title: "UAT check-in",
        start: at("16:00"),
        end: at("16:30"),
        note: "CRM Internal · QA team",
        color: "purple",
      },
    ],
    notifications: [
      {
        id: "demo-n1",
        title: "Bản tin buổi sáng đã sẵn sàng",
        body: "6 việc đang mở. 3 cuộc hội thoại cần bạn phản hồi hoặc xác nhận.",
        createdAt: at("08:30"),
        read: false,
      },
    ],
    reports: [],
    settings: {
      morning: "08:30",
      evening: "17:00",
      enabled: true,
      autoSync: true,
      telegramNotifications: true,
      username: "binh",
      selfId: "",
      timezone: "Asia/Ho_Chi_Minh",
      aiEnabled: true,
      aiModel: "gpt-6-luna",
    },
    accountId: null,
    accountRevision: 0,
    groups: [
      {
        id: "Payment Platform",
        name: "Payment Platform",
        ignored: false,
        lastMessageAt: at("09:00"),
      },
      {
        id: "CRM Internal",
        name: "CRM Internal",
        ignored: false,
        lastMessageAt: at("08:40"),
      },
      {
        id: "Old project",
        name: "Dự án đã bàn giao",
        ignored: true,
        lastMessageAt: null,
      },
    ],
    ai: {
      available: false,
      running: false,
      progress: "",
      error: null,
      model: "gpt-6-luna",
      models: ["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"],
      lastAnalyzedAt: null,
      coverage: null,
    },
    mode: "demo",
    bot: { configured: false, username: "", error: null, lastSentAt: null },
    connected: false,
    user: "Tuấn Bình",
    lastSync: null,
    sync: { running: false, progress: "", error: null },
  };
}
export function loadDemo(): Workspace {
  try {
    const saved = JSON.parse(
      localStorage.getItem("ba-desk-demo") ?? "null",
    ) as { day: string; workspace: Workspace } | null;
    if (saved?.day === day && Array.isArray(saved.workspace.tasks)) {
      const defaults = createDemo();
      return {
        ...defaults,
        ...saved.workspace,
        settings: { ...defaults.settings, ...saved.workspace.settings },
      };
    }
  } catch {
    /* Invalid local demo data is replaced with a fresh sample. */
  }
  return createDemo();
}
