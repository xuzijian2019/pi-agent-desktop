"use client";

import { lazy, memo, Suspense, useState } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import { useReducedMotion } from "@/hooks/useStreamingMarkdown";
import { needsWholeMarkdownDocument, supportsStreamingMarkdownAnimation } from "@/lib/streaming-markdown";

// Keep vendor syntax out of the initial page chunks on Safari before 16.4.
const Streamdown = lazy(() => import("@lobehub/streamdown").then((module) => ({ default: module.Streamdown })));

const completionOptions = {
  htmlTags: false,
  inlineKatex: false,
  linkMode: "text-only",
} as const;

type Props = Omit<Options, "children"> & { children: string; isStreaming?: boolean };

/** A headless stream engine; Pi still owns the syntax plugins and all widgets. */
function AnimatedMarkdown({ children, ...options }: Omit<Props, "isStreaming">) {
  const reducedMotion = useReducedMotion();
  // A reconnect or in-place edit can replace a stream. Remount its queue during
  // render so even the first paint cannot contain the previous answer's text.
  const [input, setInput] = useState({ text: children, generation: 0 });
  const generation = input.generation + (children.startsWith(input.text) ? 0 : 1);
  if (children !== input.text) setInput({ text: children, generation });
  if (reducedMotion || !supportsStreamingMarkdownAnimation()) {
    return <ReactMarkdown {...options}>{children}</ReactMarkdown>;
  }

  return (
    <Suspense fallback={<ReactMarkdown {...options}>{children}</ReactMarkdown>}>
      <Streamdown
        {...options}
        key={generation}
        content={children}
        granularity="word"
        smoothing="realtime"
        remend={completionOptions}
      />
    </Suspense>
  );
}

export const StreamingMarkdown = memo(function StreamingMarkdown({ children, isStreaming, ...options }: Props) {
  if (!isStreaming || needsWholeMarkdownDocument(children)) {
    return <ReactMarkdown {...options}>{children}</ReactMarkdown>;
  }
  return <AnimatedMarkdown {...options}>{children}</AnimatedMarkdown>;
});
