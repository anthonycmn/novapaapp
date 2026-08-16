import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { getProvider } from "@/lib/api";
import type { FeedPost } from "@/lib/api/types";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { FeedPostCard } from "@/components/feed/post-card";

/**
 * The show's own live feed, on the show's own page.
 *
 * Same posts, same reaction buttons and the same question thread as the News
 * page — it renders FeedPostCard rather than a second copy, so the rules
 * cannot drift. A question stays private between the family who asked and
 * staff until staff choose to publish the answer; that is enforced by RLS on
 * post_questions, not by this component.
 *
 * Scoped by the post's audience: a post tagged with this production, or a
 * post tagged with nothing (which means everyone, and a show-week
 * announcement to the whole org belongs on the show page too).
 */
export async function ShowFeed({
  productionId,
  productionTitle,
  userId,
  isStaff,
  limit = 5,
}: {
  productionId: string;
  productionTitle: string;
  userId: string;
  isStaff: boolean;
  limit?: number;
}) {
  const provider = getProvider();
  const all = await provider.getFeedForUser(userId);

  const forThisShow = all.filter((post: FeedPost) => {
    const ids = post.audience?.productionIds ?? [];
    return ids.length === 0 || ids.includes(productionId);
  });
  const posts = forThisShow.slice(0, limit);

  const questionsByPost = new Map(
    await Promise.all(
      posts.map(
        async (post) =>
          [post.id, await provider.getQuestionsForPost(userId, post.id)] as const
      )
    )
  );

  return (
    <Card pad={false}>
      <SectionHeader
        title="Live updates"
        inCard
        right={
          <div className="flex items-center gap-3">
            {isStaff && (
              <Link
                href="/feed/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                New post
              </Link>
            )}
            <Link
              href="/feed"
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              All news <ArrowRight aria-hidden size={13} />
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-3 p-4">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Megaphone aria-hidden className="size-7 text-muted-foreground" />
            <p className="text-[13px] font-medium">Nothing posted yet</p>
            <p className="max-w-sm text-[12.5px] text-muted-foreground">
              Rehearsal notes, casting news and show-week details for{" "}
              {productionTitle} will appear here. You can react to a post, or ask
              a question only staff can see.
            </p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                questions={questionsByPost.get(post.id) ?? []}
                currentUserId={userId}
                isStaff={isStaff}
              />
            ))}
            <p className="text-center text-[11.5px] text-muted-foreground">
              Questions you ask here are private — only staff see them, unless
              they publish the answer for everyone.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
