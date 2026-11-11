"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SettingDefinition, SettingGroup, SettingsPayload } from "@slm/shared-types";
import { Button } from "@/components/ui/button";
import { apiCall, errorMessage } from "@/lib/client";

const inputClass = "w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm";

/**
 * A form generated from the api's own setting definitions. Adding a setting on the
 * server (one entry in settings-registry.ts) makes it appear here with the right input,
 * range and description, with no change to this file.
 */
export function SettingsForm({ groups }: { groups: SettingGroup[] }) {
  const [definitions, setDefinitions] = useState<SettingDefinition[]>([]);
  const [saved, setSaved] = useState<Record<string, string | number>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function apply(payload: SettingsPayload) {
    setDefinitions(payload.definitions.filter((d) => groups.includes(d.group)));
    setSaved(payload.values);
    setDraft(Object.fromEntries(Object.entries(payload.values).map(([k, v]) => [k, String(v)])));
  }

  useEffect(() => {
    apiCall<SettingsPayload>("/settings")
      .then(apply)
      .catch((error) => setMessage({ kind: "error", text: errorMessage(error) }));
    // groups is a fixed literal per panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changed = definitions.filter((d) => draft[d.key] !== String(saved[d.key]));

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const values = Object.fromEntries(
        changed.map((d) => [d.key, d.type === "number" ? Number(draft[d.key]) : draft[d.key]]),
      );
      apply(await apiCall<SettingsPayload>("/settings", { method: "PUT", json: { values } }));
      setMessage({ kind: "ok", text: "Saved. The change applies to the next request." });
    } catch (error) {
      setMessage({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function reset(key: string) {
    setBusy(true);
    setMessage(null);
    try {
      apply(await apiCall<SettingsPayload>(`/settings/${key}`, { method: "DELETE" }));
    } catch (error) {
      setMessage({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function field(def: SettingDefinition) {
    const id = `setting-${def.key}`;
    const value = draft[def.key] ?? "";
    const set = (next: string) => setDraft((d) => ({ ...d, [def.key]: next }));

    switch (def.type) {
      case "text":
        return (
          <textarea id={id} rows={7} value={value} maxLength={def.max} onChange={(e) => set(e.target.value)} className={inputClass} />
        );
      case "number":
        return (
          <input id={id} type="number" value={value} min={def.min} max={def.max} step={def.step ?? 1} onChange={(e) => set(e.target.value)} className={`${inputClass} max-w-40`} />
        );
      case "color":
        return (
          <div className="flex items-center gap-2">
            <input id={id} type="color" value={value} onChange={(e) => set(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent" />
            <input aria-label={`${def.label} (hex)`} value={value} onChange={(e) => set(e.target.value)} maxLength={7} className={`${inputClass} max-w-32 font-mono`} />
          </div>
        );
      case "select":
        return (
          <select id={id} value={value} onChange={(e) => set(e.target.value)} className={`${inputClass} max-w-56`}>
            {def.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      default:
        return <input id={id} value={value} maxLength={def.max} onChange={(e) => set(e.target.value)} className={inputClass} />;
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      {definitions.map((def) => (
        <div key={def.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`setting-${def.key}`} className="text-sm font-medium">
              {def.label}
            </label>
            {String(saved[def.key]) !== String(def.default) && (
              <button type="button" onClick={() => void reset(def.key)} disabled={busy} className="text-xs text-muted-foreground underline hover:text-foreground">
                Reset to default
              </button>
            )}
          </div>
          {field(def)}
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || changed.length === 0}>
          {busy ? "Saving..." : changed.length > 0 ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Saved"}
        </Button>
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-green-400"}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
