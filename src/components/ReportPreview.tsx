import type { Report, ReportPerson } from "../types";
import { clock, shortDate } from "../utils/dates";
import { replyLabels } from "../utils/labels";
function Requirement({ task }: { task: ReportPerson["tasks"][number] }) {
  return (
    <article
      className={`report-requirement ${task.status === "done" ? "report-complete" : ""}`}
    >
      <div>
        <time>{clock(task.createdAt)}</time>
        <h4>{task.title}</h4>
        <span className={`reply-badge reply-${task.replyStatus}`}>
          {task.status === "done"
            ? needsAttention(task)
              ? `${replyLabels[task.replyStatus]} · Xong`
              : "Hoàn thành"
            : replyLabels[task.replyStatus]}
        </span>
      </div>
      <p className="report-source">
        {task.project}
        {task.dueAt && ` · Hạn ${shortDate(task.dueAt)} ${clock(task.dueAt)}`}
        {task.status === "doing" && " · Đang làm"}
      </p>
      {(task.summary || task.nextAction || task.url) && (
        <details className="report-evidence">
          <summary>Xem chi tiết</summary>
          {task.summary && <p>{task.summary}</p>}
          {task.status !== "done" && task.nextAction && (
            <p>
              <strong>Tiếp theo:</strong> {task.nextAction}
            </p>
          )}
          {task.url?.startsWith("https://t.me/") && (
            <a href={task.url} target="_blank" rel="noreferrer">
              Mở tin gốc trên Telegram
            </a>
          )}
        </details>
      )}
    </article>
  );
}
function needsAttention(task: ReportPerson["tasks"][number]) {
  return (
    task.status !== "done" ||
    ["unanswered", "uncertain"].includes(task.replyStatus)
  );
}
function PersonReport({ person }: { person: ReportPerson }) {
  const focus = person.tasks.filter(needsAttention);
  const finished = person.tasks.filter((task) => !needsAttention(task));
  const more = [...focus.slice(3), ...finished];
  return (
    <section className="report-person">
      <h3>
        {person.name}
        <span>{person.tasks.length} yêu cầu</span>
      </h3>
      {focus.slice(0, 3).map((task) => (
        <Requirement key={task.id} task={task} />
      ))}
      {more.length > 0 && (
        <details className="report-more">
          <summary>
            {focus.length > 3 && `${focus.length - 3} yêu cầu khác · `}
            {finished.length > 0 && `${finished.length} hoàn thành`}
          </summary>
          {more.map((task) => (
            <Requirement key={task.id} task={task} />
          ))}
        </details>
      )}
    </section>
  );
}
export function ReportPreview({ report }: { report: Report }) {
  if (!report.people) return <pre className="report-body">{report.body}</pre>;
  const tasks = report.people.flatMap((person) => person.tasks);
  return (
    <div className="report-preview">
      <div className="report-preview-summary">
        <strong>
          {tasks.filter((task) => task.status !== "done").length} việc chưa xong
        </strong>
        <span>
          {
            tasks.filter((task) =>
              ["unanswered", "uncertain"].includes(task.replyStatus),
            ).length
          }{" "}
          cần phản hồi
        </span>
        <span>
          {tasks.filter((task) => task.status === "done").length} hoàn thành
        </span>
      </div>
      <p className="field-note">
        {report.analysis
          ? `Phân tích ${report.analysis.model} · ${report.analysis.coverage?.messages || 0} tin trong ${report.analysis.coverage?.chats || 0} hội thoại.`
          : "Báo cáo từ dữ liệu đã đồng bộ."}{" "}
        {report.analysisError && `AI chưa hoàn tất: ${report.analysisError}`}
      </p>
      {report.syncWarning && (
        <p className="form-error" role="status">
          Dữ liệu chưa đầy đủ: {report.syncWarning}
        </p>
      )}
      {report.people.length ? (
        report.people.map((person) => (
          <PersonReport key={person.id} person={person} />
        ))
      ) : (
        <p>Không có yêu cầu trong phạm vi đang theo dõi.</p>
      )}
    </div>
  );
}
