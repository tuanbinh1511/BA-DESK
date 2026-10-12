import {
  CaretRight,
  ChatCircle,
  Check,
  TelegramLogo,
} from "@phosphor-icons/react";
import { replyLabels } from "../utils/labels";
import type { Task } from "../types";
import { clock, initials, shortDate, today } from "../utils/dates";

export function TaskRow({
  task,
  onOpen,
  onToggle,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  const overdue =
    task.dueAt && new Date(task.dueAt) < new Date() && task.status !== "done";
  return (
    <div className={`task-row ${task.status === "done" ? "task-done" : ""}`}>
      <button
        className={`task-check ${task.status === "done" ? "checked" : ""}`}
        onClick={() => onToggle(task)}
        aria-label={`${task.status === "done" ? "Mở lại" : "Hoàn thành"}: ${task.title}`}
      >
        {task.status === "done" && <Check size={13} weight="bold" />}
      </button>
      <button className="task-body" onClick={() => onOpen(task)}>
        <span className="task-title">{task.title}</span>
        {!task.ai?.stale && task.ai?.summary && (
          <span className="task-brief">{task.ai.summary}</span>
        )}
        <span className="task-meta">
          <span className={`project-dot project-${task.project.length % 3}`} />
          {task.project}
          <span className="meta-dot">·</span>
          {shortDate(task.createdAt)} {clock(task.createdAt)}
          {task.kind !== "manual" && (
            <span className={`reply-badge reply-${task.replyStatus}`}>
              {replyLabels[task.replyStatus]}
            </span>
          )}
          <span className="meta-dot">·</span>
          {task.kind === "group" ? (
            <>
              <TelegramLogo size={13} /> Nhắc đến bạn
            </>
          ) : task.kind === "private" ? (
            <>
              <ChatCircle size={13} /> Tin nhắn riêng
            </>
          ) : (
            "Tạo thủ công"
          )}
        </span>
      </button>
      <div className="task-trailing">
        <span className={`priority priority-${task.priority}`}>
          <span />
          {task.priority === "high"
            ? "Cao"
            : task.priority === "medium"
              ? "Vừa"
              : "Thấp"}
        </span>
        {task.dueAt && (
          <span className={`due ${overdue ? "overdue" : ""}`}>
            {clock(task.dueAt)}
            {!task.dueAt.startsWith(today()) && ` · ${shortDate(task.dueAt)}`}
          </span>
        )}
        <span
          className={`avatar avatar-small avatar-${task.sender.length % 4}`}
          title={task.sender}
        >
          {initials(task.sender)}
        </span>
        <button
          className="row-open"
          onClick={() => onOpen(task)}
          aria-label={`Chi tiết: ${task.title}`}
        >
          <CaretRight size={16} />
        </button>
      </div>
    </div>
  );
}
