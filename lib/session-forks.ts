import type { SessionTreeNode } from "@/lib/types";

/** A split can start at the first message (multiple roots) or inside a tree. */
export function hasForks(tree: SessionTreeNode[]): boolean {
  if (tree.length > 1) return true;
  const stack = [...tree];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.children.length > 1) return true;
    stack.push(...node.children);
  }
  return false;
}
