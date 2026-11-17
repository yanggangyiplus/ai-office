"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/realtime/types";

const ERRORS: Record<number, string> = {
  400: "메시지는 1자 이상 500자 이하여야 해요.",
  403: "이 팀의 멤버만 보낼 수 있어요.",
};

export function ChatPanel({
  teamId,
  messages,
  myUserId,
  onSent,
}: {
  teamId: string;
  messages: ChatMessage[];
  myUserId: string;
  onSent: (m: ChatMessage) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/teams/${teamId}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setBusy(false);
    if (r.ok) {
      setText("");
      onSent((await r.json()) as ChatMessage);
    } else setErr(ERRORS[r.status] ?? "보내지 못했어요. 잠시 후 다시 시도하세요.");
  }

  return (
    <section className="px flex h-full min-h-72 flex-col gap-2 p-3" aria-label="팀 채팅">
      <h2 className="font-bold">채팅</h2>
      <ul className="flex-1 space-y-1 overflow-y-auto text-sm" style={{ maxHeight: 360 }} aria-live="polite">
        {messages.length === 0 && <li>아직 대화가 없어요. 첫 인사를 건네 보세요.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.userId === myUserId ? "text-right" : ""}>
            <strong>{m.name}</strong>{" "}
            <span className="break-words">{m.body}</span>
          </li>
        ))}
        <li ref={endRef} />
      </ul>
      <form onSubmit={send} className="flex gap-2">
        <input
          className="px-input"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지 입력"
          aria-label="채팅 메시지"
        />
        <button className="px-btn whitespace-nowrap" disabled={busy || !text.trim()}>보내기</button>
      </form>
      {err && <p className="text-sm font-bold text-red-700">{err}</p>}
    </section>
  );
}
