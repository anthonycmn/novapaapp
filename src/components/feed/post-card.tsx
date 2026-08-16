import { Pin, Ticket } from "lucide-react";
import { org } from "@/config/org";
import type { FeedPost, PostQuestion } from "@/lib/api/types";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLinkButton } from "@/components/external-link-button";
import { Reactions } from "@/app/(app)/feed/reactions";
import { QuestionBox } from "@/app/(app)/feed/question-box";

export const CATEGORY_LABELS: Record<string, string> = {
  casting: "Casting",
  rehearsal: "Rehearsal",
  fundraising: "Fundraising",
  show_week: "Show Week",
  celebration: "Celebration",
  general: "News",
};

/**
 * One post, with its reactions and its question thread.
 *
 * Extracted from the News page so a production page can render the same feed
 * without a second implementation (Tony, 16 Aug 2026: the show page and the
 * staff portal's show page should be identical). One component means the
 * question rules — private to the asker and staff until staff publish the
 * answer — cannot drift between the two places they appear.
 */
export function FeedPostCard({
  post,
  questions,
  currentUserId,
  isStaff,
}: {
  post: FeedPost;
  questions: PostQuestion[];
  currentUserId: string;
  isStaff: boolean;
}) {
  return (
    <Card className={post.isPinned ? "border-gold/50" : undefined}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {post.isPinned && <Pin aria-label="Pinned" className="size-3.5 text-gold" />}
            <Badge variant="secondary">
              {CATEGORY_LABELS[post.category] ?? post.category}
            </Badge>
          </div>
          {post.title && <h3 className="text-[15px] font-semibold">{post.title}</h3>}
          <p className="text-[11.5px] text-muted-foreground">
            {post.authorName} · {formatEventTime(post.publishedAt)}
          </p>
        </div>

        <p className="whitespace-pre-line text-[13px] leading-relaxed">{post.body}</p>

        {post.linkUrl && (
          <ExternalLinkButton href={post.linkUrl} variant="subtle">
            {post.linkUrl}
          </ExternalLinkButton>
        )}

        {/* Show-week posts carry a ticket link — that's when families are
            inviting relatives. */}
        {post.category === "show_week" && (
          <ExternalLinkButton href={org.ticketsUrl} variant="outline" className="self-start">
            <Ticket aria-hidden className="size-4" />
            Get tickets
          </ExternalLinkButton>
        )}

        <Reactions postId={post.id} counts={post.reactionCounts} />

        <QuestionBox
          postId={post.id}
          questions={questions}
          currentUserId={currentUserId}
          isStaff={isStaff}
        />
      </CardContent>
    </Card>
  );
}
