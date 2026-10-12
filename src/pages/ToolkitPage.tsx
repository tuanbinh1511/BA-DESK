import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowsClockwise,
  FileText,
  ListChecks,
  LockKey,
  MagnifyingGlass,
  Question,
  Toolbox,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { templates } from "../services/templates";
import { prompts } from "../services/prompts";
import type { BAResource } from "../types";
import { Empty } from "../components/WorkspaceUI";
const icons = {
  story: FileText,
  meeting: Users,
  uat: ListChecks,
  clarify: Question,
  change: ArrowsClockwise,
  risk: WarningCircle,
};
export function ToolkitPage({
  setSelectedTemplate,
  setTemplateBody,
}: {
  setSelectedTemplate: (template: BAResource) => void;
  setTemplateBody: (text: string) => void;
}) {
  const [view, setView] = useState("prompts");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const resources: readonly BAResource[] =
    view === "prompts" ? prompts : templates;
  const visible = resources.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      `${item.title} ${item.description}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="toolkit-intro">
        <span className="toolkit-symbol">
          <Toolbox size={32} weight="duotone" />
        </span>
        <div>
          <strong>Từ câu hỏi nghiệp vụ đến đầu ra có thể triển khai.</strong>
          <p>
            {prompts.length} prompt chuyên sâu và {templates.length} mẫu tài
            liệu. Điền bối cảnh, sao chép và dùng trong ChatGPT hoặc Codex.
          </p>
        </div>
      </div>
      <div className="toolkit-controls">
        <div className="tabs">
          <button
            className={view === "prompts" ? "selected" : ""}
            onClick={() => {
              setView("prompts");
              setCategory("all");
            }}
          >
            Prompt cho Senior BA
          </button>
          <button
            className={view === "templates" ? "selected" : ""}
            onClick={() => {
              setView("templates");
              setCategory("all");
            }}
          >
            Mẫu tài liệu
          </button>
        </div>
        <label className="group-search">
          <MagnifyingGlass size={17} />
          <input
            aria-label="Tìm prompt hoặc mẫu BA"
            placeholder="Tìm công việc BA…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Chủ đề BA"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">Mọi chủ đề</option>
          {[...new Set(resources.map((item) => item.category))].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
      {visible.length ? (
        <div className="template-grid">
          {visible.map((item) => {
            const Icon = icons[item.icon];
            return (
              <button
                className="template-card"
                key={item.id}
                onClick={() => {
                  setSelectedTemplate(item);
                  setTemplateBody(item.body);
                }}
              >
                <div>
                  <span className={`template-icon tone-${item.color}`}>
                    <Icon size={25} weight="duotone" />
                  </span>
                  <ArrowUpRight size={19} />
                </div>
                <span className="resource-category">{item.category}</span>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
                <span className="template-link">
                  {view === "prompts" ? "Điền bối cảnh & sao chép" : "Mở mẫu"}
                  <ArrowRight size={15} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Chưa có mẫu phù hợp"
          text="Thử từ khóa khác hoặc chọn mọi chủ đề."
        />
      )}
      <div className="toolkit-note">
        <LockKey size={17} />
        <span>
          Prompt gồm vai trò, đầu vào, quy trình, cấu trúc đầu ra và quality
          gate. Bạn kiểm tra nội dung trước khi dùng cho dự án.
        </span>
      </div>
    </>
  );
}
