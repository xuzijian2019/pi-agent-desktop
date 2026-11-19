import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatInput, type ChatInputHandle } from "../components/ChatInput";
import { I18nProvider } from "../hooks/useI18n";

const historyImage = { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAE0lEQVR4nGOQ63lGEDGMKhqMigC6muEB15XY+wAAAABJRU5ErkJggg==" };
const imageOnly = { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAE0lEQVR4nGN4US9HEDGMKhqMigA+3trRiYNriQAAAABJRU5ErkJggg==" };

function Fixture() {
  const input = useRef<ChatInputHandle>(null);
  const [sent, setSent] = useState("");
  const [key, setKey] = useState("paste-a");
  return <I18nProvider>
    <button onClick={() => setKey(key === "paste-a" ? "paste-b" : "paste-a")}>Switch draft</button>
    <button onClick={() => input.current?.restoreSubmission(sent)}>Restore submission</button>
    {/* ChatWindow anchors the composer near the bottom; reproduce its space
        for upward-opening menus without changing the real ChatInput styles. */}
    <div style={{ display: "grid", alignContent: "end", minHeight: "72vh" }}>
      <ChatInput ref={input} draftKey={key} onSend={setSent} onAbort={() => {}} isStreaming={false}
        inputHistory={[{ text: "Earlier image prompt", images: [historyImage] }, { text: "", images: [imageOnly] }]}
        model={{ provider: "fixture", modelId: "fixture" }} modelList={[]} />
    </div>
    <output id="sent" hidden>{sent}</output>
  </I18nProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
