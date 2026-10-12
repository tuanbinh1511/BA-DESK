import type { ReactNode } from "react";
import { CalendarBlank, CaretRight, CheckCircle } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { CalendarEvent } from "../types";
import { clock } from "../utils/dates";
export function Empty({
  icon: IconComponent = CheckCircle,
  title = "Mọi việc đã gọn gàng",
  text = "Bạn không có công việc nào ở mục này.",
}: {
  icon?: Icon;
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty-state">
      <IconComponent size={38} weight="duotone" />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function SectionHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Agenda({
  events,
  onOpen,
  compact = false,
}: {
  events: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
  compact?: boolean;
}) {
  return (
    <div className={`agenda ${compact ? "agenda-compact" : ""}`}>
      {events.length ? (
        events.map((event) => (
          <button
            key={event.id}
            className={`agenda-item agenda-${event.color}`}
            onClick={() => onOpen(event)}
          >
            <span className="agenda-time">
              {clock(event.start)}
              <small>{clock(event.end)}</small>
            </span>
            <span className="agenda-line" />
            <span className="agenda-content">
              <strong>{event.title}</strong>
              <span>
                {event.note || `${clock(event.start)} – ${clock(event.end)}`}
              </span>
              <small>
                {Math.round(
                  (new Date(event.end).getTime() -
                    new Date(event.start).getTime()) /
                    60000,
                )}{" "}
                phút
              </small>
            </span>
            <CaretRight size={15} />
          </button>
        ))
      ) : (
        <Empty
          icon={CalendarBlank}
          title="Một khoảng trống cho bạn"
          text="Chưa có cuộc hẹn. Dành thời gian cho việc cần tập trung."
        />
      )}
    </div>
  );
}
