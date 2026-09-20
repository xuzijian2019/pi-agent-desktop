/** Keep saved projects in order; append newly discovered projects in their default order. */
export function orderProjects<T extends { projectRoot: string }>(projects: T[], order: string[]): T[] {
  const ranks = new Map(order.map((root, index) => [root, index]));
  return [...projects].sort((a, b) =>
    (ranks.get(a.projectRoot) ?? Infinity) - (ranks.get(b.projectRoot) ?? Infinity));
}

/** Move within the full list so filtering or archiving does not discard hidden positions. */
export function moveProject(order: string[], source: string, target: string, edge: "before" | "after"): string[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = order.filter((root) => root !== source);
  next.splice(next.indexOf(target) + (edge === "after" ? 1 : 0), 0, source);
  return next;
}
