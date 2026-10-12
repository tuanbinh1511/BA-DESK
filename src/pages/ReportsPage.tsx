import type { ReactNode } from "react";
import { ArrowRight, CaretRight, FileText } from "@phosphor-icons/react";
import type { Report, Task, Workspace } from "../types";
import { clock, longDate, dateOf } from "../utils/dates";
import { Empty, SectionHead } from "../components/WorkspaceUI";
import { AIStatus } from "../components/AIStatus";
export function ReportsPage({
  ws,
  isDemo,
  active,
  waiting,
  done,
  day,
  datePicker,
  busy,
  makeReport,
  setReport,
  onAnalyze,
}: {
  ws: Workspace;
  isDemo: boolean;
  active: Task[];
  waiting: Task[];
  done: Task[];
  day: string;
  datePicker: ReactNode;
  busy: boolean;
  makeReport: (open?: boolean) => Promise<void>;
  setReport: (report: Report) => void;
  onAnalyze: () => Promise<void>;
}) {
  return (
    <>
      <div className="daily-report-head">
        <div>
          <h2>{longDate(day)}</h2>
          <p>
            Chỉ tin trong ngày · Theo người giao · {ws.settings.morning} và{" "}
            {ws.settings.evening} · giờ Việt Nam{isDemo && " · Dữ liệu mẫu"}
          </p>
        </div>
        {datePicker}
      </div>
      <div className="report-metrics">
        <div>
          <strong>
            {waiting.filter((task) => dateOf(task.createdAt) === day).length}
          </strong>
          <span>Cần phản hồi / kiểm tra</span>
        </div>
        <div>
          <strong>
            {active.filter((task) => dateOf(task.createdAt) === day).length}
          </strong>
          <span>Việc chưa hoàn thành</span>
        </div>
        <div>
          <strong>
            {done.filter((task) => dateOf(task.createdAt) === day).length}
          </strong>
          <span>Đã hoàn thành</span>
        </div>
        <button
          className="button primary"
          disabled={busy || ws.ai.running}
          onClick={() => void makeReport()}
        >
          {busy ? "Đang tổng hợp…" : "Tạo báo cáo"}
          <ArrowRight size={17} />
        </button>
      </div>
      <AIStatus ai={ws.ai} onAnalyze={onAnalyze} disabled={busy} />
      <section className="panel report-history">
        <SectionHead
          title="Báo cáo đã lưu"
          subtitle="Mỗi bản giữ nguyên kết quả và dẫn chứng tại thời điểm tạo."
        />
        {ws.reports.length ? (
          ws.reports.map((report) => (
            <button
              className="report-history-item"
              key={report.id}
              onClick={() => setReport(report)}
            >
              <span className="report-file-icon">
                <FileText size={23} />
              </span>
              <span>
                <strong>
                  {report.kind === "morning"
                    ? "Bản tin buổi sáng"
                    : report.kind === "evening"
                      ? "Rà soát cuối ngày"
                      : "Báo cáo công việc"}
                </strong>
                <small>
                  {longDate(report.date)} · {clock(report.createdAt)} ·{" "}
                  {report.analysis?.model || "Dữ liệu đồng bộ"}
                </small>
              </span>
              <CaretRight size={18} />
            </button>
          ))
        ) : (
          <Empty
            icon={FileText}
            title="Chưa có báo cáo"
            text="Tạo báo cáo đầu tiên để tổng hợp công việc theo người."
          />
        )}
      </section>
    </>
  );
}
