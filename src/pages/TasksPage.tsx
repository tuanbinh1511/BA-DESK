import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle, ChatCircleDots } from "@phosphor-icons/react";
import type { Task, TaskPatch, TaskStatus } from "../types";
import { Empty } from "../components/WorkspaceUI";
import { TaskRow } from "../components/TaskRow";
import { groupByPerson } from "../utils/people";
import { initials } from "../utils/dates";
import "./tasks.css";
export function TasksPage({
  filter,
  setFilter,
  active,
  done,
  datePicker,
  visibleTasks,
  setSelectedTask,
  patchTask,
  patchTasks,
  query,
}: {
  filter: string;
  setFilter: (value: string) => void;
  active: Task[];
  done: Task[];
  datePicker: ReactNode;
  visibleTasks: Task[];
  setSelectedTask: (task: Task) => void;
  patchTask: (task: Task, patch: TaskPatch) => Promise<void>;
  patchTasks: (tasks: Task[], status: TaskStatus) => Promise<void>;
  query: string;
}) {
  const people = groupByPerson(visibleTasks);
  const [personId, setPersonId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const person = people.find((item) => item.id === personId) ?? people[0];
  const selected = visibleTasks.filter((task) => selection.has(task.id));
  const allSelected =
    visibleTasks.length > 0 && selected.length === visibleTasks.length;

  function toggleSelection(task: Task) {
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }
  function changeFilter(value: string) {
    setSelection(new Set());
    setError("");
    setFilter(value);
  }
  async function updateSelected(status: TaskStatus) {
    setSaving(true);
    setError("");
    try {
      await patchTasks(selected, status);
      setSelection(new Set());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Chưa cập nhật được. Thử lại sau.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel full-panel task-desk" aria-busy={saving}>
      <div className="full-toolbar">
        <div className="tabs">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => changeFilter("all")}
          >
            Đang mở<span>{active.length}</span>
          </button>
          <button
            className={filter === "priority" ? "selected" : ""}
            onClick={() => changeFilter("priority")}
          >
            Ưu tiên cao
          </button>
          <button
            className={filter === "doing" ? "selected" : ""}
            onClick={() => changeFilter("doing")}
          >
            Đang làm
          </button>
          <button
            className={filter === "waiting" ? "selected" : ""}
            onClick={() => changeFilter("waiting")}
          >
            Cần phản hồi
          </button>
          <button
            className={filter === "overdue" ? "selected" : ""}
            onClick={() => changeFilter("overdue")}
          >
            Quá hạn
          </button>
          <button
            className={filter === "review" ? "selected" : ""}
            onClick={() => changeFilter("review")}
          >
            Xác nhận hoàn thành
          </button>
          <button
            className={filter === "done" ? "selected" : ""}
            onClick={() => changeFilter("done")}
          >
            Hoàn thành<span>{done.length}</span>
          </button>
        </div>
        {datePicker}
      </div>
      {visibleTasks.length ? (
        <>
          <div className="task-bulk-bar">
            <label className="task-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={saving}
                ref={(node) => {
                  if (node)
                    node.indeterminate = selected.length > 0 && !allSelected;
                }}
                onChange={() =>
                  setSelection(
                    allSelected
                      ? new Set()
                      : new Set(visibleTasks.map((task) => task.id)),
                  )
                }
              />
              Chọn tất cả <span>{visibleTasks.length}</span>
            </label>
            <span className="task-bulk-hint" aria-live="polite">
              {selected.length
                ? `${selected.length} việc · ${groupByPerson(selected).length} người đã chọn`
                : `${people.length} người giao · chọn người để xem việc`}
            </span>
            {selected.length > 0 && (
              <div className="task-bulk-actions">
                <button
                  className="button primary"
                  disabled={saving}
                  onClick={() => void updateSelected("done")}
                >
                  <CheckCircle size={16} />
                  {saving ? "Đang lưu…" : `Hoàn thành ${selected.length} việc`}
                </button>
                <button
                  className="button secondary"
                  disabled={saving}
                  onClick={() =>
                    void updateSelected(filter === "done" ? "todo" : "doing")
                  }
                >
                  {filter === "done" ? "Mở lại" : "Đang làm"}
                </button>
                <button
                  className="text-button"
                  disabled={saving}
                  onClick={() => setSelection(new Set())}
                >
                  Bỏ chọn
                </button>
              </div>
            )}
          </div>
          {error && (
            <p className="task-bulk-error" role="alert">
              {error}
            </p>
          )}
          <div className="chat-workspace task-chat-workspace">
            <nav
              className="chat-list task-people"
              aria-label="Người giao công việc"
            >
              <div className="task-people-label">
                <ChatCircleDots size={17} /> Hội thoại giao việc
              </div>
              {people.map((item) => {
                const waiting = item.tasks.filter(
                  (task) =>
                    task.replyStatus === "unanswered" ||
                    task.replyStatus === "uncertain",
                ).length;
                const high = item.tasks.filter(
                  (task) => task.priority === "high" && task.status !== "done",
                ).length;
                return (
                  <button
                    key={item.id}
                    disabled={saving}
                    className={`chat-list-item ${person?.id === item.id ? "selected" : ""}`}
                    aria-pressed={person?.id === item.id}
                    onClick={() => setPersonId(item.id)}
                  >
                    <span className={`avatar avatar-${item.name.length % 4}`}>
                      {initials(item.name)}
                    </span>
                    <span className="chat-list-copy">
                      <strong>{item.name}</strong>
                      <span>{item.tasks[0]?.title}</span>
                      <small>
                        {item.tasks.length} việc
                        {waiting > 0 && ` · ${waiting} cần trả lời`}
                        {high > 0 && ` · ${high} ưu tiên`}
                      </small>
                    </span>
                    <span className="task-person-count">
                      {item.tasks.length}
                    </span>
                  </button>
                );
              })}
            </nav>
            {person && (
              <section
                className="chat-thread task-thread"
                aria-label={`Công việc từ ${person.name}`}
              >
                <header className="chat-thread-head">
                  <div>
                    <h2>{person.name}</h2>
                    <p>
                      {person.tasks.length} việc ·{" "}
                      {
                        person.tasks.filter((task) => task.status === "doing")
                          .length
                      }{" "}
                      đang làm ·{" "}
                      {
                        person.tasks.filter((task) => task.status === "done")
                          .length
                      }{" "}
                      đã xong
                    </p>
                  </div>
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() =>
                      setSelection(
                        (previous) =>
                          new Set([
                            ...previous,
                            ...person.tasks.map((task) => task.id),
                          ]),
                      )
                    }
                  >
                    Chọn {person.tasks.length} việc của người này
                  </button>
                </header>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={person.id}
                    className="task-thread-items"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                  >
                    {person.tasks.map((task) => (
                      <article
                        key={task.id}
                        className={`task-message ${selection.has(task.id) ? "is-selected" : ""}`}
                      >
                        <label className="task-pick">
                          <input
                            type="checkbox"
                            disabled={saving}
                            checked={selection.has(task.id)}
                            onChange={() => toggleSelection(task)}
                            aria-label={`Chọn: ${task.title}`}
                          />
                        </label>
                        <TaskRow
                          task={task}
                          onOpen={setSelectedTask}
                          onToggle={(item) => {
                            if (!saving)
                              void patchTask(item, {
                                status:
                                  item.status === "done" ? "todo" : "done",
                              });
                          }}
                        />
                      </article>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </section>
            )}
          </div>
        </>
      ) : (
        <Empty
          title={
            query ? "Không tìm thấy công việc" : "Danh sách này đang trống"
          }
          text={
            query
              ? "Thử một từ khóa khác hoặc đổi bộ lọc."
              : "Thêm công việc hoặc đồng bộ Telegram để bắt đầu."
          }
        />
      )}
      <div className="list-footer">
        <span>
          {visibleTasks.length} công việc{query && ` · “${query}”`}
        </span>
        <span>Gồm việc chưa xong từ những ngày trước</span>
      </div>
    </section>
  );
}
