"use client";

import { useEffect, useState } from "react";
import type { FeatureKey, FeatureState } from "@slm/shared-types";
import { apiCall, errorMessage } from "@/lib/client";

export function FeaturesPanel() {
  const [features, setFeatures] = useState<FeatureState[]>([]);
  const [pending, setPending] = useState<FeatureKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiCall<FeatureState[]>("/features")
      .then(setFeatures)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function toggle(feature: FeatureState) {
    setPending(feature.key);
    setError(null);
    try {
      const updated = await apiCall<FeatureState>(`/features/${feature.key}`, {
        method: "PATCH",
        json: { enabled: !feature.enabled },
      });
      setFeatures((current) => current.map((f) => (f.key === updated.key ? updated : f)));
    } catch (err) {
      setError(`Could not update "${feature.label}": ${errorMessage(err)}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {features.map((feature) => (
          <li key={feature.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p id={`feature-${feature.key}`} className="text-sm font-medium">{feature.label}</p>
              <p className="text-xs text-muted-foreground">{feature.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={feature.enabled}
              aria-labelledby={`feature-${feature.key}`}
              disabled={pending === feature.key}
              onClick={() => void toggle(feature)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors disabled:opacity-50 ${feature.enabled ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`inline-block size-4 rounded-full bg-foreground transition-transform ${feature.enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
