export type Page =
  | "overview"
  | "tasks"
  | "inbox"
  | "calendar"
  | "reports"
  | "toolkit"
  | "settings"
  | "groups"
  | "library";
export type TaskStatus = "todo" | "doing" | "done";
export type ReplyStatus = "unanswered" | "replied" | "uncertain" | "na";
export type TaskPatch = Partial<
  Pick<Task, "status" | "replyStatus" | "priority" | "snoozedUntil">
>;
export interface Message {
  id: string;
  chatId: string;
  sender: string;
  senderId?: string | null;
  text: string;
  date: string;
  outgoing: boolean;
  replyTo: string | null;
  chat: string;
  kind: "group" | "private" | "channel" | "bot" | "saved";
  mentioned: boolean;
  url: string | null;
  links?: string[];
  attachment?: {
    name: string;
    path?: string;
    mimeType?: string | null;
    size?: number | null;
  };
}
export interface DocumentReference {
  id: string;
  sourceId: string;
  sourceUrl: string | null;
  chatUrl?: string | null;
  kind: "file" | "folder" | "link";
  name: string;
  value: string;
  url: string | null;
  mimeType?: string | null;
  size?: number | null;
  origin: "attachment" | "link" | "mentioned";
  sender: string;
  senderId: string | null;
  chat: string;
  chatId: string;
  date: string;
  outgoing: boolean;
  text: string;
}
export interface LibraryResult {
  items: DocumentReference[];
  total: number;
  chats: { id: string; name: string }[];
  senders: { id: string; name: string }[];
  accountRevision: number;
}
export interface TaskAnalysis {
  summary: string;
  reason: string;
  nextAction: string;
  suggestedReply: string;
  evidenceIds: string[];
  responseIds: string[];
  confidence: number;
  completionSuggested: boolean;
  model: string;
  analyzedAt: string;
  stale: boolean;
}
export interface TelegramGroup {
  id: string;
  name: string;
  ignored: boolean;
  lastMessageAt: string | null;
}
export interface AIState {
  available: boolean;
  running: boolean;
  progress: string;
  error: string | null;
  model: string;
  models: string[];
  lastAnalyzedAt: string | null;
  coverage: {
    messages: number;
    chats: number;
    fullHistoryChats: number;
    contextCompleteChats?: number;
    applied: number;
    cachedParts: number;
  } | null;
}
export interface BAResource {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: "story" | "meeting" | "uat" | "clarify" | "change" | "risk";
  color: string;
  body: string;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  project: string;
  sender: string;
  senderId?: string | null;
  kind: "group" | "private" | "manual";
  priority: "high" | "medium" | "low";
  status: TaskStatus;
  replyStatus: ReplyStatus;
  createdAt: string;
  dueAt: string | null;
  sourceId: string | null;
  context: Message[];
  tags: string[];
  snoozedUntil: string | null;
  chatId?: string;
  completedAt?: string | null;
  ai?: TaskAnalysis;
}
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  note: string;
  color: "green" | "orange" | "purple";
}
export interface Settings {
  morning: string;
  evening: string;
  enabled: boolean;
  autoSync: boolean;
  telegramNotifications: boolean;
  username: string;
  selfId: string;
  timezone: string;
  aiEnabled: boolean;
  aiModel: string;
}
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}
export interface ReportPerson {
  id: string;
  name: string;
  tasks: (Pick<
    Task,
    | "id"
    | "title"
    | "project"
    | "createdAt"
    | "dueAt"
    | "status"
    | "replyStatus"
  > & { summary: string; nextAction: string; url?: string | null })[];
}
export interface Report {
  id: string;
  date: string;
  kind: "morning" | "evening" | "manual";
  people?: ReportPerson[];
  analysis?: {
    model: string;
    coverage: AIState["coverage"];
    createdAt: string;
  } | null;
  analysisError?: string | null;
  syncWarning?: string | null;
  body: string;
  createdAt: string;
}
export interface Workspace {
  accountId: string | null;
  accountRevision: number;
  groups: TelegramGroup[];
  ai: AIState;
  tasks: Task[];
  messages: Message[];
  events: CalendarEvent[];
  notifications: AppNotification[];
  reports: Report[];
  settings: Settings;
  bot: {
    configured: boolean;
    username: string;
    error: string | null;
    lastSentAt: string | null;
  };
  mode: "demo" | "local" | "import" | "telegram";
  connected: boolean;
  user: string;
  lastSync: string | null;
  sync: { running: boolean; progress: string; error: string | null };
}
