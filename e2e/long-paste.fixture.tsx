import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatInput, type ChatInputHandle } from "../components/ChatInput";
import { I18nProvider } from "../hooks/useI18n";

const historyImage = { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" };

function Fixture() {
  const input = useRef<ChatInputHandle>(null);
  const [sent, setSent] = useState("");
  const [key, setKey] = useState("paste-a");
  return <I18nProvider>
    <button onClick={() => setKey(key === "paste-a" ? "paste-b" : "paste-a")}>Switch draft</button>
    <button onClick={() => input.current?.restoreSubmission(sent)}>Restore submission</button>
    <ChatInput ref={input} draftKey={key} onSend={setSent} onAbort={() => {}} isStreaming={false}
      inputHistory={[{ text: "Earlier image prompt", images: [historyImage] }, { text: "", images: [historyImage] }]}
      model={{ provider: "fixture", modelId: "fixture" }} modelList={[]} />
    <output id="sent">{sent}</output>
  </I18nProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
