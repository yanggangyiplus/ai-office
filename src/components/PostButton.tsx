"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MESSAGES: Record<number, string> = {
  400: "입력이 올바르지 않습니다. 저장소와 담당자를 확인하세요.",
  403: "권한이 없습니다.",
  409: "이미 확정된 회의입니다.",
};

// POSTs JSON, then refreshes the page. Shows a plain-language error on failure.
export function PostButton({
  url,
  body,
  children,
  disabled,
  hint,
}: {
  url: string;
  body?: unknown;
  children: React.ReactNode;
  disabled?: boolean;
  hint?: string; // shown when disabled, e.g. why
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span>
      <button
        className="px-btn"
        disabled={busy || disabled}
        title={disabled ? hint : undefined}
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
