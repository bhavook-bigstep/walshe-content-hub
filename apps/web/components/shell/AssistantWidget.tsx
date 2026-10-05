"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, askAssistant, type AssistantItem } from "../../lib/api";

// The sticky Q/A assistant (bottom-right): find content + answer questions, grounded in approved
// content. Content *generation* lives separately in the Design Studio's build service.
type Turn =
  | { role: "you"; text: string }
  | { role: "assistant"; text: string; items: AssistantItem[]; suggestion?: { label: string } | null };

const PROMPTS = ["Find events in Galway", "What should I post this week?", "Places on the Wild Atlantic Way"];

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy, open]);

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
    <>
      {/* Launcher button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        data-testid="assistant-launcher"
        className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-walshe-teal text-white shadow-lift transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-walshe-mint"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 11.5a8.5 8.5 0 01-11.9 7.8L3 21l1.7-6.1A8.5 8.5 0 1121 11.5z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <section
          role="dialog"
          aria-label="Assistant"
          data-testid="assistant-panel"
          className="fixed bottom-24 right-5 z-50 flex h-[32rem] max-h-[calc(100vh-7rem)] w-[calc(100vw-2.5rem)] max-w-[24rem] flex-col overflow-hidden rounded-lg border border-walshe-line bg-walshe-base shadow-lift"
        >
          <header className="flex flex-none items-center gap-2 border-b border-walshe-line px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-walshe-mint text-walshe-teal">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 3l1.6 4.8L18.5 9l-4.9 1.2L12 15l-1.6-4.8L5.5 9l4.9-1.2z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-small font-semibold text-walshe-ink">Assistant</p>
              <p className="text-[11px] text-walshe-grey">Find content · answer questions</p>
            </div>
          </header>

          <div ref={logRef} data-testid="assistant-log" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {turns.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-small text-walshe-grey">Ask me to find content or answer a question.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {PROMPTS.map((p) => (
                    <button key={p} type="button" onClick={() => void ask(p)} className="chip-draft text-[12px] hover:opacity-80">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) =>
                t.role === "you" ? (
                  <div key={i} className="flex justify-end">
                    <p className="max-w-[85%] rounded-lg bg-walshe-ink px-3.5 py-2 text-small text-walshe-base">{t.text}</p>
                  </div>
                ) : (
                  <div key={i} className="flex flex-col gap-2">
                    <p className="max-w-[92%] whitespace-pre-line rounded-lg bg-walshe-stone/60 px-3.5 py-2 text-small text-walshe-ink">
                      {t.text}
                    </p>
                    {t.items.length > 0 && (
                      <ul className="space-y-1.5">
                        {t.items.slice(0, 4).map((it) => (
                          <li key={it.id} className="rounded-md border border-walshe-line bg-walshe-mist/40 px-3 py-2">
                            <p className="text-small font-semibold text-walshe-ink">{it.title}</p>
                            <p className="text-[12px] capitalize text-walshe-grey">
                              {it.type} · {it.destination}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                    {t.suggestion && (
                      <Link href="/agent/studio" onClick={() => setOpen(false)} className="btn-secondary w-fit text-[12px]">
                        {t.suggestion.label} →
                      </Link>
                    )}
                  </div>
                ),
              )
            )}
            {busy && <p className="text-small text-walshe-grey">Thinking…</p>}
          </div>

          {error && <p role="alert" className="px-4 text-small font-medium text-walshe-danger">{error}</p>}

          <form onSubmit={onSubmit} className="flex flex-none gap-2 border-t border-walshe-line p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="field flex-1 text-small"
              placeholder="Ask the assistant…"
              aria-label="Ask the assistant"
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn-primary flex-none disabled:opacity-60">
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}
