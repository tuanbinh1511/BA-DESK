import type { TaskStatus } from "../types";
export const replyLabels = {
  unanswered: "Chưa phản hồi",
  replied: "Đã phản hồi",
  uncertain: "Cần xác nhận",
  na: "Không áp dụng",
};
export const statusLabels: Record<TaskStatus, string> = {
  todo: "Cần làm",
  doing: "Đang làm",
  done: "Hoàn thành",
};
