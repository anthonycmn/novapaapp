import { Image as ImageIcon } from "lucide-react";
import { org } from "@/config/org";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Photos" };

/** Phase 6 replaces this with SmugMug galleries + AI photo matching (#6). */
export default function PhotosPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Photos</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <ImageIcon aria-hidden className="size-8 text-muted-foreground" />
          <p className="font-medium">No galleries yet</p>
          <p className="text-sm text-muted-foreground">
            Show and rehearsal photos will appear here. With photo matching
            turned on, pictures of your child get pinned to the top.
          </p>
          <a
            href={org.smugmugUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Browse past galleries on SmugMug
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
