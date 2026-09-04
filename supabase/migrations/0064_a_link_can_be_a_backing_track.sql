-- A link can be a backing track rather than a performance.
--
-- CJ, 4 Sep 2026: "Under the video link for song submission put a check box -
-- my child will be auditioning in person and the link above is the link to
-- their audition kareoke song."
--
-- WHY THIS NEEDS A COLUMN AND NOT A SENTENCE IN NOTES. The panel opens that
-- link expecting to watch a child sing. If it is an instrumental and nothing
-- says so, the natural reading is "they sent the wrong file", and an audition
-- gets marked incomplete for a family that did exactly what was asked. One
-- boolean beside the URL removes that entire class of misunderstanding, and
-- does it where the person clicking the link is already looking.
--
-- THE WORDING ON THE FORM IS NOT THE DICTATED SENTENCE, deliberately. The
-- original packs two facts into one clause and misspells karaoke. What a parent
-- is actually saying by ticking it is: this is the backing track, and my child
-- will sing to it in the room. The label says that.
--
-- Defaults false: every profile written before today was a self-tape or
-- nothing, and neither of those is a backing track.
--
-- Additive. Safe to re-run.
set search_path = family_hub, public;

alter table family_hub.audition_profiles
  add column if not exists in_person_with_backing_track boolean not null default false;

comment on column family_hub.audition_profiles.in_person_with_backing_track is
  'The family ticked "auditioning in person, and the link is their karaoke '
  'backing track". Tells the panel that audition_video_url is an instrumental '
  'to sing along to rather than a recording of the child. Hub 0064.';
