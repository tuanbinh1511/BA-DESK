import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { DocumentReference, LibraryResult } from "../types";
import { clock, shortDate, today, dateOf } from "../utils/dates";
import { download } from "../utils/files";

const kindLabels = { file: "Tài liệu", folder: "Thư mục", link: "Liên kết" };
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

const demoItems: DocumentReference[] = [
  demoItem,
  { ...demoItem, id: "demo-budget", sourceId: "demo:2", name: "Budget_Q4.xlsx", value: "Budget_Q4.xlsx", date: `${today()}T10:30:00+07:00`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", text: "Mình gửi bảng ngân sách đã chốt. Bạn đối chiếu cột chi phí triển khai giúp mình trước 15h nhé." },
  { ...demoItem, id: "demo-slides", sourceId: "demo:3", name: "Refinement_Payment.pptx", value: "Refinement_Payment.pptx", date: `${today()}T11:05:00+07:00`, sender: "Bạn", senderId: "demo-self", outgoing: true, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", text: "Mình gửi slides cho buổi refinement. Minh Anh xem giúp phần tiêu chí nghiệm thu trước cuộc họp nhé." },
];

function noteFor(item: DocumentReference) {
  return [
    `Tài liệu: ${item.name}`,
    `Tên / đường dẫn / liên kết: ${item.value}`,
    `Trao đổi: ${item.outgoing ? "Bạn gửi" : "Bạn nhận"}`,
    `Người gửi: ${item.sender}`,
    `Hội thoại / người trao đổi: ${item.chat}`,
    `Thời gian: ${item.date}`,
    `Mã hội thoại: ${item.chatId}`,
    `Mã tin gốc: ${item.sourceId}`,
    `Telegram: ${item.sourceUrl || item.chatUrl || "Dùng tên hội thoại, thời gian và mã tin để tra cứu trên Telegram."}`,
    "", "Nội dung tin nhắn gốc:", item.text,
  ].join("\n");
}

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
  const [exporting, setExporting] = useState(false);
  const currentAccount = useRef(accountRevision);
  currentAccount.current = accountRevision;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  function change(field: keyof typeof initialFilters, value: string) {
    setFilters((previous) => ({ ...previous, [field]: value }));
    setOffset(0);
  }
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      const visibleDemo = demoItems.filter((item) =>
        (!filters.kind || filters.kind === item.kind) &&
        (!filters.chat || filters.chat === item.chatId) &&
        (!filters.sender || filters.sender === item.senderId) &&
        (!filters.direction || item.outgoing === (filters.direction === "sent")) &&
        (!filters.start || dateOf(item.date) >= filters.start) &&
        (!filters.end || dateOf(item.date) <= filters.end) &&
        filters.query.toLowerCase().split(/\s+/).every((word) =>
          `${item.name} ${item.sender} ${item.chat} ${item.text}`.toLowerCase().includes(word),
        ),
      );
      const request = isDemo
        ? Promise.resolve({
            items: visibleDemo,
            total: visibleDemo.length,
            chats: [{ id: demoItem.chatId, name: demoItem.chat }],
            senders: [{ id: "demo-person", name: demoItem.sender }, { id: "demo-self", name: "Bạn" }],
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
  async function exportNotes() {
    if (exporting || !result) return;
    setExporting(true);
    const revision = accountRevision;
    const exportFilters = { ...filters };
    const items: DocumentReference[] = [];
    try {
      if (isDemo) items.push(...result.items);
      else {
        let total = result.total;
        for (let nextOffset = 0; nextOffset < total; nextOffset += 100) {
          const page = await api<LibraryResult>(`/resources?${new URLSearchParams({ ...exportFilters, offset: String(nextOffset), limit: "100" })}`);
          if (!mounted.current || currentAccount.current !== revision || page.accountRevision !== revision) return;
          if (page.total !== total || !page.items.length) throw new Error("Kho tài liệu vừa thay đổi. Thử xuất lại để giữ đủ ngữ cảnh.");
          items.push(...page.items);
          total = page.total;
        }
      }
      if (!mounted.current || currentAccount.current !== revision) return;
      const filterSummary = [
        exportFilters.direction === "sent" ? "Tôi gửi" : exportFilters.direction === "received" ? "Tôi nhận" : "Tất cả trao đổi",
        exportFilters.kind ? kindLabels[exportFilters.kind as keyof typeof kindLabels] : "Mọi loại tài liệu",
        exportFilters.query && `Từ khóa: ${exportFilters.query}`,
        exportFilters.chat && `Hội thoại: ${result.chats.find((chat) => chat.id === exportFilters.chat)?.name ?? exportFilters.chat}`,
        exportFilters.sender && `Người gửi: ${result.senders.find((sender) => sender.id === exportFilters.sender)?.name ?? exportFilters.sender}`,
        exportFilters.start && `Từ ngày ${exportFilters.start}`,
        exportFilters.end && `Đến ngày ${exportFilters.end}`,
      ].filter(Boolean).join(" · ");
      const body = ["BA Desk — Ghi chú tài liệu & liên kết", `Xuất lúc: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`, `Số kết quả: ${items.length}`, `Bộ lọc: ${filterSummary}`, "", items.map(noteFor).join("\n\n---\n\n")].join("\n");
      download(body, `ba-desk-tai-lieu-${today()}.md`);
      notify(`Đã lưu ghi chú cho ${items.length} tài liệu & liên kết, kèm toàn bộ tin nhắn gốc.`);
    } catch (failure) {
      if (mounted.current) notify(failure instanceof Error ? failure.message : "Không thể xuất ghi chú. Thử lại.");
    } finally {
      if (mounted.current) setExporting(false);
    }
  }
  return (
    <>
      <div className="library-toolbar">
        <div className="library-direction" aria-label="Lọc trao đổi tài liệu">
          {[["", "Tất cả trao đổi"], ["sent", "Tôi gửi"], ["received", "Tôi nhận"]].map(([value, label]) => (
            <button key={value} aria-pressed={filters.direction === value} onClick={() => change("direction", value)}>{label}</button>
          ))}
        </div>
        <div className="library-search-row">
        <label className="library-search">
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
              Xóa
            </button>
          )}
        </label>
        <button className="button secondary" onClick={() => void exportNotes()} disabled={exporting || loading || !!error || !result?.total}>
          {exporting ? "Đang xuất ghi chú…" : "Xuất toàn bộ ghi chú"}
        </button>
        </div>
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
          {loading && !result && <div aria-label="Đang tải tài liệu">{[0, 1, 2].map((item) => <div className="library-skeleton" key={item} />)}</div>}
          {result?.items.length
            ? result.items.map((item) => {
                return (
                  <button
                    className={`library-item ${selected?.id === item.id ? "selected" : ""}`}
                    key={item.id}
                    aria-pressed={selected?.id === item.id}
                    onClick={() => setSelected(item)}
                  >
                    <span className="library-item-copy">
                      <strong>{item.name}</strong>
                      <span>
                        {item.outgoing ? "Tôi gửi" : `Tôi nhận từ ${item.sender}`} · {item.chat}
                      </span>
                      <small>
                        {item.origin === "mentioned"
                          ? "Tên được nhắc trong tin nhắn"
                          : kindLabels[item.kind]}{" "}
                        · {shortDate(item.date)} · {clock(item.date)}
                      </small>
                    </span>
                  </button>
                );
              })
            : !loading && (
                <div className="library-empty">
                  <h2>Chưa tìm thấy tài liệu</h2>
                  <p>Thử tên file, người trao đổi hoặc một từ trong tin nhắn. Tài liệu từ nhóm bỏ qua vẫn có thể tra cứu.</p>
                </div>
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
                <button
                  className="text-button"
                  aria-label="Đóng chi tiết tài liệu"
                  onClick={() => setSelected(null)}
                >
                  Đóng
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
                <div><dt>Trao đổi</dt><dd>{selected.outgoing ? "Tôi gửi" : "Tôi nhận"}</dd></div>
                <div>
                  <dt>Người gửi</dt>
                  <dd>
                    {selected.outgoing
                      ? `Bạn (${selected.sender})`
                      : selected.sender}
                  </dd>
                </div>
                <div>
                  <dt>Trao đổi với / hội thoại</dt>
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
                  </a>
                )}
                <button
                  className="button secondary"
                  onClick={() => void copy(selected.value)}
                >
                  Sao chép{" "}
                  {selected.kind === "link" ? "link" : "đường dẫn / tên"}
                </button>
                <button
                  className="button quiet"
                  onClick={() =>
                    void copy(
                      noteFor(selected),
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
              <p className="document-note">Tên file. Người trao đổi. Tin nhắn gốc.</p>
              <h2>Mỗi tài liệu, đúng ngữ cảnh.</h2>
              <p>
                Chọn một kết quả để biết đã trao đổi với ai, khi nào và trong
                nội dung gì.
              </p>
              <small>
                Lưu tên tài liệu và toàn bộ nội dung tin đã đồng bộ. Mở file gốc qua
                Telegram.
              </small>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
