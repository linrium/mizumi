"use client";

import {
  DiceFaces04Icon,
  LiveStreaming01Icon,
  MailSend02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Editor from "@monaco-editor/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type SendResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status?: number; error: string };

export type EventOption = {
  id: string;
  label: string;
  endpoint: string;
  createSample: () => Record<string, unknown>;
};

type EventPublisherProps = {
  title: string;
  subtitle: string;
  options: EventOption[];
};

function prettyJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function EventPublisher({
  title,
  subtitle,
  options,
}: EventPublisherProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      options.map((option) => [option.id, prettyJson(option.createSample())]),
    ),
  );
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SendResult | null>>({});

  const handleGenerate = (option: EventOption) => {
    setValues((current) => ({
      ...current,
      [option.id]: prettyJson(option.createSample()),
    }));
    setResults((current) => ({ ...current, [option.id]: null }));
  };

  const handleSend = async (option: EventOption) => {
    const value = values[option.id] ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setResults((current) => ({
        ...current,
        [option.id]: {
          ok: false,
          error: "Invalid JSON. Fix the payload before sending.",
        },
      }));
      return;
    }

    setSending((current) => ({ ...current, [option.id]: true }));
    setResults((current) => ({ ...current, [option.id]: null }));

    try {
      const res = await fetch(option.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setResults((current) => ({
          ...current,
          [option.id]: { ok: true, status: res.status, data: body },
        }));
      } else {
        setResults((current) => ({
          ...current,
          [option.id]: {
            ok: false,
            status: res.status,
            error: (body as { error?: string })?.error ?? `HTTP ${res.status}`,
          },
        }));
      }
    } catch (error) {
      setResults((current) => ({
        ...current,
        [option.id]: { ok: false, error: (error as Error).message },
      }));
    } finally {
      setSending((current) => ({ ...current, [option.id]: false }));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3 shrink-0">
        <HugeiconsIcon
          icon={LiveStreaming01Icon}
          size={15}
          className="text-muted-foreground"
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="grid h-full gap-0"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          }}
        >
          {options.map((option, index) => {
            const result = results[option.id] ?? null;
            const isSending = sending[option.id] ?? false;

            return (
              <section
                key={option.id}
                className={`flex min-h-0 flex-col overflow-hidden bg-background ${
                  index === 0 ? "" : "border-l"
                }`}
              >
                <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2 shrink-0">
                  <HugeiconsIcon
                    icon={LiveStreaming01Icon}
                    size={14}
                    className="text-muted-foreground"
                  />
                  <div className="text-sm font-medium text-foreground">
                    {option.label}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerate(option)}
                      className="h-7 gap-1.5 px-2.5 text-[11px]"
                    >
                      <HugeiconsIcon icon={DiceFaces04Icon} size={11} />
                      Generate
                    </Button>
                    <Button
                      size="sm"
                      disabled={isSending}
                      onClick={() => handleSend(option)}
                      className="h-7 gap-1.5 px-2.5 text-[11px]"
                    >
                      <HugeiconsIcon icon={MailSend02Icon} size={11} />
                      {isSending ? "Sending…" : "Send"}
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1">
                  <Editor
                    height="100%"
                    language="json"
                    theme="vs"
                    value={values[option.id] ?? ""}
                    onChange={(nextValue) => {
                      setValues((current) => ({
                        ...current,
                        [option.id]: nextValue ?? "",
                      }));
                      setResults((current) => ({
                        ...current,
                        [option.id]: null,
                      }));
                    }}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      overviewRulerLanes: 0,
                      renderLineHighlight: "line",
                      padding: { top: 10, bottom: 10 },
                      fontFamily: "var(--font-geist-mono)",
                      lineHeight: 1.55,
                      formatOnPaste: true,
                      formatOnType: true,
                    }}
                  />
                </div>

                <div className="h-52 shrink-0 border-t">
                  <div className="flex h-8 items-center gap-3 border-b bg-muted/10 px-3 shrink-0">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Response
                    </span>
                    {result && (
                      <span
                        className={
                          result.ok
                            ? "font-mono text-[11px] text-emerald-600"
                            : "font-mono text-[11px] text-destructive"
                        }
                      >
                        {result.ok
                          ? `${result.status} Accepted`
                          : result.status
                            ? `${result.status} Error`
                            : "Error"}
                      </span>
                    )}
                  </div>
                  <div className="h-[calc(100%-32px)] overflow-auto px-4 py-2">
                    {!result && (
                      <span className="text-xs text-muted-foreground">
                        Send this event to see the response.
                      </span>
                    )}
                    {result && (
                      <pre
                        className={`whitespace-pre-wrap font-mono text-xs ${result.ok ? "text-foreground" : "text-destructive"}`}
                      >
                        {result.ok
                          ? JSON.stringify(result.data, null, 2)
                          : result.error}
                      </pre>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
