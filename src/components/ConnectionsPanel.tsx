"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Provider = "github" | "notion";
const INFO: Record<Provider, { label: string; how: string; placeholder: string }> = {
  github: {
    label: "GitHub",
    how: "GitHub → Settings → Developer settings → Personal access tokens에서 'repo' 권한으로 토큰을 만들어 붙여넣으세요.",
    placeholder: "ghp_...",
  },
  notion: {
    label: "Notion",
    how: "notion.so/my-integrations에서 내부 연동을 만들고 시크릿을 붙여넣으세요. 회의록 페이지의 '연결'에서 그 연동을 추가해야 읽을 수 있어요.",
    placeholder: "secret_... 또는 ntn_...",
  },
};

function Row({ provider, connected }: { provider: Provider; connected: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const info = INFO[provider];

  async function save() {
    setMsg("");
    const r = await fetch("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, token }),
    });
    if (r.ok) {
      setToken(""); // never keep the token in the page after saving
      router.refresh();
    } else setMsg(r.status === 400 ? "토큰을 입력하세요." : "저장하지 못했습니다.");
  }

  async function remove() {
    await fetch(`/api/connections?provider=${provider}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-b-4 border-black pb-4 last:border-b-0">
      <div className="flex items-center gap-2">
        <strong>{info.label}</strong>
        <span className="border-2 border-black px-1 text-xs" style={{ background: connected ? "var(--done)" : "var(--doing)" }}>
          {connected ? "연결됨" : "미연결"}
        </span>
        {connected && (
          <button className="ml-auto text-sm underline" onClick={remove}>
            연결 해제
          </button>
        )}
      </div>
      <p className="text-sm">{info.how}</p>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          className="px-input"
          placeholder={connected ? "새 토큰으로 바꾸려면 붙여넣기" : info.placeholder}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-label={`${info.label} 토큰`}
        />
        <button className="px-btn whitespace-nowrap" onClick={save} disabled={!token.trim()}>
          저장
        </button>
      </div>
      {msg && <p className="text-sm font-bold text-red-700">{msg}</p>}
    </div>
  );
}

export function ConnectionsPanel({ status }: { status: { github: boolean; notion: boolean } }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">내 계정으로 연결합니다. 토큰은 암호화해서 저장하고 다시 보여주지 않아요.</p>
      <Row provider="github" connected={status.github} />
      <Row provider="notion" connected={status.notion} />
    </div>
  );
}
