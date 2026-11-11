"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FeaturesPanel } from "./features-panel";
import { ProvidersPanel } from "./providers-panel";
import { QualityPanel } from "./quality-panel";
import { SettingsForm } from "./settings-form";
import { UsersPanel } from "./users-panel";

const TABS = [
  { id: "general", label: "General", blurb: "Name, colour and who may sign in." },
  { id: "models", label: "Models & prompt", blurb: "API keys, which model answers, and how it is told to behave." },
  { id: "knowledge", label: "Knowledge", blurb: "How documents are split, searched and connected." },
  { id: "features", label: "Features", blurb: "Switch parts of the app on or off for everyone." },
  { id: "users", label: "Users", blurb: "Invite people and choose their role." },
  { id: "quality", label: "Usage & quality", blurb: "What the model is doing, and how good its answers are." },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(value: string): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export function AdminShell({ appName, currentUserId }: { appName: string; currentUserId: string }) {
  const [tab, setTab] = useState<TabId>("general");

  // The tab lives in the URL hash so a link such as /admin#models opens that tab.
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (isTabId(hash)) setTab(hash);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">{appName} · Admin</h1>
        <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/" />}>
          Back to the app
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
        <nav aria-label="Admin sections" className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </a>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight">{current.label}</h2>
            <p className="text-sm text-muted-foreground">{current.blurb}</p>
          </div>

          {tab === "general" && <SettingsForm groups={["branding", "auth"]} />}
          {tab === "models" && (
            <div className="flex flex-col gap-10">
              <ProvidersPanel />
              <div className="flex flex-col gap-4 border-t border-border pt-6">
                <h3 className="text-sm font-medium">Prompt and answer settings</h3>
                <SettingsForm groups={["chat"]} />
              </div>
            </div>
          )}
          {tab === "knowledge" && <SettingsForm groups={["retrieval", "graph", "cache"]} />}
          {tab === "features" && <FeaturesPanel />}
          {tab === "users" && <UsersPanel currentUserId={currentUserId} />}
          {tab === "quality" && <QualityPanel />}
        </main>
      </div>
    </div>
  );
}
