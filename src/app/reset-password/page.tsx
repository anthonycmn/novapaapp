import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { Logo } from "@/components/brand/logo";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

/**
 * The landing page for a Supabase recovery link. All the work happens in the
 * client component — the token rides in the URL hash, which never reaches us.
 */
export default async function ResetPasswordPage() {
  const supabaseMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
  if (!supabaseMode) redirect("/login");

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
      <ResetPasswordForm />
    </main>
  );
}
