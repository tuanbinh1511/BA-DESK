import { PersonGroups } from "../components/PersonGroups";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChatCircleDots,
  ListChecks,
  LockKey,
  Question,
} from "@phosphor-icons/react";
import type { Task, Workspace } from "../types";
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
  return (
    <>
      <div className="inbox-controls">
        <div className="view-switch">
          <button
            onClick={() => setInboxView("action")}
            className={inboxView === "action" ? "selected" : ""}
          >
            <ListChecks size={17} />
            Cần xử lý
          </button>
          <button
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
        ) : (
          (() => {
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
                        task.context.some(
                          (context) => context.id === message.id,
                        ),
                      ))),
            );
            return messages.length ? (
              messages.map((message) => (
                <div className="inbox-item raw-message" key={message.id}>
                  <span
                    className={`avatar avatar-${message.sender.length % 4}`}
                  >
                    {initials(message.sender)}
                  </span>
                  <div className="inbox-content">
                    <div className="inbox-item-head">
                      <strong>
                        {message.sender}
                        {message.outgoing && (
                          <span className="soft-badge green">Bạn</span>
                        )}
                      </strong>
                      <span>{message.chat}</span>
                      <time>{clock(message.date)}</time>
                    </div>
                    <p className="message-text">{message.text}</p>
                    <div className="inbox-item-bottom">
                      <span className="subtle-label">
                        {message.kind === "group" ? "Nhóm" : "Tin nhắn riêng"}
                        {message.mentioned && " · Nhắc đến bạn"}
                      </span>
                      {message.url?.startsWith("https://t.me/") && (
                        <a
                          href={message.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-button"
                        >
                          Mở Telegram
                          <ArrowUpRight size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                icon={ChatCircleDots}
                title="Chưa có tin nhắn trong ngày"
                text="Đồng bộ Telegram hoặc nhập file JSON từ Telegram Desktop."
              />
            );
          })()
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
