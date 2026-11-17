"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MESSAGES: Record<number, string> = {
  403: "권한이 없습니다.",
  409: "이미 확정된 회의입니다.",
  422: "이 Notion 링크는 사용할 수 없습니다. '회의록' 상위 페이지 아래의 페이지인지 확인하세요.",
};

// POSTs JSON, then refreshes the page. Shows a plain-language error on failure.
export function PostButton({
  url,
  body,
  children,
}: {
  url: string;
  body?: unknown;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span>
      <button
        className="px-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          const r = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body ?? {}),
          });
          setBusy(false);
          if (r.ok) router.refresh();
          else setErr(MESSAGES[r.status] ?? "실패했습니다. 잠시 후 다시 시도하세요.");
        }}
      >
        {busy ? "..." : children}
      </button>
      {err && <p className="mt-2 text-sm font-bold text-red-700">{err}</p>}
    </span>
  );
}
