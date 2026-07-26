import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, Pin } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Reactions } from "./reactions";
import { QuestionBox } from "./question-box";

export const metadata = { title: "News" };

const CATEGORY_LABELS: Record<string, string> = {
  casting: "Casting",
  rehearsal: "Rehearsal",
  fundraising: "Fundraising",
  show_week: "Show Week",
  celebration: "Celebration",
  general: "News",
};

/** One-way community feed (#7): staff post, families react + ask privately. */
export default async function FeedPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const provider = getProvider();
  const isStaff = hasRoleAtLeast(user, "staff");

  const posts = await provider.getFeedForUser(user.id);
  const questionsByPost = new Map(
    await Promise.all(
      posts.map(
        async (post) =>
          [post.id, await provider.getQuestionsForPost(user.id, post.id)] as const
      )
    )
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">News</h1>
        {isStaff && (
          <Link
            href="/feed/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            New post
          </Link>
        )}
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Megaphone aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">No announcements yet</p>
            <p className="text-sm text-muted-foreground">
              Casting news, rehearsal updates, and show-week info will land here.
            </p>
          </CardContent>
        </Card>
      ) : (
        posts.map((post) => (
          <Card key={post.id} className={post.isPinned ? "border-gold/50" : undefined}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    {post.isPinned && (
                      <Pin aria-label="Pinned" className="size-3.5 text-gold" />
                    )}
                    <Badge variant="secondary">
                      {CATEGORY_LABELS[post.category] ?? post.category}
                    </Badge>
                  </div>
                  {post.title && <h2 className="text-lg font-semibold">{post.title}</h2>}
                  <p className="text-xs text-muted-foreground">
                    {post.authorName} · {formatEventTime(post.publishedAt)}
                  </p>
                </div>
              </div>

              <p className="whitespace-pre-line text-sm leading-relaxed">{post.body}</p>

              {post.linkUrl && (
                <a
                  href={post.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {post.linkUrl}
                </a>
              )}

              <Reactions postId={post.id} counts={post.reactionCounts} />

              <QuestionBox
                postId={post.id}
                questions={questionsByPost.get(post.id) ?? []}
                currentUserId={user.id}
                isStaff={isStaff}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
