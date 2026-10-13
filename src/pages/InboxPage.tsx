import { PersonGroups } from "../components/PersonGroups";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChatCircleDots,
  ListChecks,
  LockKey,
  Question,
} from "@phosphor-icons/react";
import type { Message, Task, Workspace } from "../types";
import { clock, dateOf, initials, shortDate } from "../utils/dates";
import { replyLabels } from "../utils/labels";
import { Empty } from "../components/WorkspaceUI";
export function InboxPage({
  inboxView,
  setInboxView,
  inboxFilter,
  setInboxFilter,
  datePicker,
  ws,
  day,
  inboxTasks,
  setSelectedTask,
  tasks,
  query,
}: {
  inboxView: "action" | "messages";
  setInboxView: (value: "action" | "messages") => void;
  inboxFilter: string;
  setInboxFilter: (value: string) => void;
  datePicker: ReactNode;
  ws: Workspace;
  day: string;
  inboxTasks: Task[];
  setSelectedTask: (task: Task) => void;
  tasks: Task[];
  query: string;
}) {
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const messages = ws.messages.filter(
    (message) =>
      dateOf(message.date) === day &&
      `${message.text} ${message.sender} ${message.chat}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (inboxFilter === "all" ||
        (inboxFilter === "private"
          ? message.kind === "private"
          : message.mentioned ||
            message.kind === "private" ||
            tasks.some((task) =>
              task.context.some((context) => context.id === message.id),
            ))),
  );
  const chats = new Map<
    string,
    { id: string; name: string; messages: Message[] }
  >();
  for (const message of messages) {
    const chat = chats.get(message.chatId) || {
      id: message.chatId,
      name: message.chat,
      messages: [],
    };
    chat.messages.push(message);
    chats.set(message.chatId, chat);
  }
  const conversations = [...chats.values()]
    .map((chat) => ({
      ...chat,
      messages: chat.messages.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) =>
      b.messages.at(-1)!.date.localeCompare(a.messages.at(-1)!.date),
    );
  const conversation =
    conversations.find((chat) => chat.id === selectedChat) || conversations[0];
  return (
    <>
      <div className="inbox-controls">
        <div className="view-switch">
          <button
            aria-pressed={inboxView === "action"}
            onClick={() => setInboxView("action")}
            className={inboxView === "action" ? "selected" : ""}
          >
            <ListChecks size={17} />
            Cần xử lý
          </button>
          <button
            aria-pressed={inboxView === "messages"}
            onClick={() => setInboxView("messages")}
            className={inboxView === "messages" ? "selected" : ""}
          >
            <ChatCircleDots size={17} />
            Toàn bộ tin nhắn
            <span>
              {
                ws.messages.filter((message) => dateOf(message.date) === day)
                  .length
              }
            </span>
          </button>
        </div>
        {datePicker}
      </div>
      <section className="panel full-panel">
        <div className="full-toolbar">
          <div className="tabs">
            {(inboxView === "action"
              ? [
                  { id: "waiting", label: "Cần phản hồi" },
                  { id: "uncertain", label: "Cần kiểm tra" },
                  { id: "replied", label: "Đã phản hồi" },
                  { id: "all", label: "Tất cả yêu cầu" },
                ]
              : [
                  { id: "waiting", label: "Liên quan đến tôi" },
                  { id: "private", label: "Tin nhắn riêng" },
                  { id: "all", label: "Tất cả" },
                ]
            ).map((item) => (
              <button
                aria-pressed={inboxFilter === item.id}
                key={item.id}
                onClick={() => setInboxFilter(item.id)}
                className={inboxFilter === item.id ? "selected" : ""}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="subtle-label">
            <LockKey size={13} />
            Theo người giao
          </span>
        </div>
        {inboxView === "action" ? (
          inboxTasks.length ? (
            <PersonGroups tasks={inboxTasks}>
              {(task) => (
                <div className="inbox-item" key={task.id}>
                  <span className={`avatar avatar-${task.sender.length % 4}`}>
                    {initials(task.sender)}
                  </span>
                  <div className="inbox-content">
                    <div className="inbox-item-head">
                      <strong>{task.sender}</strong>
                      <span>{task.project}</span>
                      <time>
                        {clock(task.createdAt)} · {shortDate(task.createdAt)}
                      </time>
                    </div>
                    <button
                      className="inbox-title"
                      onClick={() => setSelectedTask(task)}
                    >
                      {task.title}
                    </button>
                    <p className="request-summary">
                      <span className="reading-label">Nội dung cần đọc</span>
                      {(!task.ai?.stale && task.ai?.summary) ||
                        task.description}
                    </p>
                    <div className="inbox-item-bottom">
                      <span className={`reply-badge reply-${task.replyStatus}`}>
                        {replyLabels[task.replyStatus]}
                      </span>
                      <span className={`work-badge work-${task.status}`}>
                        {task.status === "done"
                          ? "Hoàn thành"
                          : task.status === "doing"
                            ? "Đang làm"
                            : "Chưa làm"}
                      </span>
                      {task.replyStatus === "uncertain" && (
                        <small>
                          {task.ai?.reason ||
                            "Chưa đủ bằng chứng trả lời đúng yêu cầu."}
                        </small>
                      )}
                      <button
                        className="text-button"
                        onClick={() => setSelectedTask(task)}
                      >
                        Xem ngữ cảnh
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </PersonGroups>
          ) : (
            <Empty
              icon={ChatCircleDots}
              title="Không có tin cần xử lý"
              text="Đổi bộ lọc hoặc đồng bộ tin nhắn cho ngày bạn chọn."
            />
          )
        ) : conversation ? (
          <div className="chat-workspace">
            <nav className="chat-list" aria-label="Chọn cuộc trò chuyện">
              {conversations.map((chat) => {
                const last = chat.messages.at(-1)!;
                const pending = tasks.filter(
                  (task) =>
                    (task.chatId || task.context[0]?.chatId) === chat.id &&
                    ["unanswered", "uncertain"].includes(task.replyStatus),
                ).length;
                return (
                  <button
                    key={chat.id}
                    aria-current={
                      conversation.id === chat.id ? "true" : undefined
                    }
                    className={`chat-list-item ${conversation.id === chat.id ? "selected" : ""}`}
                    onClick={() => setSelectedChat(chat.id)}
                  >
                    <span className={`avatar avatar-${chat.name.length % 4}`}>
                      {initials(chat.name)}
                    </span>
                    <span className="chat-list-copy">
                      <strong>{chat.name}</strong>
                      <span>
                        {last.outgoing ? "Bạn" : last.sender}:{" "}
                        {last.text || last.attachment?.name || "Tệp đính kèm"}
                      </span>
                      <small>
                        {chat.messages.length} tin ·{" "}
                        {pending ? `${pending} cần phản hồi` : clock(last.date)}
                      </small>
                    </span>
                  </button>
                );
              })}
            </nav>
            <section
              className="chat-thread"
              aria-label={`Hội thoại ${conversation.name}`}
            >
              <header className="chat-thread-head">
                <div>
                  <h2>{conversation.name}</h2>
                  <p>
                    {shortDate(conversation.messages[0].date)} ·{" "}
                    {conversation.messages.length} tin trong bộ lọc hiện tại
                  </p>
                </div>
                <span>Gửi bên phải · Nhận bên trái</span>
              </header>
              <div className="chat-thread-messages" key={conversation.id}>
                {conversation.messages.map((message) => {
                  const task = tasks.find(
                    (task) => task.sourceId === message.id,
                  );
                  const needsReply =
                    task &&
                    ["unanswered", "uncertain"].includes(task.replyStatus);
                  return (
                    <article
                      key={message.id}
                      className={`chat-bubble ${message.outgoing ? "outgoing" : "incoming"} ${needsReply ? "needs-reply" : ""}`}
                    >
                      <header>
                        <span
                          className={`avatar avatar-small avatar-${message.sender.length % 4}`}
                        >
                          {initials(message.sender)}
                        </span>
                        <strong>{message.sender}</strong>
                        <span className="message-direction">
                          {message.outgoing ? "Bạn gửi" : "Bạn nhận"}
                        </span>
                        <time dateTime={message.date}>
                          {clock(message.date)}
                        </time>
                      </header>
                      {needsReply && (
                        <span className="reading-label">
                          {task.replyStatus === "uncertain"
                            ? "Cần kiểm tra phản hồi"
                            : "Tin gốc · Cần phản hồi"}
                        </span>
                      )}
                      <p className="chat-message-text">
                        {message.text ||
                          (message.attachment
                            ? ""
                            : "Tin không có nội dung văn bản")}
                      </p>
                      {message.attachment && (
                        <p className="message-attachment">
                          Tệp đính kèm: {message.attachment.name}
                        </p>
                      )}
                      <footer>
                        {task && (
                          <button
                            className="text-button"
                            onClick={() => setSelectedTask(task)}
                          >
                            Xem yêu cầu <ArrowRight size={14} />
                          </button>
                        )}
                        {message.url?.startsWith("https://t.me/") && (
                          <a
                            className="text-button"
                            href={message.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Tin gốc trên Telegram <ArrowUpRight size={14} />
                          </a>
                        )}
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          <Empty
            icon={ChatCircleDots}
            title="Chưa có tin nhắn trong ngày"
            text="Đồng bộ Telegram hoặc nhập file JSON từ Telegram Desktop."
          />
        )}
      </section>
      <p className="page-footnote">
        <Question size={15} />
        “Đã phản hồi” được đối chiếu bằng dẫn chứng hội thoại hoặc xác nhận của
        bạn. AI chưa phân tích nội dung tệp đính kèm.
      </p>
    </>
  );
}
