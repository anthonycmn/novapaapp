import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PostForm } from "./post-form";

export const metadata = { title: "New post" };

export default async function NewPostPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/feed");

  const productions = await getProvider().getProductions();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New announcement</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Post to the family feed</CardTitle>
          <CardDescription>
            Families can react and ask private questions; they can&apos;t comment
            publicly. Target a single production or everyone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PostForm productions={productions} />
        </CardContent>
      </Card>
    </div>
  );
}
