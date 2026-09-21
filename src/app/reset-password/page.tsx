import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/lib/auth/session";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

/**
 * The landing page for a Supabase recovery link. Almost all the work happens
 * in the client component: the token rides in the URL hash, which never
 * reaches us.
 *
 * The one thing only the server can answer is whether this browser already
 * holds a session, because that lives in our own signed cookie and not in the
 * throwaway Supabase client below. A spent link plus a session means the reset
 * already worked; see spentLinkPlan in lib/auth/reset-link.
 *
 * Note what is NOT done here: a signed-in visitor is not redirected away the
 * way /login redirects them. They may be signed in and still want to set a new
 * password, and the link in their hand may be perfectly good. Only a link that
 * cannot be spent changes its ending.
 */
export default async function ResetPasswordPage() {
  const supabaseMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
  if (!supabaseMode) redirect("/login");
  const signedIn = Boolean(await getSessionUser());

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center text-center">
        <Logo size={88} standalone />
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-wide sm:text-3xl">
          {org.appName}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {org.programBrand} · schedules, photos, forms &amp; news
        </p>
      </div>
      <ResetPasswordForm signedIn={signedIn} />
    </main>
  );
}
