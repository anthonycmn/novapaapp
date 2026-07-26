/**
 * Seeds a real Supabase project with the same demo data the mock adapter
 * uses (src/lib/api/mock/seed-data.ts). Run after `supabase db push`:
 *
 *   npm run seed
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 * (NEEDS-FROM-TONY.md #1). Safe to re-run: upserts by natural keys.
 */
import { createClient } from "@supabase/supabase-js";
import * as seed from "../src/lib/api/mock/seed-data";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "The app runs fine in mock mode without them (NEXT_PUBLIC_DATA_MODE=mock).\n" +
        "See NEEDS-FROM-TONY.md #1 to set up the Supabase project."
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  console.log("Seeding families…");
  const { error: famError } = await supabase.from("families").upsert(
    seed.families.map((f) => ({
      id: f.id,
      name: f.name,
      address_line1: f.addressLine1,
      address_line2: f.addressLine2 ?? null,
      city: f.city,
      state: f.state,
      zip: f.zip,
      preferred_contact_method: f.preferredContactMethod,
      communication_language: f.communicationLanguage,
      staff_notes: f.staffNotes ?? null,
      emergency_contacts: f.emergencyContacts,
      authorized_pickups: f.authorizedPickups,
    }))
  );
  if (famError) throw famError;

  console.log("Seeding students…");
  const { error: stuError } = await supabase.from("students").upsert(
    seed.students.map((s) => ({
      id: s.id,
      family_id: s.familyId,
      first_name: s.firstName,
      last_name: s.lastName,
      preferred_name: s.preferredName ?? null,
      pronouns: s.pronouns ?? null,
      date_of_birth: s.dateOfBirth,
      grade: s.grade,
      school: s.school ?? null,
      tshirt_size: s.tshirtSize ?? null,
      allergies: s.allergies ?? null,
      medical_flags: s.medicalFlags ?? null,
      resume_credits: s.resumeCredits,
      vocal_range: s.vocalRange ?? null,
      audition_song_url: s.auditionSongUrl ?? null,
      consent_photo_use: s.consents.photoUse,
      consent_face_matching: s.consents.faceMatching,
      consent_directory_visible: s.consents.directoryVisible,
      has_login: s.hasLogin,
    }))
  );
  if (stuError) throw stuError;

  console.log("Seeding guardians…");
  const { error: gError } = await supabase.from("guardians").upsert(
    seed.guardians.map((g) => ({
      id: g.id,
      family_id: g.familyId,
      user_id: null, // linked when real auth users are created
      full_name: g.fullName,
      email: g.email,
      phone: g.phone,
      relationship: g.relationship,
      is_primary: g.isPrimary,
    }))
  );
  if (gError) throw gError;

  console.log("Done. Note: auth users must be invited via the Supabase");
  console.log("dashboard or magic-link sign-in; profile rows link on first login.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
