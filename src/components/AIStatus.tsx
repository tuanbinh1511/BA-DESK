import { ArrowsClockwise, Check, Sparkle } from "@phosphor-icons/react";
import type { AIState } from "../types";
import { clock } from "../utils/dates";
export function AIStatus({
  ai,
  onAnalyze,
  disabled = false,
}: {
  ai: AIState;
  onAnalyze: () => Promise<void>;
  disabled?: boolean;
}) {
  const stage = ai.running
    ? /phần \d|Đã phân tích/.test(ai.progress)
      ? 1
      : 0
    : ai.lastAnalyzedAt
      ? 3
      : -1;
  return (
    <div
      className={`ai-status ${ai.running ? "ai-running" : ""}`}
      aria-busy={ai.running}
    >
      <span className="ai-symbol">
        {ai.running ? (
          <ArrowsClockwise size={22} className="spin" />
        ) : (
          <Sparkle size={22} weight="duotone" />
        )}
      </span>
      <div>
        <strong>
          {ai.running
            ? "Đang đọc tin trong ngày và đối chiếu phản hồi"
            : "AI phân tích trong ngày · Codex / ChatGPT"}
        </strong>
        <p role="status">
          {ai.running
            ? ai.progress
            : ai.error ||
              (ai.lastAnalyzedAt
                ? `${ai.model} · ${ai.coverage?.messages || 0} tin / ${ai.coverage?.chats || 0} hội thoại · Cập nhật ${clock(ai.lastAnalyzedAt)}`
                : ai.available
                  ? `${ai.model} · phân tích theo lịch, dùng lại phần không đổi`
                  : "Đăng nhập Codex bằng ChatGPT trên máy để dùng AI")}
        </p>
        {stage >= 0 && (
          <ol className="analysis-steps" aria-label="Tiến trình phân tích">
            {["Tin trong ngày", "Đối chiếu yêu cầu", "Kết quả theo người"].map(
              (label, index) => (
                <li
                  key={label}
                  className={
                    index < stage
                      ? "step-done"
                      : index === stage
                        ? "step-current"
                        : ""
                  }
                >
                  <span>
                    {index < stage ? (
                      <Check size={10} weight="bold" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {label}
                </li>
              ),
            )}
          </ol>
        )}
        {ai.coverage && !ai.running && (
          <small>
            Chỉ tin trong ngày đã chọn · {ai.coverage.cachedParts} phần dùng lại
          </small>
        )}
      </div>
      <button
        className="button secondary"
        disabled={disabled || ai.running || !ai.available}
        onClick={() => void onAnalyze()}
      >
        {ai.running ? "Đang phân tích…" : "Phân tích lại"}
      </button>
      {ai.running && (
        <span className="ai-progress-track">
          <span />
        </span>
      )}
    </div>
  );
}
