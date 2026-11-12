"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { DocumentSummary, FaqEntry } from "@slm/shared-types";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const FAQ_POLL_MS = 30_000;

interface SidebarProps {
  documents: DocumentSummary[];
  onChanged: () => void;
  onAskQuestion: (question: string) => void;
  isAdmin: boolean;
  /** Whether the admin has the frequently-asked / recent lists switched on. */
  showQuestions: boolean;
}

export function Sidebar({ documents, onChanged, onAskQuestion, isAdmin, showQuestions }: SidebarProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<"documents" | "faq" | "recent">("documents");
  const [faq, setFaq] = useState<FaqEntry[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  // If an admin switches the lists off while this tab is open, fall back to documents.
  const activeTab = showQuestions ? tab : "documents";
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadFaq() {
    try {
      const [faqRes, recentRes] = await Promise.all([
        fetch(`${API_URL}/chat/faq`, { credentials: "include" }),
        fetch(`${API_URL}/chat/recent`, { credentials: "include" }),
      ]);
      if (faqRes.ok) setFaq(await faqRes.json());
      if (recentRes.ok) setRecent(await recentRes.json());
    } catch {
      // Background poll — ignore transient failures.
    }
  }

  useEffect(() => {
    loadFaq();
    const interval = setInterval(loadFaq, FAQ_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  async function handleDeleteFaq(question: string) {
    await fetch(`${API_URL}/chat/faq?question=${encodeURIComponent(question)}`, {
      method: "DELETE",
      credentials: "include",
    });
    loadFaq();
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(`${API_URL}/documents`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.message ?? `Failed to upload ${file.name}`);
        }
      } catch {
        // fetch only rejects when no HTTP response arrived at all: wrong origin (CORS),
        // API down, or the API process died mid-request.
        setError(
          `Could not reach the API at ${API_URL} while uploading ${file.name}. Check that it is running and that you opened the app at the origin set in WEB_ORIGIN.`,
        );
      }
    }

    setUploading(false);
    onChanged();
  }

  async function handleDelete(filename: string) {
    await fetch(`${API_URL}/documents/${encodeURIComponent(filename)}`, {
      method: "DELETE",
      credentials: "include",
    });
    onChanged();
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-border bg-background p-4">
      <div className="flex gap-1 rounded-md border border-border p-1 text-sm">
        <button
          onClick={() => setTab("documents")}
          className={`flex-1 rounded px-2 py-1 ${
            activeTab === "documents" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Documents
        </button>
        {showQuestions && (
          <>
            <button
              onClick={() => setTab("faq")}
              className={`flex-1 rounded px-2 py-1 ${
                activeTab === "faq" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Popular
            </button>
            <button
              onClick={() => setTab("recent")}
              className={`flex-1 rounded px-2 py-1 ${
                activeTab === "recent" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Recent
            </button>
          </>
        )}
      </div>

      {activeTab === "documents" && (
        <>
          <div
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragOver(false);
              void uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-6 text-center text-sm transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border text-muted-foreground"
            }`}
          >
            <span>{uploading ? "Uploading..." : "Drop files or click to upload"}</span>
            <span className="text-xs text-muted-foreground">.txt, .pdf, .docx</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf,.docx"
              multiple
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col gap-2 overflow-y-auto">
            {documents.length === 0 && (
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            )}
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm"
              >
                <a
                  href={`${API_URL}/documents/${encodeURIComponent(doc.filename)}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                  title={doc.filename}
                >
                  {doc.filename}
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(doc.filename)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === "recent" && (
        <div className="flex flex-col gap-2 overflow-y-auto">
          {recent.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing asked yet. The latest questions will show up here, and answered ones reply instantly.
            </p>
          )}
          {recent.map((question) => (
            <button
              key={question}
              onClick={() => onAskQuestion(question)}
              className="truncate rounded-lg border border-border p-2 text-left text-sm hover:bg-muted"
              title="Click to ask this question"
            >
              {question}
            </button>
          ))}
        </div>
      )}

      {activeTab === "faq" && (
        <div className="flex flex-col gap-2 overflow-y-auto">
          {faq.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No questions asked yet — frequently asked questions will show up here as people chat.
            </p>
          )}
          {faq.map((entry) => (
            <div
              key={entry.question}
              className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm"
            >
              <button
                onClick={() => onAskQuestion(entry.question)}
                className="min-w-0 flex-1 truncate text-left hover:bg-muted"
                title="Click to ask this question"
              >
                {entry.question}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">×{entry.count}</span>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => void handleDeleteFaq(entry.question)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
