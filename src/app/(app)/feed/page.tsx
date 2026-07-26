import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, Pin, Sparkles, Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { ExternalLinkButton } from "@/components/external-link-button";
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

  // "Photos of your child" pin above the feed (#6). Reads stored matches
  // only — matching itself runs in a background job.
  const matches = user.familyId
    ? await provider.getMatchesForFamily(user.id, user.familyId)
    : [];

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

      {matches.length > 0 && (
        <Card className="border-gold/50">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Sparkles aria-hidden className="size-5 text-gold" />
              <h2 className="font-semibold">
                {matches.length} new photo{matches.length === 1 ? "" : "s"} of your{" "}
                {matches.length === 1 ? "child" : "children"}
              </h2>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {matches.slice(0, 6).map(({ match, photo, studentName }) => (
                <a
                  key={match.id}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnailUrl}
                    alt={`Photo of ${studentName}`}
                    className="size-24 rounded-lg bg-muted object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
            <Link
              href="/photos"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              See all your photos
            </Link>
          </CardContent>
        </Card>
      )}

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
                <ExternalLinkButton href={post.linkUrl} variant="subtle">
                  {post.linkUrl}
                </ExternalLinkButton>
              )}

              {/* Show-week posts carry a ticket link — that's when families
                  are inviting relatives (#12). */}
              {post.category === "show_week" && (
                <ExternalLinkButton href={org.ticketsUrl} variant="outline" className="self-start">
                  <Ticket aria-hidden className="size-4" />
                  Get tickets
                </ExternalLinkButton>
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
