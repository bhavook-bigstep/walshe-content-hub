"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { ApiError, askAssistant, type AssistantItem } from "../../../lib/api";

type Turn =
  | { role: "you"; text: string }
  | { role: "assistant"; text: string; items: AssistantItem[]; suggestion?: { label: string } | null };

const PROMPTS = [
  "Find events in Galway",
  "What should I post this week?",
  "Show me places on the Wild Atlantic Way",
];

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function ask(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setTurns((t) => [...t, { role: "you", text }]);
    setBusy(true);
    try {
      const reply = await askAssistant(text);
      setTurns((t) => [
        ...t,
        { role: "assistant", text: reply.reply, items: reply.items, suggestion: reply.suggestion as { label: string } | null },
      ]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The assistant is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Assistant" }]}
        title="Assistant"
        description="Ask in plain language — the assistant only ever answers from approved, current content you're allowed to use."
      />

      {/* Bounded chat log (scrolls within the card, never the page). */}
      <div
        ref={logRef}
        data-testid="assistant-log"
        className="card min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
      >
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-body text-walshe-grey">No blank screen — start with one of these:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {PROMPTS.map((p) => (
                <button key={p} type="button" onClick={() => void ask(p)} className="chip-draft hover:opacity-80">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === "you" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] rounded-lg bg-walshe-ink px-4 py-2.5 text-small text-walshe-base">
                  {t.text}
                </p>
              </div>
            ) : (
              <div key={i} className="flex flex-col gap-3">
                <p className="max-w-[90%] whitespace-pre-line rounded-lg bg-walshe-stone/60 px-4 py-2.5 text-small text-walshe-ink">
                  {t.text}
                </p>
                {t.items.length > 0 && (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {t.items.map((it) => (
                      <li key={it.id} className="rounded-md border border-walshe-line bg-walshe-mist/40 p-3">
                        <p className="text-small font-semibold text-walshe-ink">{it.title}</p>
                        <p className="text-small capitalize text-walshe-grey">
                          {it.type} · {it.destination}
                        </p>
                        {it.reason && <p className="mt-1 text-[12px] text-walshe-mint">{it.reason}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {t.suggestion && (
                  <Link href="/agent/studio" className="btn-secondary w-fit">
                    {t.suggestion.label} →
                  </Link>
                )}
              </div>
            ),
          )
        )}
        {busy && <p className="text-small text-walshe-grey">Thinking…</p>}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-small font-medium text-walshe-danger">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex flex-none gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="field flex-1"
          placeholder="Ask for content, ideas, or a destination…"
          aria-label="Ask the assistant"
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn-primary disabled:opacity-60">
          Send
        </button>
      </form>
    </div>
  );
}
