import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Copy,
  FileText,
  Folder,
  Link,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import { api } from "../services/api";
import type { DocumentReference, LibraryResult } from "../types";
import { clock, shortDate, today, dateOf } from "../utils/dates";
import { Empty } from "../components/WorkspaceUI";

const kindLabels = { file: "Tài liệu", folder: "Thư mục", link: "Liên kết" };
const kindIcons = { file: FileText, folder: Folder, link: Link };
const initialFilters = {
  query: "",
  kind: "",
  chat: "",
  sender: "",
  direction: "",
  start: "",
  end: "",
};
const demoItem: DocumentReference = {
  id: "demo-brd",
  kind: "file",
  name: "BRD_Payment_v2.docx",
  value: "BRD_Payment_v2.docx",
  url: null,
  sourceId: "demo:1",
  sourceUrl: null,
  sender: "Minh Anh",
  senderId: "demo-person",
  chat: "Payment · BA & Product",
  chatId: "demo-chat",
  date: `${today()}T09:15:00+07:00`,
  outgoing: false,
  origin: "attachment",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  size: 248000,
  text: "Mình gửi BRD_Payment_v2.docx. Bạn review giúp phần hoàn tiền trước buổi refinement nhé.",
};

export function LibraryPage({
  accountRevision,
  isDemo,
  lastSync,
  notify,
}: {
  accountRevision: number;
  isDemo: boolean;
  lastSync: string | null;
  notify: (message: string) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<LibraryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DocumentReference | null>(null);
  const preview = useRef<HTMLElement>(null);
  function change(field: keyof typeof initialFilters, value: string) {
    setFilters((previous) => ({ ...previous, [field]: value }));
    setOffset(0);
  }
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      const visibleDemo =
        (!filters.kind || filters.kind === demoItem.kind) &&
        (!filters.chat || filters.chat === demoItem.chatId) &&
        (!filters.sender || filters.sender === demoItem.senderId) &&
        filters.direction !== "sent" &&
        (!filters.start || dateOf(demoItem.date) >= filters.start) &&
        (!filters.end || dateOf(demoItem.date) <= filters.end) &&
        filters.query
          .toLowerCase()
          .split(/\s+/)
          .every((word) =>
            `${demoItem.name} ${demoItem.sender} ${demoItem.chat} ${demoItem.text}`
              .toLowerCase()
              .includes(word),
          );
      const request = isDemo
        ? Promise.resolve({
            items: visibleDemo ? [demoItem] : [],
            total: Number(visibleDemo),
            chats: [{ id: demoItem.chatId, name: demoItem.chat }],
            senders: [{ id: "demo-person", name: demoItem.sender }],
            accountRevision,
          })
        : api<LibraryResult>(
            `/resources?${new URLSearchParams({ ...filters, offset: String(offset) })}`,
          );
      void request
        .then((data) => {
          if (cancelled || data.accountRevision !== accountRevision) return;
          setResult(data);
          setSelected(
            (previous) =>
              data.items.find((item) => item.id === previous?.id) ?? null,
          );
        })
        .catch((failure: unknown) => {
          if (!cancelled)
            setError(
              failure instanceof Error
                ? failure.message
                : "Không thể tải kho tài liệu. Thử lại.",
            );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filters, offset, accountRevision, isDemo, lastSync]);
  useEffect(() => {
    if (selected && window.matchMedia("(max-width: 1000px)").matches) {
      preview.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    }
  }, [selected]);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Đã sao chép.");
    } catch {
      notify(
        "Trình duyệt chưa cho phép sao chép. Bạn có thể chọn nội dung trực tiếp.",
      );
    }
  }
  const SelectedIcon = selected ? kindIcons[selected.kind] : FileText;
  return (
    <>
      <div className="library-toolbar">
        <label className="library-search">
          <MagnifyingGlass size={21} />
          <input
            aria-label="Tìm tài liệu và liên kết"
            placeholder="Tên file, người gửi, dự án, nội dung, đường dẫn…"
            value={filters.query}
            onChange={(event) => change("query", event.target.value)}
          />
          {filters.query && (
            <button
              aria-label="Xóa tìm kiếm"
              onClick={() => change("query", "")}
            >
              <X size={17} />
            </button>
          )}
        </label>
        <div className="library-types" aria-label="Loại tài liệu">
          {[
            ["", "Tất cả"],
            ["file", "Tài liệu"],
            ["link", "Liên kết"],
            ["folder", "Thư mục"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filters.kind === value}
              onClick={() => change("kind", value)}
            >
              {label}
            </button>
          ))}
        </div>
        <details className="library-filter-disclosure">
          <summary>
            Lọc theo người, hội thoại & thời gian
            {Object.entries(filters).some(
              ([key, value]) => value && key !== "query" && key !== "kind",
            ) && <span> · Đang lọc</span>}
          </summary>
          <div className="library-filters">
            <label>
              Hội thoại
              <select
                aria-label="Lọc hội thoại"
                value={filters.chat}
                onChange={(event) => change("chat", event.target.value)}
              >
                <option value="">Mọi hội thoại</option>
                {result?.chats.map((chat) => (
                  <option key={chat.id} value={chat.id}>
                    {chat.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Người gửi
              <select
                aria-label="Lọc người gửi"
                value={filters.sender}
                onChange={(event) => change("sender", event.target.value)}
              >
                <option value="">Mọi người</option>
                {result?.senders.map((sender) => (
                  <option key={sender.id} value={sender.id}>
                    {sender.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trao đổi
              <select
                aria-label="Lọc tin đã gửi hoặc nhận"
                value={filters.direction}
                onChange={(event) => change("direction", event.target.value)}
              >
                <option value="">Đã gửi & đã nhận</option>
                <option value="received">Bạn nhận</option>
                <option value="sent">Bạn gửi</option>
              </select>
            </label>
            <label>
              Từ ngày
              <input
                aria-label="Tài liệu từ ngày"
                type="date"
                value={filters.start}
                onChange={(event) => change("start", event.target.value)}
              />
            </label>
            <label>
              Đến ngày
              <input
                aria-label="Tài liệu đến ngày"
                type="date"
                value={filters.end}
                onChange={(event) => change("end", event.target.value)}
              />
            </label>
            {Object.values(filters).some(Boolean) && (
              <button
                className="button quiet"
                onClick={() => {
                  setFilters(initialFilters);
                  setOffset(0);
                }}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        </details>
      </div>
      <p className="library-caption" role="status">
        {loading
          ? "Đang tìm trong tin nhắn đã lưu…"
          : `${result?.total ?? 0} tài liệu & liên kết · tìm trên mọi ngày đã đồng bộ`}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button onClick={() => setFilters({ ...filters })}>Thử lại</button>
        </p>
      )}
      <div
        className={`library-layout ${selected ? "has-selection" : ""}`}
        aria-busy={loading}
      >
        <section className="library-results" aria-label="Kết quả tra cứu">
          {result?.items.length
            ? result.items.map((item) => {
                const Icon = kindIcons[item.kind];
                return (
                  <button
                    className={`library-item ${selected?.id === item.id ? "selected" : ""}`}
                    key={item.id}
                    aria-pressed={selected?.id === item.id}
                    onClick={() => setSelected(item)}
                  >
                    <span
                      className={`library-item-icon reference-${item.kind}`}
                    >
                      <Icon size={24} weight="duotone" />
                    </span>
                    <span className="library-item-copy">
                      <strong>{item.name}</strong>
                      <span>
                        {item.outgoing ? "Bạn gửi" : item.sender} · {item.chat}
                      </span>
                      <small>
                        {item.origin === "mentioned"
                          ? "Tên được nhắc trong tin nhắn"
                          : kindLabels[item.kind]}{" "}
                        · {shortDate(item.date)} · {clock(item.date)}
                      </small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                );
              })
            : !loading && (
                <Empty
                  icon={Folder}
                  title="Chưa tìm thấy tài liệu"
                  text="Thử tên file, người trao đổi hoặc một từ trong tin nhắn. Tài liệu từ các nhóm bỏ qua vẫn có thể tra cứu."
                />
              )}
          {result && result.total > 40 && (
            <div className="library-pagination">
              <button
                className="button secondary"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - 40))}
              >
                Trang trước
              </button>
              <span>
                {offset + 1}–{Math.min(offset + 40, result.total)} /{" "}
                {result.total}
              </span>
              <button
                className="button secondary"
                disabled={offset + 40 >= result.total || loading}
                onClick={() => setOffset(offset + 40)}
              >
                Trang sau
              </button>
            </div>
          )}
        </section>
        <aside
          className="library-preview"
          ref={preview}
          aria-label="Chi tiết tài liệu"
        >
          {selected ? (
            <div className="document-sheet" key={selected.id}>
              <div className="document-sheet-head">
                <span className={`document-emblem reference-${selected.kind}`}>
                  <SelectedIcon size={35} weight="duotone" />
                </span>
                <button
                  className="icon-button"
                  aria-label="Đóng chi tiết tài liệu"
                  onClick={() => setSelected(null)}
                >
                  <X size={19} />
                </button>
              </div>
              <h2>{selected.name}</h2>
              <p className="document-path">{selected.value}</p>
              <div className="document-facts">
                <span>
                  {selected.origin === "attachment"
                    ? "File đính kèm"
                    : selected.origin === "mentioned"
                      ? "Được nhắc trong tin"
                      : "Liên kết đã trao đổi"}
                </span>
                {selected.size != null && (
                  <span>
                    {new Intl.NumberFormat("vi-VN", {
                      maximumFractionDigits: 1,
                    }).format(selected.size / 1024)}{" "}
                    KB
                  </span>
                )}
              </div>
              <dl>
                <div>
                  <dt>Người gửi</dt>
                  <dd>
                    {selected.outgoing
                      ? `Bạn (${selected.sender})`
                      : selected.sender}
                  </dd>
                </div>
                <div>
                  <dt>Hội thoại</dt>
                  <dd>{selected.chat}</dd>
                </div>
                <div>
                  <dt>Mã tin gốc</dt>
                  <dd>{selected.sourceId}</dd>
                </div>
                <div>
                  <dt>Thời gian</dt>
                  <dd>
                    {new Date(selected.date).toLocaleDateString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                    })}{" "}
                    · {clock(selected.date)}
                  </dd>
                </div>
              </dl>
              <h3>Tin nhắn gốc</h3>
              <blockquote>{selected.text}</blockquote>
              <div className="document-actions">
                {selected.url && (
                  <a
                    className="button primary"
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở liên kết
                    <ArrowUpRight size={17} />
                  </a>
                )}
                {selected.sourceUrl?.startsWith("https://t.me/") && (
                  <a
                    className="button secondary"
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở tin trên Telegram
                    <ArrowUpRight size={16} />
                  </a>
                )}
                {selected.chatUrl?.startsWith("https://t.me/") && (
                  <a
                    className="button secondary"
                    href={selected.chatUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở hội thoại Telegram
                    <ArrowUpRight size={16} />
                  </a>
                )}
                <button
                  className="button secondary"
                  onClick={() => void copy(selected.value)}
                >
                  <Copy size={16} />
                  Sao chép{" "}
                  {selected.kind === "link" ? "link" : "đường dẫn / tên"}
                </button>
                <button
                  className="button quiet"
                  onClick={() =>
                    void copy(
                      `${selected.name}\n${selected.value}\n${selected.sender} · ${selected.chat} · ${selected.date}\n${selected.text}`,
                    )
                  }
                >
                  Sao chép kèm ngữ cảnh
                </button>
              </div>
              {selected.origin === "mentioned" && (
                <p className="field-note">
                  Đây là tên hoặc đường dẫn trong tin nhắn; chưa xác nhận có
                  file đính kèm.
                </p>
              )}
            </div>
          ) : (
            <div className="document-idle">
              <div className="document-stack" aria-hidden="true">
                <span />
                <span />
                <span>
                  <FileText size={43} weight="duotone" />
                </span>
              </div>
              <h2>Mỗi tài liệu, đúng ngữ cảnh.</h2>
              <p>
                Chọn một kết quả để biết đã trao đổi với ai, khi nào và trong
                nội dung gì.
              </p>
              <small>
                Lưu tên, link và ngữ cảnh từ tin đã đồng bộ. Mở file gốc qua
                Telegram.
              </small>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
