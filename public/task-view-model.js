export function getTaskCounts(tasks, { today, sinceDate, sinceHideDone = true } = {}) {
  const openTasks = tasks.filter((task) => !task.done);
  return {
    inbox: openTasks.length,
    today: openTasks.filter((task) => task.dueDate === today).length,
    overdue: openTasks.filter((task) => task.dueDate && task.dueDate < today).length,
    upcoming: openTasks.filter((task) => task.dueDate && task.dueDate > today).length,
    since: tasks.filter((task) => isTaskSinceViewMatch(task, { sinceDate, sinceHideDone })).length
  };
}

export function isTaskSinceViewMatch(task, { sinceDate, sinceHideDone = true } = {}) {
  if (!isTaskSince(task, sinceDate)) return false;
  return !(sinceHideDone && task.done);
}

export function isTaskSince(task, sinceDate) {
  const date = taskDateIso(task);
  return Boolean(date && sinceDate && date >= sinceDate);
}

export function taskDateIso(task) {
  return task.createdDate || task.dueDate || timestampIso(task.createdTime || task.editedTime);
}

export function timestampIso(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}
