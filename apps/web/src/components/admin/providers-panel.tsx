"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ProviderCredentialPublic, ProviderName } from "@slm/shared-types";
import { Button } from "@/components/ui/button";
import { apiCall, errorMessage } from "@/lib/client";

const PROVIDERS: ProviderName[] = ["GROQ", "AZURE_OPENAI", "ANTHROPIC"];

const inputClass = "w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm";

/** The non-secret settings each provider needs, with what to type as an example. */
const CONFIG_FIELDS: Record<ProviderName, { key: string; label: string; placeholder: string }[]> = {
  GROQ: [{ key: "model", label: "Model", placeholder: "openai/gpt-oss-120b" }],
  ANTHROPIC: [{ key: "model", label: "Model", placeholder: "claude-3-5-haiku-latest" }],
  AZURE_OPENAI: [
    { key: "instanceName", label: "Resource name", placeholder: "my-openai-resource" },
    { key: "deploymentName", label: "Deployment name", placeholder: "gpt-4o" },
    { key: "apiVersion", label: "API version", placeholder: "2024-10-21" },
  ],
};

type TestResult = { ok: boolean; latencyMs: number; reply?: string; error?: string };

function CredentialRow({ credential, onChanged }: { credential: ProviderCredentialPublic; onChanged: () => void }) {
  const fields = CONFIG_FIELDS[credential.provider];
  const initial = (key: string) => String(credential.extraConfig?.[key] ?? "");
  const [config, setConfig] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, initial(f.key)])));
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = fields.some((f) => config[f.key] !== initial(f.key));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{credential.provider}</span> · {credential.label}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={credential.isActive}
            aria-label={`${credential.label} is ${credential.isActive ? "active" : "inactive"}`}
            disabled={busy}
            onClick={() => void run(() => apiCall(`/providers/${credential.id}`, { method: "PATCH", json: { isActive: !credential.isActive } }))}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors disabled:opacity-50 ${credential.isActive ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block size-4 rounded-full bg-foreground transition-transform ${credential.isActive ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className={credential.isActive ? "text-green-400" : "text-muted-foreground"}>{credential.isActive ? "active" : "off"}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {f.label}
            <input value={config[f.key]} placeholder={f.placeholder} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} className={inputClass} />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !dirty} onClick={() => void run(() => apiCall(`/providers/${credential.id}`, { method: "PATCH", json: { extraConfig: config } }))}>
          Save model
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !credential.isActive}
          onClick={() => {
            setBusy(true);
            setTest(null);
            apiCall<TestResult>("/providers/test", { method: "POST", json: { provider: credential.provider } })
              .then(setTest)
              .catch((err) => setTest({ ok: false, latencyMs: 0, error: errorMessage(err) }))
              .finally(() => setBusy(false));
          }}
        >
          Test connection
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => apiCall(`/providers/${credential.id}`, { method: "DELETE" }))}>
          Delete
        </Button>
        {test && (
          <span role="status" className={`text-xs ${test.ok ? "text-green-400" : "text-destructive"}`}>
            {test.ok ? `Working · ${test.latencyMs} ms${test.reply ? ` · replied "${test.reply}"` : ""}` : `Failed: ${test.error}`}
          </span>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function ProvidersPanel() {
  const [credentials, setCredentials] = useState<ProviderCredentialPublic[]>([]);
  const [provider, setProvider] = useState<ProviderName>("GROQ");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setCredentials(await apiCall<ProviderCredentialPublic[]>("/providers"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiCall("/providers", { method: "POST", json: { provider, label, value, extraConfig: config } });
      setLabel("");
      setValue("");
      setConfig({});
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3">
        {credentials.length === 0 && <li className="text-sm text-muted-foreground">No provider keys yet. Add one below to start chatting.</li>}
        {credentials.map((credential) => (
          <CredentialRow key={credential.id} credential={credential} onChanged={() => void load()} />
        ))}
      </ul>

      <form onSubmit={add} className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium">Add a provider key</h3>
        <select
          aria-label="Provider"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as ProviderName);
            setConfig({});
          }}
          className={inputClass}
        >
          {PROVIDERS.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <input placeholder="Label (e.g. production)" value={label} onChange={(e) => setLabel(e.target.value)} required className={inputClass} />
        <input placeholder="API key" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} required className={inputClass} />
        <div className="grid gap-3 sm:grid-cols-2">
          {CONFIG_FIELDS[provider].map((f) => (
            <input key={f.key} aria-label={f.label} placeholder={`${f.label} (${f.placeholder})`} value={config[f.key] ?? ""} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} className={inputClass} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          The key is encrypted before it is stored and is never shown again. Leave the model blank to use the default.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Add key"}</Button>
      </form>
    </div>
  );
}
