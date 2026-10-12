import type { Task } from "../types";
export function groupByPerson(tasks: Task[]) {
  const groups = new Map<string, { id: string; name: string; tasks: Task[] }>();
  for (const task of tasks) {
    const id = task.senderId || `${task.sender}:${task.chatId || task.project}`;
    const group = groups.get(id) || { id, name: task.sender, tasks: [] };
    group.tasks.push(task);
    groups.set(id, group);
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))
    .map((group) => ({
      ...group,
      tasks: group.tasks.sort(
        (a, b) =>
          rank[a.priority] - rank[b.priority] ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    }));
}
