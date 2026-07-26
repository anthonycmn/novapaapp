import Link from "next/link";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const productions = await getProvider().getProductions();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Staff tools</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/email">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base">📧 Email families</CardTitle>
              <CardDescription>Templates, targeting, send history</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/admin/questions">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base">💬 Question queue</CardTitle>
              <CardDescription>Answer private questions from families</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pre-casting review</CardTitle>
          <CardDescription>
            Read family hopes and audition materials before casting a show.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          {productions.map((production) => (
            <Link
              key={production.id}
              href={`/admin/casting-review/${production.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {production.title}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
