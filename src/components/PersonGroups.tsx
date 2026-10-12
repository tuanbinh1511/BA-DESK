import { CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { Task } from "../types";
import { groupByPerson } from "../utils/people";
import { initials } from "../utils/dates";
export function PersonGroups({
  tasks,
  children,
}: {
  tasks: Task[];
  children: (task: Task) => ReactNode;
}) {
  return (
    <div className="person-groups">
      {groupByPerson(tasks).map((person, index) => (
        <details
          key={person.id}
          open
          className="person-group"
          style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
        >
          <summary>
            <span
              className={`avatar avatar-small avatar-${person.name.length % 4}`}
            >
              {initials(person.name)}
            </span>
            <strong>{person.name}</strong>
            <span className="person-count">{person.tasks.length} yêu cầu</span>
            <span className="person-replies">
              {
                person.tasks.filter(
                  (task) =>
                    task.replyStatus === "unanswered" ||
                    task.replyStatus === "uncertain",
                ).length
              }{" "}
              cần phản hồi
            </span>
            <CaretDown size={16} />
          </summary>
          <div className="person-items">
            {person.tasks.map((task) => (
              <div key={task.id}>{children(task)}</div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
