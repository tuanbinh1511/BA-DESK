import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle,
  FileArrowUp,
  LockKey,
  TelegramLogo,
} from "@phosphor-icons/react";
import { Modal } from "./Modal";
import { api } from "../services/api";
import type { CalendarEvent, Task } from "../types";
import { today } from "../utils/dates";

export function TaskForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (
    data: Pick<
      Task,
      "title" | "project" | "description" | "priority" | "dueAt"
    >,
  ) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title")).trim();
    if (!title) return setError("Nhập tên công việc để tiếp tục.");
    setBusy(true);
    try {
      await onSave({
        title,
        project: String(data.get("project")).trim() || "Công việc cá nhân",
        description: String(data.get("description")),
        priority: String(data.get("priority")) as Task["priority"],
        dueAt: data.get("dueAt") ? `${data.get("dueAt")}:00+07:00` : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu công việc.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Thêm một công việc"
      subtitle="Đưa việc ra khỏi đầu, vào đúng chỗ."
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          Tên công việc
          <input
            name="title"
            required
            maxLength={200}
            placeholder="Ví dụ: Review BRD luồng thanh toán"
          />
        </label>
        <label>
          Dự án
          <input
            name="project"
            maxLength={150}
            placeholder="Công việc cá nhân"
          />
        </label>
        <div className="form-grid">
          <label>
            Độ ưu tiên
            <select name="priority" defaultValue="medium">
              <option value="high">Ưu tiên cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </select>
          </label>
          <label>
            Hạn hoàn thành
            <input type="datetime-local" name="dueAt" />
          </label>
        </div>
        <label>
          Ghi chú
          <textarea
            name="description"
            rows={3}
            maxLength={5000}
            placeholder="Yêu cầu, phạm vi hoặc thông tin cần nhớ…"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Đang lưu…" : "Tạo công việc"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EventForm({
  onClose,
  onSave,
  day,
}: {
  onClose: () => void;
  onSave: (data: Omit<CalendarEvent, "id">) => Promise<void>;
  day: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const start = `${data.get("start")}:00+07:00`,
      end = `${data.get("end")}:00+07:00`;
    if (!String(data.get("title")).trim())
      return setError("Nhập tên cuộc hẹn để tiếp tục.");
    if (new Date(end) <= new Date(start))
      return setError("Giờ kết thúc phải sau giờ bắt đầu.");
    setBusy(true);
    try {
      await onSave({
        title: String(data.get("title")).trim(),
        start,
        end,
        note: String(data.get("note")),
        color: String(data.get("color")) as CalendarEvent["color"],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu cuộc hẹn.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Đặt lịch làm việc"
      subtitle="Một khoảng thời gian dành cho điều quan trọng."
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          Tên cuộc hẹn
          <input
            name="title"
            required
            maxLength={200}
            placeholder="Ví dụ: Workshop làm rõ yêu cầu"
          />
        </label>
        <div className="form-grid">
          <label>
            Bắt đầu
            <input
              name="start"
              type="datetime-local"
              required
              defaultValue={`${day}T10:00`}
            />
          </label>
          <label>
            Kết thúc
            <input
              name="end"
              type="datetime-local"
              required
              defaultValue={`${day}T11:00`}
            />
          </label>
        </div>
        <label>
          Ghi chú
          <textarea
            name="note"
            rows={3}
            maxLength={2000}
            placeholder="Dự án, người tham gia, agenda…"
          />
        </label>
        <label>
          Màu lịch
          <select name="color">
            <option value="green">Xanh lá · Công việc</option>
            <option value="orange">Cam · Stakeholder</option>
            <option value="purple">Tím · Review / UAT</option>
          </select>
        </label>
        <p className="field-note">
          Nhắc trong ứng dụng 10 phút trước cuộc hẹn. Múi giờ Việt Nam.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu cuộc hẹn"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ConnectForm({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => Promise<void>;
}) {
  const [step, setStep] = useState<
    "credentials" | "code" | "password" | "connected"
  >("credentials");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result =
        step === "credentials"
          ? await api<{ step: "code" | "connected" }>("/telegram/connect", {
              apiId: Number(data.get("apiId")),
              apiHash: String(data.get("apiHash")).trim(),
              phone: String(data.get("phone")).replace(/\s/g, ""),
            })
          : await api<{ step: "password" | "connected" }>("/telegram/login", {
              code: String(data.get("code") ?? ""),
              password: String(data.get("password") ?? ""),
            });
      setStep(result.step);
      if (result.step === "connected") await onConnected();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể kết nối Telegram.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Kết nối tài khoản cá nhân"
      subtitle="API ID và API Hash lấy từ my.telegram.org/apps."
      onClose={onClose}
    >
      {step === "connected" ? (
        <div className="connected-success">
          <CheckCircle size={56} weight="duotone" />
          <h3>Telegram đã sẵn sàng</h3>
          <p>
            Tin hôm nay sẽ tự tải mỗi 5 phút khi máy chủ đang chạy. Kết nối bot
            trong Cài đặt để nhận báo cáo và lời nhắc qua Telegram.
          </p>
          <button className="button primary" onClick={onClose}>
            Vào không gian làm việc
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack" key={step}>
          <div className="connect-explainer">
            <TelegramLogo size={27} />
            <p>
              Đọc lịch sử nhóm và tin nhắn riêng qua tài khoản Telegram của bạn.
            </p>
          </div>
          {step === "credentials" && (
            <>
              <p className="field-note" id="telegram-credentials-help">
                Mở{" "}
                <a
                  href="https://my.telegram.org/apps"
                  target="_blank"
                  rel="noreferrer"
                >
                  my.telegram.org/apps
                </a>
                , đăng nhập và chọn <strong>API development tools</strong> để
                tạo ứng dụng, lấy <strong>api_id</strong> và{" "}
                <strong>api_hash</strong>. Token từ @BotFather nhập ở mục{" "}
                <strong>Thông báo qua Telegram → Bot token</strong>.
              </p>
              <div className="form-grid">
                <label>
                  API ID
                  <input
                    type="number"
                    name="apiId"
                    required
                    min={1}
                    aria-describedby="telegram-credentials-help"
                    placeholder="12345678"
                  />
                </label>
                <label>
                  API Hash
                  <input
                    name="apiHash"
                    type="password"
                    required
                    pattern="[a-fA-F0-9]{32}"
                    aria-describedby="telegram-credentials-help"
                    title="API Hash gồm đúng 32 ký tự 0–9, a–f từ my.telegram.org/apps."
                    onInvalid={() =>
                      setError(
                        "API Hash cần đúng 32 ký tự 0–9, a–f từ my.telegram.org/apps. Token của @BotFather nhập ở mục Thông báo qua Telegram.",
                      )
                    }
                    autoComplete="off"
                    placeholder="32 ký tự 0–9, a–f"
                  />
                </label>
              </div>
              <label>
                Số điện thoại
                <input
                  type="tel"
                  name="phone"
                  required
                  pattern="\+[0-9 ]{8,20}"
                  placeholder="+84 9xxxxxxxx"
                  autoComplete="tel"
                />
              </label>
            </>
          )}
          {step === "code" && (
            <>
              <p className="field-note">
                Telegram gửi mã đến ứng dụng Telegram hoặc SMS. Nhập mã trực
                tiếp ở đây.
              </p>
              <label>
                Mã đăng nhập
                <input
                  name="code"
                  inputMode="numeric"
                  required
                  autoComplete="one-time-code"
                  placeholder="Mã xác minh Telegram"
                />
              </label>
            </>
          )}
          {step === "password" && (
            <label>
              Mật khẩu xác minh hai bước
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Mật khẩu Telegram 2FA"
              />
            </label>
          )}
          <p className="privacy-note">
            <LockKey size={15} />
            Phiên đăng nhập lưu cục bộ. Mã xác minh và mật khẩu 2FA không được
            lưu.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            {step !== "credentials" && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setStep("credentials");
                  setError("");
                }}
              >
                Bắt đầu lại
              </button>
            )}
            <button className="button primary" disabled={busy}>
              {busy
                ? "Đang kết nối…"
                : step === "credentials"
                  ? "Nhận mã đăng nhập"
                  : "Xác minh"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ImportForm({
  onClose,
  onImported,
  day,
}: {
  onClose: () => void;
  onImported: (day: string) => Promise<void>;
  day: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget),
      file = data.get("file") as File;
    if (!file?.size || file.size > 10 * 1024 * 1024)
      return setError("Chọn file JSON Telegram Desktop, tối đa 10 MB.");
    setBusy(true);
    try {
      const payload: unknown = JSON.parse(await file.text());
      await api("/import", {
        payload,
        selfId: String(data.get("selfId")).trim(),
        username: String(data.get("username")).trim(),
        day: String(data.get("day")),
      });
      await onImported(String(data.get("day")));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "File không hợp lệ.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Nhập lịch sử Telegram"
      subtitle="Dùng bản export JSON khi bạn chưa muốn kết nối tài khoản."
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack">
        <div className="connect-explainer">
          <FileArrowUp size={27} />
          <p>
            Telegram Desktop → Settings → Advanced → Export Telegram data →
            JSON. Hoặc Export chat history của một chat.
          </p>
        </div>
        <label>
          File lịch sử
          <input
            type="file"
            name="file"
            accept=".json,application/json"
            required
          />
        </label>
        <div className="form-grid">
          <label>
            User ID của bạn
            <input
              name="selfId"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Ví dụ: 123456789"
            />
          </label>
          <label>
            Username Telegram
            <input name="username" placeholder="@binh" />
          </label>
        </div>
        <p className="field-note">
          User ID cần để nhận diện tin bạn gửi. Có thể bỏ trống nếu file có
          personal_information.user_id. Username dùng để nhận diện @ bạn.
        </p>
        <label>
          Ngày cần phân tích
          <input
            type="date"
            name="day"
            defaultValue={day}
            max={today()}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Đang phân tích…" : "Nhập & phân tích"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
