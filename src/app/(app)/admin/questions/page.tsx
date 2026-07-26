import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AnswerForm } from "./answer-form";

export const metadata = { title: "Question queue" };

/** Staff moderation queue (#7): open questions across all posts. */
export default async function QuestionQueuePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const provider = getProvider();
  const open = await provider.getOpenQuestions(user.id);
  const posts = await provider.getFeedForUser(user.id);
  const postTitles = new Map(posts.map((post) => [post.id, post.title ?? "Untitled post"]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Open questions</h1>
        {open.length > 0 && <Badge>{open.length}</Badge>}
      </div>

      {open.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Inbox zero — every family question has an answer. 🎉
          </CardContent>
        </Card>
      ) : (
        open.map((question) => (
          <Card key={question.id}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div>
                <p className="text-xs text-muted-foreground">
                  {question.askerName} · {formatEventTime(question.createdAt)} · on
                  &ldquo;{postTitles.get(question.postId)}&rdquo;
                </p>
                <p className="mt-1 font-medium">{question.question}</p>
              </div>
              <AnswerForm questionId={question.id} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
