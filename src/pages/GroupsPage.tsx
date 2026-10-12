import { useState } from "react";
import {
  MagnifyingGlass,
  Users,
  Eye,
  EyeSlash,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import type { TelegramGroup } from "../types";
import { clock, shortDate } from "../utils/dates";
import { Empty } from "../components/WorkspaceUI";
export function GroupsPage({
  groups,
  onToggle,
  onSync,
  syncing,
}: {
  groups: TelegramGroup[];
  onToggle: (group: TelegramGroup) => Promise<void>;
  onSync: () => Promise<void>;
  syncing: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [pending, setPending] = useState<string | null>(null);
  const visible = groups.filter(
    (group) =>
      group.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (filter === "all" || group.ignored === (filter === "ignored")),
  );
  return (
    <section className="panel full-panel groups-panel">
      <div className="full-toolbar">
        <div className="tabs">
          {[
            { id: "all", label: `Tất cả · ${groups.length}` },
            { id: "watched", label: "Đang theo dõi" },
            { id: "ignored", label: "Đã bỏ qua" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={filter === item.id ? "selected" : ""}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          className="button secondary"
          disabled={syncing}
          onClick={() => void onSync()}
        >
          <ArrowsClockwise size={16} className={syncing ? "spin" : ""} />
          Cập nhật nhóm
        </button>
      </div>
      <p className="groups-explanation">
        Nhóm bỏ qua sẽ được loại khỏi công việc, phân tích AI, báo cáo và nhắc
        hạn. Tin nhắn gốc vẫn được tải để bạn có thể tra cứu.
      </p>
      <label className="group-search">
        <MagnifyingGlass size={18} />
        <input
          aria-label="Tìm nhóm Telegram"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm theo tên nhóm…"
        />
      </label>
      <div className="group-list">
        {visible.length ? (
          visible.map((group) => (
            <div
              key={group.id}
              className={`group-entry ${group.ignored ? "group-ignored" : ""}`}
            >
              <span className="group-symbol">
                <Users size={23} />
              </span>
              <div className="group-name">
                <strong>{group.name}</strong>
                <span>
                  {group.lastMessageAt
                    ? `Tin gần nhất ${shortDate(group.lastMessageAt)} · ${clock(group.lastMessageAt)}`
                    : "Chưa có thời gian tin gần nhất"}
                </span>
              </div>
              <button
                className={`button ${group.ignored ? "secondary" : "quiet"}`}
                disabled={pending === group.id}
                aria-pressed={!group.ignored}
                onClick={async () => {
                  setPending(group.id);
                  try {
                    await onToggle(group);
                  } finally {
                    setPending(null);
                  }
                }}
              >
                {group.ignored ? <Eye size={17} /> : <EyeSlash size={17} />}
                {group.ignored ? "Theo dõi lại" : "Bỏ qua nhóm"}
              </button>
            </div>
          ))
        ) : (
          <Empty
            icon={Users}
            title="Chưa có nhóm phù hợp"
            text="Đồng bộ Telegram để lấy cả danh sách nhóm cũ và nhóm đang hoạt động."
          />
        )}
      </div>
    </section>
  );
}
