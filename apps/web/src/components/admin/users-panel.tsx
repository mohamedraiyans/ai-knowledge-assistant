"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AllowedEmailSummary, Role, UserSummary } from "@slm/shared-types";
import { Button } from "@/components/ui/button";
import { apiCall, errorMessage } from "@/lib/client";

const inputClass = "rounded-md border border-border bg-transparent px-2 py-1.5 text-sm";

export function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [invites, setInvites] = useState<AllowedEmailSummary[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [u, i] = await Promise.all([
        apiCall<UserSummary[]>("/users"),
        apiCall<AllowedEmailSummary[]>("/users/invites"),
      ]);
      setUsers(u);
      setInvites(i);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await apiCall("/users/invites", { method: "POST", json: { email, role } });
      setEmail("");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={invite} className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium">Invite someone</h3>
        <div className="flex flex-wrap gap-2">
          <input type="email" required aria-label="Email to invite" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} min-w-0 flex-1`} />
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </select>
          <Button type="submit">Invite</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          They sign in with the Google account that uses this email. Under General you can open sign-in to anyone instead.
        </p>
      </form>

      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Waiting to sign in</h3>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
            {invites.map((invite) => (
              <li key={invite.email} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{invite.email} <span className="text-muted-foreground">· {invite.role.toLowerCase()}</span></span>
                <Button variant="ghost" size="sm" onClick={() => void run(() => apiCall(`/users/invites/${encodeURIComponent(invite.email)}`, { method: "DELETE" }))}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Members</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Role for ${user.email}`}
                      value={user.role}
                      onChange={(e) => void run(() => apiCall(`/users/${user.id}/role`, { method: "PATCH", json: { role: e.target.value } }))}
                      className={`${inputClass} py-1`}
                    >
                      <option value="USER">User</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    {user.id === currentUserId ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => void run(() => apiCall(`/users/${user.id}`, { method: "DELETE" }))}>
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
