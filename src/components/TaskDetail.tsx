import {
  ArrowUpRight,
  Sparkle,
  Copy,
  Check,
  CheckCircle,
  Clock,
  TelegramLogo,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Task, TaskStatus, TaskPatch } from "../types";
import { clock, shortDate, priorityLabel, initials } from "../utils/dates";
import { replyLabels, statusLabels } from "../utils/labels";
import { Modal } from "./Modal";
import { SectionHead } from "./WorkspaceUI";
export function TaskDetail({
  selectedTask,
  setSelectedTask,
  patchTask,
  removeTask,
  isDemo,
  onAnalyze,
  analyzing,
  onCopy,
}: {
  selectedTask: Task;
  setSelectedTask: (task: Task | null) => void;
  patchTask: (task: Task, patch: TaskPatch) => Promise<void>;
  removeTask: (task: Task) => Promise<void>;
  isDemo: boolean;
  onAnalyze: (chatId?: string) => Promise<void>;
  analyzing: boolean;
  onCopy: (text: string) => Promise<void>;
}) {
  return (
    <Modal
      title="Chi tiết công việc"
      subtitle={selectedTask.project}
      onClose={() => setSelectedTask(null)}
      wide
    >
      <div className="task-detail">
        <div className="detail-sender">
          <span className={`avatar avatar-${selectedTask.sender.length % 4}`}>
            {initials(selectedTask.sender)}
          </span>
          <div>
            <small>
              {selectedTask.kind === "manual"
                ? "Người tạo công việc"
                : "Người gửi yêu cầu"}
            </small>
            <strong>{selectedTask.sender}</strong>
            <span>
              {selectedTask.context.find(
                (message) => message.id === selectedTask.sourceId,
              )?.chat || selectedTask.project}{" "}
              · {shortDate(selectedTask.createdAt)}{" "}
              {clock(selectedTask.createdAt)}
            </span>
          </div>
        </div>
        <div className="detail-eyebrow">
          <span className={`priority priority-${selectedTask.priority}`}>
            <span />
            {priorityLabel[selectedTask.priority]}
          </span>
          <span className={`reply-badge reply-${selectedTask.replyStatus}`}>
            {replyLabels[selectedTask.replyStatus]}
          </span>
        </div>
        <h3>{selectedTask.title}</h3>
        {selectedTask.ai && (
          <div className="analysis-detail">
            <div>
              <Sparkle size={18} />
              <strong>Tóm tắt yêu cầu</strong>
              <span>{selectedTask.ai.model}</span>
            </div>
            <p>{selectedTask.ai.summary}</p>
            <p>
              <strong>Đối chiếu phản hồi:</strong> {selectedTask.ai.reason}
            </p>
            {selectedTask.ai.nextAction && (
              <p>
                <strong>Tiếp theo:</strong> {selectedTask.ai.nextAction}
              </p>
            )}
            {selectedTask.ai.stale && (
              <p className="field-note">
                Có tin mới sau lần phân tích. Phân tích lại để cập nhật nhận
                định.
              </p>
            )}
            {selectedTask.ai.completionSuggested &&
              selectedTask.status !== "done" && (
                <p className="completion-suggestion">
                  Có dấu hiệu việc đã xong. Kiểm tra chứng cứ rồi bấm Hoàn thành
                  để xác nhận.
                </p>
              )}
            {selectedTask.ai.suggestedReply && (
              <details className="reply-draft">
                <summary>Bản nháp phản hồi</summary>
                <p>{selectedTask.ai.suggestedReply}</p>
                <button
                  className="button secondary"
                  onClick={() => void onCopy(selectedTask.ai!.suggestedReply)}
                >
                  <Copy size={16} />
                  Sao chép bản nháp
                </button>
              </details>
            )}
          </div>
        )}
        <p className="detail-description">
          {selectedTask.description || "Chưa có ghi chú."}
        </p>
        <div className="detail-fields">
          <label>
            Trạng thái
            <select
              value={selectedTask.status}
              onChange={(event) =>
                void patchTask(selectedTask, {
                  status: event.target.value as TaskStatus,
                })
              }
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Độ ưu tiên
            <select
              value={selectedTask.priority}
              onChange={(event) =>
                void patchTask(selectedTask, {
                  priority: event.target.value as Task["priority"],
                })
              }
            >
              {Object.entries(priorityLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span>
            <small>Hạn hoàn thành</small>
            <strong>
              {selectedTask.dueAt
                ? `${clock(selectedTask.dueAt)} · ${shortDate(selectedTask.dueAt)}`
                : "Chưa xác định"}
            </strong>
          </span>
        </div>
        {selectedTask.replyStatus === "uncertain" && (
          <div className="context-note">
            <WarningCircle size={18} />
            Chưa đủ bằng chứng rằng bạn đã trả lời đúng yêu cầu. Đọc dẫn chứng
            hoặc phân tích tin trong ngày để kiểm tra.
          </div>
        )}
        {selectedTask.context.length > 0 && (
          <>
            <SectionHead
              title="Ngữ cảnh hội thoại"
              subtitle={
                selectedTask.ai
                  ? "Tin gốc và dẫn chứng AI dùng để đối chiếu, gồm cả câu trả lời không reply trực tiếp."
                  : "Tin gốc và các tin liên quan đã tải. AI chỉ phân tích trong ngày bạn đang chọn."
              }
            />
            <div className="conversation">
              {selectedTask.context.map((message) => (
                <div
                  key={message.id}
                  className={`conversation-message ${message.outgoing ? "outgoing" : ""} ${message.id === selectedTask.sourceId ? "source-message" : ""}`}
                >
                  <div>
                    <strong>{message.sender}</strong>
                    <span className="message-direction">
                      {message.outgoing ? "Bạn gửi" : "Bạn nhận"}
                    </span>
                    <time>
                      {clock(message.date)} · {shortDate(message.date)}
                    </time>
                    {message.id === selectedTask.sourceId && (
                      <span className="message-source-flag">
                        Tin gốc · Cần đọc
                      </span>
                    )}
                  </div>
                  <p>{message.text}</p>
                  {message.attachment && (
                    <p className="message-attachment">
                      Tệp đính kèm: {message.attachment.name}
                    </p>
                  )}
                  <small className="conversation-location">
                    {message.chat}
                  </small>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="detail-actions">
          {selectedTask.context
            .find((message) => message.id === selectedTask.sourceId)
            ?.url?.startsWith("https://t.me/") && (
            <a
              className="button secondary"
              href={
                selectedTask.context.find(
                  (message) => message.id === selectedTask.sourceId,
                )?.url ?? undefined
              }
              target="_blank"
              rel="noreferrer"
            >
              <TelegramLogo size={17} />
              Mở Telegram
              <ArrowUpRight size={15} />
            </a>
          )}
          {selectedTask.kind !== "manual" && !isDemo && (
            <button
              className="button secondary"
              disabled={analyzing}
              onClick={() =>
                void onAnalyze(
                  selectedTask.chatId || selectedTask.sourceId?.split(":")[0],
                )
              }
            >
              <Sparkle size={17} />
              {analyzing
                ? "AI đang phân tích…"
                : "Phân tích hội thoại trong ngày"}
            </button>
          )}
          {selectedTask.kind !== "manual" && (
            <button
              className="button secondary"
              onClick={() =>
                void patchTask(selectedTask, {
                  replyStatus:
                    selectedTask.replyStatus === "replied"
                      ? "unanswered"
                      : "replied",
                })
              }
            >
              <Check size={17} />
              {selectedTask.replyStatus === "replied"
                ? "Đánh dấu chưa phản hồi"
                : "Xác nhận đã phản hồi"}
            </button>
          )}
          <button
            className="button secondary"
            onClick={() =>
              void patchTask(selectedTask, {
                snoozedUntil: new Date(Date.now() + 3600000).toISOString(),
              })
            }
          >
            <Clock size={17} />
            Nhắc sau 1 giờ
          </button>
          <button
            className="button primary"
            onClick={() =>
              void patchTask(selectedTask, {
                status: selectedTask.status === "done" ? "todo" : "done",
              })
            }
          >
            <CheckCircle size={18} />
            {selectedTask.status === "done" ? "Mở lại công việc" : "Hoàn thành"}
          </button>
        </div>
        {selectedTask.snoozedUntil && (
          <p className="field-note">
            Nhắc lại lúc {clock(selectedTask.snoozedUntil)} ·{" "}
            {shortDate(selectedTask.snoozedUntil)}
            {isDemo && " (dữ liệu mẫu)"}
          </p>
        )}
        {selectedTask.kind === "manual" && (
          <button
            className="text-button danger"
            onClick={() => void removeTask(selectedTask)}
          >
            <Trash size={15} />
            Xóa công việc
          </button>
        )}
        <p className="field-note">
          Xác nhận phản hồi chỉ cập nhật BA Desk. Hãy trả lời trong Telegram
          trước khi đánh dấu.
        </p>
      </div>
    </Modal>
  );
}
