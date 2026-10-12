import { PersonGroups } from "../components/PersonGroups";
import type { ReactNode } from "react";
import type { Task, TaskPatch } from "../types";
import { Empty } from "../components/WorkspaceUI";
import { TaskRow } from "../components/TaskRow";
export function TasksPage({
  filter,
  setFilter,
  active,
  done,
  datePicker,
  visibleTasks,
  setSelectedTask,
  patchTask,
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
  query: string;
}) {
  return (
    <section className="panel full-panel">
      <div className="full-toolbar">
        <div className="tabs">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Đang mở<span>{active.length}</span>
          </button>
          <button
            className={filter === "priority" ? "selected" : ""}
            onClick={() => setFilter("priority")}
          >
            Ưu tiên cao
          </button>
          <button
            className={filter === "doing" ? "selected" : ""}
            onClick={() => setFilter("doing")}
          >
            Đang làm
          </button>
          <button
            className={filter === "waiting" ? "selected" : ""}
            onClick={() => setFilter("waiting")}
          >
            Cần phản hồi
          </button>
          <button
            className={filter === "overdue" ? "selected" : ""}
            onClick={() => setFilter("overdue")}
          >
            Quá hạn
          </button>
          <button
            className={filter === "review" ? "selected" : ""}
            onClick={() => setFilter("review")}
          >
            Xác nhận hoàn thành
          </button>
          <button
            className={filter === "done" ? "selected" : ""}
            onClick={() => setFilter("done")}
          >
            Hoàn thành<span>{done.length}</span>
          </button>
        </div>
        {datePicker}
      </div>
      <div className="table-labels">
        <span>Công việc theo người giao</span>
        <span>Ưu tiên · hạn xử lý</span>
      </div>
      {visibleTasks.length ? (
        <PersonGroups tasks={visibleTasks}>
          {(task) => (
            <TaskRow
              key={task.id}
              task={task}
              onOpen={setSelectedTask}
              onToggle={(task) =>
                void patchTask(task, {
                  status: task.status === "done" ? "todo" : "done",
                })
              }
            />
          )}
        </PersonGroups>
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
