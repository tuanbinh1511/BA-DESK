import {
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  CheckSquare,
  FunnelSimple,
  Plus,
  Sun,
} from "@phosphor-icons/react";
import type { CalendarEvent, Page, Task, Workspace, TaskPatch } from "../types";
import { clock, initials, longDate } from "../utils/dates";
import { replyLabels } from "../utils/labels";
import { Empty, SectionHead, Agenda } from "../components/WorkspaceUI";
import { TaskRow } from "../components/TaskRow";
import { BrandHero } from "../components/BrandHero";
export function OverviewPage({
  ws,
  tasks,
  active,
  waiting,
  done,
  agenda,
  high,
  day,
  filter,
  setFilter,
  visibleTasks,
  setSelectedTask,
  patchTask,
  setModal,
  setSelectedEvent,
  navigate,
  makeReport,
  busy,
  isDemo,
}: {
  ws: Workspace;
  tasks: Task[];
  active: Task[];
  waiting: Task[];
  done: Task[];
  agenda: CalendarEvent[];
  high: number;
  day: string;
  filter: string;
  setFilter: (value: string) => void;
  visibleTasks: Task[];
  setSelectedTask: (task: Task) => void;
  patchTask: (task: Task, patch: TaskPatch) => Promise<void>;
  setModal: (value: "task" | "event") => void;
  setSelectedEvent: (event: CalendarEvent) => void;
  navigate: (page: Page) => void;
  makeReport: (open?: boolean) => Promise<void>;
  busy: boolean;
  isDemo: boolean;
}) {
  return (
    <>
      <BrandHero
        morning={ws.settings.morning}
        evening={ws.settings.evening}
        reminderEnabled={ws.settings.enabled && !isDemo}
        busy={busy}
        onReport={() => void makeReport()}
        onSettings={() => navigate("settings")}
        onIntroduce={() => navigate("introduce")}
      />
      <section className="stats-grid">
        {[
          {
            label: "Công việc đang mở",
            value: active.length,
            icon: CheckSquare,
            color: "green",
            note: `${high} ưu tiên cao · ${active.filter((task) => task.kind !== "manual").length} từ Telegram`,
            trend: "tasks",
          },
          {
            label: "Cần bạn phản hồi",
            value: waiting.length,
            icon: ChatCircleDots,
            color: "orange",
            note: `${waiting.filter((task) => task.kind === "private").length} tin riêng · ${waiting.filter((task) => task.kind === "group").length} từ nhóm`,
            trend: "inbox",
          },
          {
            label: "Đã hoàn thành",
            value: `${done.length}`,
            total: ` / ${tasks.length}`,
            icon: CheckCircle,
            color: "purple",
            note: tasks.length
              ? `${Math.round((done.length / tasks.length) * 100)}% công việc trong danh sách`
              : "Sẵn sàng cho ngày mới",
            trend: "done",
          },
          {
            label: "Cuộc hẹn trong ngày",
            value: agenda.length,
            icon: CalendarBlank,
            color: "blue",
            note: agenda[0]
              ? `Bắt đầu lúc ${clock(agenda[0].start)}`
              : "Chưa có lịch hẹn",
            trend: "calendar",
          },
        ].map(
          ({
            label,
            value,
            total,
            icon: IconComponent,
            color,
            note,
            trend,
          }) => (
            <button
              className="stat-card"
              key={label}
              onClick={() => {
                if (trend === "done") {
                  navigate("tasks");
                  setFilter("done");
                } else navigate(trend as Page);
              }}
            >
              <div>
                <span>{label}</span>
                <span className={`stat-icon tone-${color}`}>
                  <IconComponent size={20} weight="duotone" />
                </span>
              </div>
              <strong>
                {value}
                <small>{total}</small>
              </strong>
              <p>
                {note}
                <ArrowUpRight size={14} />
              </p>
            </button>
          ),
        )}
      </section>
      <div className="dashboard-grid">
        <section className="panel work-panel">
          <SectionHead
            title="Cần bạn xử lý"
            subtitle="Đầu việc rõ ràng, thứ tự hợp lý."
            action={
              <button className="text-button" onClick={() => navigate("tasks")}>
                Xem tất cả
                <ArrowRight size={14} />
              </button>
            }
          />
          <div className="panel-toolbar">
            <div className="tabs compact-tabs">
              <button
                className={filter === "all" ? "selected" : ""}
                onClick={() => setFilter("all")}
              >
                Tất cả<span>{active.length}</span>
              </button>
              <button
                className={filter === "priority" ? "selected" : ""}
                onClick={() => setFilter("priority")}
              >
                Ưu tiên cao
              </button>
              <button
                className={filter === "waiting" ? "selected" : ""}
                onClick={() => setFilter("waiting")}
              >
                Chưa phản hồi
              </button>
            </div>
            <FunnelSimple size={17} className="muted" />
          </div>
          <div className="task-list">
            {visibleTasks.length ? (
              [...visibleTasks]
                .sort(
                  (a, b) =>
                    Number(b.priority === "high") -
                    Number(a.priority === "high"),
                )
                .slice(0, 5)
                .map((task) => (
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
                ))
            ) : (
              <Empty />
            )}
          </div>
          <button className="panel-bottom" onClick={() => setModal("task")}>
            <Plus size={16} />
            Thêm một việc cần nhớ
          </button>
        </section>
        <section className="panel agenda-panel">
          <SectionHead
            title="Lịch hôm nay"
            action={
              <button
                className="icon-button small"
                onClick={() => navigate("calendar")}
                aria-label="Xem lịch làm việc"
              >
                <ArrowUpRight size={18} />
              </button>
            }
          />
          <div className="agenda-date">
            <span className="calendar-sheet">
              <strong>{Number(day.slice(-2))}</strong>
              <small>THÁNG {Number(day.slice(5, 7))}</small>
            </span>
            <span>
              <strong>{longDate(day).split(",")[0]}</strong>
              <small>{agenda.length} cuộc hẹn · Giờ Việt Nam</small>
            </span>
          </div>
          <Agenda events={agenda} onOpen={setSelectedEvent} compact />
          <button className="panel-bottom" onClick={() => setModal("event")}>
            <Plus size={16} />
            Đặt lịch mới
          </button>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel reply-panel">
          <SectionHead
            title="Đừng để hội thoại chờ lâu"
            subtitle="Một phản hồi nhỏ, công việc tiến thêm một bước."
            action={
              <span className="soft-badge orange">
                {waiting.length} cần chú ý
              </span>
            }
          />
          {waiting.slice(0, 2).map((task) => (
            <button
              key={task.id}
              className="reply-preview"
              onClick={() => setSelectedTask(task)}
            >
              <span className={`avatar avatar-${task.sender.length % 4}`}>
                {initials(task.sender)}
              </span>
              <span>
                <strong>
                  {task.sender}
                  <small>
                    {task.kind === "private" ? "Tin nhắn riêng" : task.project}
                  </small>
                </strong>
                <p>{task.description}</p>
              </span>
              <span className={`reply-badge reply-${task.replyStatus}`}>
                {replyLabels[task.replyStatus]}
              </span>
              <CaretRight size={16} />
            </button>
          ))}
          {!waiting.length && (
            <Empty
              title="Không còn hội thoại chờ"
              text="Bạn đã xử lý các tin cần phản hồi trong danh sách."
            />
          )}
        </section>
        <section className="focus-note">
          <span className="focus-label">
            <Sun size={17} />
            Cảm hứng mỗi ngày
          </span>
          <h3>
            Xinh gái là một mood.
            <br />
            Khí chất là của bạn.
          </h3>
          <p>
            Bản tin lúc {ws.settings.morning}. Rà soát lúc {ws.settings.evening}
            . Mình vẫn làm thật tốt, theo nhịp riêng của mình.
          </p>
          <button className="text-button" onClick={() => navigate("settings")}>
            Thiết lập nhắc việc
            <ArrowRight size={15} />
          </button>
          <span className="note-decoration" aria-hidden="true">
            ↗
          </span>
        </section>
      </div>
    </>
  );
}
