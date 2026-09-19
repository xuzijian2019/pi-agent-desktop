import type { SessionTreeNode } from "@/lib/types";

/**
 * True when the session entry tree contains a real fork point — a node the
 * conversation left in more than one direction, which is the only case where
 * the header's fork navigator has anything to navigate.
 *
 * A linear session is a chain of single-child nodes; that is not a fork, so
 * the navigator is hidden rather than shown with an empty-state message.
 */
export function hasForks(tree: SessionTreeNode[]): boolean {
  for (const node of tree) {
    if (node.children.length > 1) return true;
    if (hasForks(node.children)) return true;
  }
  return false;
}
