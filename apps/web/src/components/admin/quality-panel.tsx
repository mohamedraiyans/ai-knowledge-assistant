"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { EvalCaseSummary, EvalRunSummary, ProviderName, UsageStats } from "@slm/shared-types";
import { Button } from "@/components/ui/button";
import { apiCall, errorMessage } from "@/lib/client";

const inputClass = "w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const pct = (part: number, total: number) => (total === 0 ? "—" : `${Math.round((part / total) * 100)}%`);

function UsageSection() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiCall<UsageStats>("/tracing/usage")
      .then(setStats)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!stats) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="LLM calls" value={stats.totalCalls.toLocaleString()} />
        <Stat label="Failed" value={stats.failedCalls.toLocaleString()} />
        <Stat label="Average latency" value={`${stats.avgLatencyMs.toLocaleString()} ms`} />
        <Stat label="Tokens in / out" value={`${stats.inputTokens.toLocaleString()} / ${stats.outputTokens.toLocaleString()}`} />
      </div>

      {stats.recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No calls recorded yet. Ask a question in the chat and it will appear here.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Provider · model</th>
                <th className="px-3 py-2 text-right font-medium">Latency</th>
                <th className="px-3 py-2 text-right font-medium">Tokens in/out</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((call) => (
                <tr key={call.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(call.createdAt).toLocaleTimeString()}</td>
                  <td className="px-3 py-2">{call.purpose}</td>
                  <td className="px-3 py-2">{call.provider}{call.model ? ` · ${call.model}` : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{call.latencyMs} ms</td>
                  <td className="px-3 py-2 text-right tabular-nums">{call.inputTokens ?? "—"} / {call.outputTokens ?? "—"}</td>
                  <td className={`px-3 py-2 ${call.ok ? "text-green-400" : "text-destructive"}`} title={call.error ?? undefined}>
                    {call.ok ? "ok" : "failed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: EvalRunSummary }) {
  return (
    <details className="rounded-lg border border-border p-3 text-sm">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span>
          {new Date(run.createdAt).toLocaleString()} · {run.provider}
        </span>
        <span className="flex gap-4 text-xs tabular-nums">
          <span className="text-green-400">Correct {run.correct}/{run.total} ({pct(run.correct, run.total)})</span>
          <span className="text-sky-400">Grounded {run.grounded}/{run.total} ({pct(run.grounded, run.total)})</span>
          <span className="text-muted-foreground">{run.avgLatencyMs} ms avg</span>
        </span>
      </summary>
      <ul className="mt-3 flex flex-col gap-3">
        {run.results.map((r) => (
          <li key={r.caseId} className="rounded-md border border-border p-2 text-xs">
            <p className="font-medium">{r.question}</p>
            <p className="mt-1"><span className="text-muted-foreground">Expected:</span> {r.expected}</p>
            <p className="mt-1"><span className="text-muted-foreground">Answered:</span> {r.answer || "(no answer)"}</p>
            <p className="mt-1 flex flex-wrap gap-3">
              <span className={r.correct ? "text-green-400" : "text-destructive"}>{r.correct ? "correct" : "incorrect"}</span>
              <span className={r.grounded ? "text-sky-400" : "text-amber-400"}>{r.grounded ? "grounded" : "not grounded"}</span>
              <span className="text-muted-foreground">{r.latencyMs} ms</span>
            </p>
            {r.reasoning && <p className="mt-1 text-muted-foreground">{r.reasoning}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function EvaluationSection() {
  const [cases, setCases] = useState<EvalCaseSummary[]>([]);
  const [runs, setRuns] = useState<EvalRunSummary[]>([]);
  const [providers, setProviders] = useState<ProviderName[]>([]);
  const [provider, setProvider] = useState<ProviderName | "">("");
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [c, r, p] = await Promise.all([
        apiCall<EvalCaseSummary[]>("/eval/cases"),
        apiCall<EvalRunSummary[]>("/eval/runs"),
        apiCall<ProviderName[]>("/providers/available"),
      ]);
      setCases(c);
      setRuns(r);
      setProviders(p);
      setProvider((current) => current || p[0] || "");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addCase(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiCall("/eval/cases", { method: "POST", json: { question, expected } });
      setQuestion("");
      setExpected("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function runEval() {
    if (!provider) return;
    setRunning(true);
    setError(null);
    try {
      await apiCall("/eval/run", { method: "POST", json: { provider } });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Write questions with the answer you expect. A run asks the assistant each one through the real pipeline, then has the model
        grade the reply for correctness and for being supported by the retrieved passages. Compare runs after changing a model, a
        prompt or a retrieval setting.
      </p>

      <form onSubmit={addCase} className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <input aria-label="Test question" placeholder="Question" value={question} onChange={(e) => setQuestion(e.target.value)} required className={inputClass} />
        <textarea aria-label="Expected answer" placeholder="Expected answer" rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} required className={inputClass} />
        <div><Button type="submit" size="sm">Add test question</Button></div>
      </form>

      {cases.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
          {cases.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">{c.question}</p>
                <p className="text-xs text-muted-foreground">{c.expected}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void apiCall(`/eval/cases/${c.id}`, { method: "DELETE" }).then(load)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Provider to evaluate" value={provider} onChange={(e) => setProvider(e.target.value as ProviderName)} className={`${inputClass} max-w-48`}>
          {providers.length === 0 && <option value="">No provider</option>}
          {providers.map((p) => (<option key={p} value={p}>{p}</option>))}
        </select>
        <Button onClick={() => void runEval()} disabled={running || cases.length === 0 || !provider}>
          {running ? "Running (this takes a minute)..." : `Run ${cases.length} test question${cases.length === 1 ? "" : "s"}`}
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2">{runs.map((run) => (<RunCard key={run.id} run={run} />))}</div>
    </div>
  );
}

export function QualityPanel() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">LLM usage</h3>
        <UsageSection />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Answer quality</h3>
        <EvaluationSection />
      </section>
    </div>
  );
}
