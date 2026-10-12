export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dateOf = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
export const clock = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
export const longDate = (day: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${day}T12:00:00+07:00`));
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
export const shiftDay = (day: string, offset: number) => {
  const date = new Date(`${day}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return dateOf(date.toISOString());
};
export const priorityLabel = {
  high: "Ưu tiên cao",
  medium: "Trung bình",
  low: "Thấp",
};
export function buildReport(tasks: import("../types").Task[], day: string) {
  tasks = tasks.filter((task) => dateOf(task.createdAt) === day);
  const active = tasks.filter((task) => task.status !== "done");
  const waiting = tasks.filter(
    (task) =>
      task.replyStatus === "unanswered" || task.replyStatus === "uncertain",
  );
  return [
    `BA DESK · ${longDate(day)}`,
    "",
    `${active.length} việc chưa hoàn thành · ${waiting.length} tin cần phản hồi hoặc kiểm tra.`,
    ...tasks
      .sort((a, b) => a.sender.localeCompare(b.sender, "vi"))
      .map(
        (task) =>
          `${task.sender} · ${clock(task.createdAt)}\n• ${task.title} · ${task.status === "done" ? "Hoàn thành" : task.replyStatus === "replied" ? "Đã trả lời" : "Cần phản hồi"}${task.dueAt ? ` · Hạn ${clock(task.dueAt)}` : ""}`,
      ),
  ].join("\n");
}
