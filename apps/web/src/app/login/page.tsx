import { redirect } from "next/navigation";
import { API_URL } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { ApiUnavailable } from "@/components/api-unavailable";
import { Button } from "@/components/ui/button";

const ERRORS: Record<string, string> = {
  not_invited:
    "That Google account has not been invited. Ask an admin to add your email, then try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  // A sign-in button that points at a dead api would just fail on click.
  if (session.status === "api-unavailable") return <ApiUnavailable />;
  if (session.status === "signed-in") redirect("/");

  const [{ appName, tagline }, { error }] = await Promise.all([getBranding(), searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 font-sans">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border bg-card/60 px-8 py-10 text-center shadow-2xl shadow-black/40 backdrop-blur-md sm:px-12 sm:py-14">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{appName}</h1>
          <p className="text-sm text-muted-foreground">{tagline}</p>
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ERRORS[error] ?? "Sign-in failed. Please try again."}
          </p>
        )}
        <Button nativeButton={false} render={<a href={`${API_URL}/auth/google`} />}>
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}
