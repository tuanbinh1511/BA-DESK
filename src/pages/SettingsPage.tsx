import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  FileArrowUp,
  LockKey,
  Moon,
  Question,
  Sparkle,
  Sun,
  TelegramLogo,
} from "@phosphor-icons/react";
import type { Settings, Workspace } from "../types";
import { api } from "../services/api";
import { SectionHead } from "../components/WorkspaceUI";
export function SettingsPage({
  settings,
  ai,
  bot,
  connected,
  isDemo,
  desktopEnabled,
  onConnect,
  onSwitch,
  onImport,
  onNotify,
  onDesktop,
  onSave,
  onDisconnect,
  onStart,
  onRefresh,
}: {
  settings: Settings;
  ai: Workspace["ai"];
  bot: Workspace["bot"];
  connected: boolean;
  isDemo: boolean;
  desktopEnabled: boolean;
  onConnect: () => void;
  onSwitch: () => Promise<void>;
  onImport: () => void;
  onNotify: (text: string) => void;
  onDesktop: (value: boolean) => void;
  onSave: (
    settings: Pick<
      Settings,
      "morning" | "evening" | "enabled" | "autoSync" | "telegramNotifications"
    > &
      Partial<Pick<Settings, "aiEnabled" | "aiModel">>,
  ) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onStart: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [enabled, setEnabled] = useState(settings.enabled),
    [autoSync, setAutoSync] = useState(settings.autoSync),
    [telegramNotifications, setTelegramNotifications] = useState(
      settings.telegramNotifications,
    ),
    [aiEnabled, setAIEnabled] = useState(settings.aiEnabled),
    [aiModel, setAIModel] = useState(settings.aiModel),
    [botBusy, setBotBusy] = useState(false),
    [botError, setBotError] = useState("");

  async function botAction(
    action: "connect" | "test" | "disconnect",
    form?: HTMLFormElement,
  ) {
    setBotBusy(true);
    setBotError("");
    try {
      if (action === "connect") {
        const token = String(new FormData(form).get("token") ?? "").trim();
        await api("/telegram/bot", { token });
        form?.reset();
      } else if (action === "test") await api("/telegram/bot/test", {});
      else await api("/telegram/bot", undefined, "DELETE");
      await onRefresh();
      onNotify(
        action === "test"
          ? "Đã gửi thông báo thử vào Telegram của bạn."
          : action === "connect"
            ? "Đã kết nối bot. Bấm Gửi thử để kiểm tra thông báo."
            : "Đã ngắt bot nhận thông báo.",
      );
    } catch (err) {
      setBotError(
        err instanceof Error ? err.message : "Không thể xử lý yêu cầu với bot.",
      );
    } finally {
      setBotBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      morning = String(data.get("morning")),
      evening = String(data.get("evening"));
    if (morning >= evening)
      return setError("Giờ buổi sáng phải trước giờ rà soát cuối ngày.");
    setBusy(true);
    setError("");
    try {
      await onSave({
        morning,
        evening,
        enabled,
        autoSync,
        telegramNotifications,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu lịch.");
    } finally {
      setBusy(false);
    }
  }
  async function desktop() {
    if (desktopEnabled) {
      onDesktop(false);
      return;
    }
    if (!("Notification" in window)) {
      onNotify(
        "Trình duyệt này chưa hỗ trợ thông báo desktop. Dùng biểu tượng chuông trong ứng dụng.",
      );
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      onDesktop(true);
      onNotify("Đã bật thông báo desktop khi giao diện đang mở.");
    } else
      onNotify(
        "Thông báo chưa được cho phép. Bạn vẫn nhận nhắc việc trong mục Thông báo.",
      );
  }
  return (
    <div className="settings-grid">
      <div className="settings-main">
        <section className="panel">
          <SectionHead
            title="Kết nối Telegram"
            subtitle="Tài khoản cá nhân để tải lịch sử · API ID/API Hash từ my.telegram.org/apps."
          />
          <div className="integration-row">
            <span className="integration-logo">
              <TelegramLogo size={30} weight="fill" />
            </span>
            <div>
              <strong>Telegram cá nhân</strong>
              <p>
                {connected
                  ? `Đã kết nối${settings.username ? ` · @${settings.username}` : ""}`
                  : "Kết nối tài khoản để đọc tin nhắn theo ngày."}
              </p>
              {settings.selfId && (
                <small className="account-id">
                  Telegram User ID: {settings.selfId}
                </small>
              )}
            </div>
            <span className={`soft-badge ${connected ? "green" : "neutral"}`}>
              {connected ? "Đang kết nối" : "Chưa kết nối"}
            </span>
          </div>
          <div className="integration-actions">
            {connected && (
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onSwitch();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Đổi tài khoản
                <ArrowRight size={16} />
              </button>
            )}
            {connected ? (
              <button
                className="button secondary danger"
                onClick={() => void onDisconnect()}
              >
                Ngắt kết nối
              </button>
            ) : (
              <button className="button primary" onClick={onConnect}>
                Kết nối tài khoản
                <ArrowRight size={16} />
              </button>
            )}
            <button className="button secondary" onClick={onImport}>
              <FileArrowUp size={17} />
              Nhập file JSON
            </button>
            {isDemo && (
              <button className="text-button" onClick={() => void onStart()}>
                Dùng không gian trống
                <ArrowRight size={16} />
              </button>
            )}
          </div>
          <p className="settings-note">
            <LockKey size={15} />
            Dữ liệu gắn với Telegram User ID. Khi tài khoản mới đăng nhập thành
            công, dữ liệu Telegram cũ được thay thế; công việc thủ công và lịch
            cá nhân được giữ.
          </p>
        </section>
        <section className="panel">
          <SectionHead
            title="Thông báo qua Telegram"
            subtitle="Báo cáo và lời nhắc đến thẳng cuộc trò chuyện riêng với bot."
          />
          <div className="integration-row">
            <span className="integration-logo">
              <Bell size={28} />
            </span>
            <div>
              <strong>
                {bot.configured ? `@${bot.username}` : "Bot nhắc việc của bạn"}
              </strong>
              <p>
                {bot.configured
                  ? "Người nhận là tài khoản Telegram đã kết nối."
                  : "Tạo bot riêng bằng /newbot với @BotFather."}
              </p>
            </div>
            <span
              className={`soft-badge ${bot.configured ? "green" : "neutral"}`}
            >
              {bot.configured ? "Sẵn sàng" : "Chưa kết nối"}
            </span>
          </div>
          {bot.configured ? (
            <div className="integration-actions">
              <a
                className="button secondary"
                href={`https://t.me/${bot.username}`}
                target="_blank"
                rel="noreferrer"
              >
                Mở bot
                <ArrowRight size={16} />
              </a>
              <button
                className="button primary"
                disabled={botBusy}
                onClick={() => void botAction("test")}
              >
                {botBusy ? "Đang xử lý…" : "Gửi thử"}
              </button>
              <button
                className="text-button"
                disabled={botBusy}
                onClick={() => void botAction("disconnect")}
              >
                Ngắt bot
              </button>
            </div>
          ) : (
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                void botAction("connect", event.currentTarget);
              }}
            >
              <p className="field-note">
                1. Kết nối tài khoản phía trên. 2. Tạo bot tại{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                >
                  @BotFather
                </a>
                . 3. Mở bot bằng chính tài khoản của bạn, nhấn Start, rồi nhập
                token bên dưới.
              </p>
              <label className="bot-token-field">
                Bot token
                <input
                  name="token"
                  type="password"
                  required
                  autoComplete="off"
                  placeholder="123456789:…"
                  aria-label="Bot token"
                  disabled={botBusy}
                />
              </label>
              <div className="form-actions">
                <button
                  className="button primary"
                  disabled={botBusy || !connected}
                >
                  {botBusy ? "Đang kiểm tra…" : "Kết nối bot"}
                  <Check size={16} />
                </button>
              </div>
            </form>
          )}
          {(botError || bot.error) && (
            <p className="form-error" role="alert">
              {botError || bot.error}
            </p>
          )}
          {bot.lastSentAt && (
            <p className="field-note">
              Gửi gần nhất:{" "}
              {new Date(bot.lastSentAt).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
              .
            </p>
          )}
          <p className="settings-note">
            <LockKey size={15} />
            Token lưu trên máy. Bot vẫn gửi khi đóng giao diện; máy chủ cần chạy
            và máy tính cần thức.
          </p>
        </section>
        <section className="panel">
          <SectionHead
            title="Nhịp nhắc việc"
            subtitle="Hai thời điểm nhỏ để không bỏ quên việc lớn."
          />
          <form className="settings-form" onSubmit={submit}>
            <div className="setting-toggle">
              <div>
                <strong>Tự động tải tin nhắn trong ngày</strong>
                <p>Mỗi 5 phút · tất cả hội thoại, theo giờ Việt Nam.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(event) => setAutoSync(event.target.checked)}
                  aria-label="Bật tự động tải tin nhắn"
                />
                <span />
              </label>
            </div>
            <div className="setting-toggle">
              <div>
                <strong>Gửi báo cáo & lời nhắc qua bot</strong>
                <p>08:30, 17:00, hạn công việc và trước cuộc hẹn 10 phút.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={telegramNotifications}
                  onChange={(event) =>
                    setTelegramNotifications(event.target.checked)
                  }
                  aria-label="Bật thông báo qua Telegram"
                />
                <span />
              </label>
            </div>
            <div className="setting-toggle">
              <div>
                <strong>Báo cáo & nhắc việc tự động</strong>
                <p>
                  {isDemo
                    ? "Chỉ chạy sau khi kết nối hoặc nhập dữ liệu thật."
                    : "Máy chủ cần chạy để thực hiện lịch nhắc."}
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  aria-label="Bật báo cáo tự động"
                />
                <span />
              </label>
            </div>
            <div className="schedule-inputs">
              <label>
                <span className="schedule-icon tone-green">
                  <Sun size={22} />
                </span>
                <span>
                  <strong>Buổi sáng</strong>
                  <small>Tổng hợp đầu việc và phản hồi</small>
                </span>
                <input
                  type="time"
                  name="morning"
                  defaultValue={settings.morning}
                  required
                  aria-label="Giờ báo cáo buổi sáng"
                />
              </label>
              <label>
                <span className="schedule-icon tone-purple">
                  <Moon size={21} />
                </span>
                <span>
                  <strong>Cuối ngày</strong>
                  <small>Rà soát những việc chưa xong</small>
                </span>
                <input
                  type="time"
                  name="evening"
                  defaultValue={settings.evening}
                  required
                  aria-label="Giờ rà soát cuối ngày"
                />
              </label>
            </div>
            <p className="field-note">
              Múi giờ Asia/Ho_Chi_Minh (GMT+7). Nhắc hạn công việc và nhắc trước
              cuộc hẹn 10 phút.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "Đang lưu…" : "Lưu thiết lập"}
                <Check size={16} />
              </button>
            </div>
          </form>
        </section>
        <section className="panel ai-settings">
          <SectionHead
            title="AI qua Codex / ChatGPT"
            subtitle="Dùng đăng nhập ChatGPT đã có trên máy, không cần API key riêng."
          />
          <div className="ai-settings-status">
            <Sparkle size={22} />
            <strong>
              {ai.available
                ? "Đã sẵn sàng qua Codex CLI"
                : "Chưa tìm thấy đăng nhập ChatGPT"}
            </strong>
          </div>
          <p>
            Hội thoại liên quan được gửi đến model để phân tích. Quá trình này
            sử dụng hạn mức Codex của tài khoản ChatGPT; kết quả được lưu cục bộ
            và dùng lại khi dữ liệu không đổi.
          </p>
          <label className="ai-enable">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(event) => setAIEnabled(event.target.checked)}
            />
            Phân tích AI trước báo cáo sáng và 17:00
          </label>
          <label className="ai-model-label">
            Model phân tích
            <select
              value={aiModel}
              onChange={(event) => setAIModel(event.target.value)}
            >
              <option value="gpt-6-luna">
                GPT-6-Luna · nhanh, tiết kiệm hạn mức
              </option>
              <option value="gpt-6-sol">GPT-6-Sol · hội thoại phức tạp</option>
              <option value="gpt-6.1-sol">
                GPT-6.1-Sol · phân tích sâu hơn
              </option>
            </select>
          </label>
          <p className="field-note">
            AI chỉ đọc tin trong ngày đã chọn, theo giờ Việt Nam. Báo cáo ngắn
            theo người giao; dùng lại phần không đổi để tiết kiệm lượt phân
            tích. Công việc cũ vẫn nằm trong Công việc. AI gợi ý hoàn thành để
            bạn xác nhận.
          </p>
          {!ai.available && (
            <p className="field-note">
              Mở Terminal, chạy <code>codex login</code>, chọn đăng nhập ChatGPT
              rồi khởi động lại BA Desk.
            </p>
          )}
          <div className="form-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onSave({
                    morning: settings.morning,
                    evening: settings.evening,
                    enabled,
                    autoSync,
                    telegramNotifications,
                    aiEnabled,
                    aiModel,
                  });
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Không thể lưu AI.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Lưu thiết lập AI
              <Check size={16} />
            </button>
          </div>
        </section>
        <section className="panel">
          <SectionHead
            title="Thông báo desktop"
            subtitle="Nhận lời nhắc khi giao diện đang mở trong trình duyệt."
          />
          <div className="desktop-row">
            <span className="schedule-icon tone-orange">
              <Bell size={23} />
            </span>
            <div>
              <strong>Nhắc ngay trên màn hình</strong>
              <p>Cho phép trình duyệt hiển thị thông báo mới.</p>
            </div>
            <button
              className={`button ${desktopEnabled ? "secondary" : "primary"}`}
              onClick={() => void desktop()}
            >
              {desktopEnabled ? "Tắt thông báo" : "Cho phép"}
            </button>
          </div>
        </section>
      </div>
      <aside className="settings-aside">
        <div className="focus-note">
          <span className="focus-label">
            <Sparkle size={17} />
            CÁCH BA DESK HIỂU CÔNG VIỆC
          </span>
          <h3>
            Mỗi đầu việc
            <br />
            đều có nguồn.
          </h3>
          <p>
            Yêu cầu được nhận diện qua @ bạn, reply đến bạn và tin nhắn riêng có
            nội dung giao việc.
          </p>
          <p>
            BA Desk giữ tin gốc để bạn đối chiếu. Deadline chưa rõ sẽ để trống,
            phản hồi chưa chắc sẽ cần bạn xác nhận.
          </p>
          <span className="soft-badge green">
            Có nguồn và dẫn chứng phản hồi
          </span>
        </div>
        <div className="settings-help">
          <Question size={21} />
          <h3>Bắt đầu trong 3 bước</h3>
          <ol>
            <li>
              Lấy API ID và API Hash tại{" "}
              <a
                href="https://my.telegram.org/apps"
                target="_blank"
                rel="noreferrer"
              >
                my.telegram.org
              </a>
              .
            </li>
            <li>Kết nối bằng số điện thoại và mã Telegram.</li>
            <li>
              Tin hôm nay tự tải mỗi 5 phút. Chọn ngày cũ trong Hộp thư để tải
              lịch sử.
            </li>
          </ol>
          <p>Chưa có API? Nhập file JSON từ Telegram Desktop để dùng ngay.</p>
        </div>
      </aside>
    </div>
  );
}
