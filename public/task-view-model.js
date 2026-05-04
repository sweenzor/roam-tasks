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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return localIsoDate(date);
}

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
