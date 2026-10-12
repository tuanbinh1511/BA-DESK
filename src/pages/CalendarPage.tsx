import type { ReactNode } from "react";
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  Clock,
  Moon,
  Plus,
  Sun,
} from "@phosphor-icons/react";
import type { CalendarEvent, Page, Workspace } from "../types";
import { dateOf, longDate, shiftDay, today } from "../utils/dates";
import { SectionHead, Agenda } from "../components/WorkspaceUI";
export function CalendarPage({
  day,
  setDay,
  datePicker,
  ws,
  agenda,
  setSelectedEvent,
  setModal,
  isDemo,
  navigate,
}: {
  day: string;
  setDay: (value: string) => void;
  datePicker: ReactNode;
  ws: Workspace;
  agenda: CalendarEvent[];
  setSelectedEvent: (event: CalendarEvent) => void;
  setModal: (value: "event") => void;
  isDemo: boolean;
  navigate: (page: Page) => void;
}) {
  return (
    <>
      <div className="calendar-controls">
        <div className="calendar-nav">
          <button
            className="icon-button"
            onClick={() => setDay(shiftDay(day, -1))}
            aria-label="Ngày trước"
          >
            <CaretLeft size={19} />
          </button>
          {datePicker}
          <button
            className="icon-button"
            onClick={() => setDay(shiftDay(day, 1))}
            aria-label="Ngày sau"
          >
            <CaretRight size={19} />
          </button>
          <button
            className="button secondary small-button"
            onClick={() => setDay(today())}
          >
            Hôm nay
          </button>
        </div>
        <span className="subtle-label">Asia/Ho_Chi_Minh · GMT+7</span>
      </div>
      <div className="calendar-grid">
        <section className="panel">
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, i) => shiftDay(day, i - 3)).map(
              (date) => (
                <button
                  key={date}
                  className={date === day ? "selected" : ""}
                  onClick={() => setDay(date)}
                >
                  <small>
                    {new Intl.DateTimeFormat("vi-VN", {
                      weekday: "short",
                      timeZone: "Asia/Ho_Chi_Minh",
                    }).format(new Date(`${date}T12:00:00+07:00`))}
                  </small>
                  <strong>{Number(date.slice(-2))}</strong>
                  <span
                    className={
                      ws.events.some((event) => dateOf(event.start) === date)
                        ? "has-event"
                        : ""
                    }
                  />
                </button>
              ),
            )}
          </div>
          <SectionHead
            title={longDate(day)}
            subtitle={`${agenda.length} cuộc hẹn trong ngày`}
          />
          <Agenda events={agenda} onOpen={setSelectedEvent} />
        </section>
        <div className="calendar-side">
          <section className="panel schedule-panel">
            <SectionHead title="Nhịp nhắc việc mỗi ngày" />
            <div className="schedule-row">
              <span className="schedule-icon tone-green">
                <Sun size={22} />
              </span>
              <span>
                <strong>Bắt đầu ngày mới</strong>
                <small>Tổng hợp việc & tin cần trả lời</small>
              </span>
              <b>{ws.settings.morning}</b>
            </div>
            <div className="schedule-row">
              <span className="schedule-icon tone-purple">
                <Moon size={21} />
              </span>
              <span>
                <strong>Khép lại một ngày</strong>
                <small>Rà soát những việc chưa xong</small>
              </span>
              <b>{ws.settings.evening}</b>
            </div>
            <div className="schedule-footer">
              <span className="mini-dot" />
              {ws.settings.enabled
                ? isDemo
                  ? "Lịch mẫu · chưa chạy"
                  : "Đã bật lịch nhắc"
                : "Tạm dừng lịch nhắc"}
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                Chỉnh sửa
                <ArrowRight size={14} />
              </button>
            </div>
          </section>
          <section className="focus-note">
            <span className="focus-label">
              <Clock size={17} />
              DÀNH THỜI GIAN TẬP TRUNG
            </span>
            <h3>
              Ít gián đoạn.
              <br />
              Nhiều tiến triển.
            </h3>
            <p>
              Đặt một khoảng 45 phút để xử lý BRD, phân tích luồng hoặc chuẩn bị
              workshop.
            </p>
            <button
              className="button secondary"
              onClick={() => setModal("event")}
            >
              <Plus size={16} />
              Đặt lịch tập trung
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
