"use client";
import { createContext, useContext, useState } from "react";
export const TranscriptReveal = createContext(false);
export function useTranscriptExpansion(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const reveal = useContext(TranscriptReveal);
  const [expanded, setExpanded] = useState(false);
  return [reveal || expanded, setExpanded];
}
export function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  const terms = [...query.matchAll(/"([^"]+)"|(\S+)/g)].map(match => match[1] ?? match[2]).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(pattern).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part)}</>;
}

export function highlightTranscriptNode(root: HTMLElement, query: string): Range | undefined {
  const terms = [...query.matchAll(/"([^"]+)"|(\S+)/g)].map(match => match[1] ?? match[2]);
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode()) && ranges.length < 500) {
    if (node.parentElement?.closest("button, [aria-hidden=true]")) continue;
    const text = node.textContent ?? "";
    for (const term of terms) {
      const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      for (const match of text.matchAll(pattern)) {
        if (ranges.length >= 500) break;
        const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length); ranges.push(range);
      }
    }
  }
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightType = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (registry && HighlightType) registry.set("transcript-search-match", new HighlightType(...ranges));
  return ranges[0];
}
export function clearTranscriptHighlight() { (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete("transcript-search-match"); }
