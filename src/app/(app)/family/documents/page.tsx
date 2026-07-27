import { redirect } from "next/navigation";
import { FileText, Lock } from "lucide-react";
import { getProvider } from "@/lib/api";
import { DOCUMENT_CATEGORIES } from "@/lib/api/documents/types";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { DeleteDocumentButton, DocumentUploadForm } from "./document-forms";

export const metadata = { title: "Documents" };

/** Household document vault (#3): waivers, forms, receipts. */
export default async function DocumentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const provider = getProvider();
  const [documents, students] = await Promise.all([
    provider.getFamilyDocuments(user.id, user.familyId),
    provider.getStudentsForFamily(user.id, user.familyId),
  ]);

  const categoryLabel = new Map(
    DOCUMENT_CATEGORIES.map((category) => [category.value, category.label])
  );
  const studentName = new Map(
    students.map((student) => [student.id, student.preferredName ?? student.firstName])
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Document vault</h1>
        <p className="text-muted-foreground">
          Waivers, forms, and receipts, kept in one place. Private to your
          family and NOVA PA staff.
        </p>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden className="size-8" />}
          title="Nothing filed yet"
          description="Upload signed waivers, school forms, or anything you want to keep handy."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((document) => (
            <li key={document.id}>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <FileText aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={document.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {document.name}
                    </a>
                    <p className="truncate text-sm text-muted-foreground">
                      {categoryLabel.get(document.category)}
                      {document.studentId && ` · ${studentName.get(document.studentId) ?? ""}`}
                      {" · "}
                      {(document.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                      {formatDate(document.uploadedAt)}
                    </p>
                  </div>
                  {document.uploadedByStaff && (
                    <Badge variant="secondary" className="shrink-0">
                      <Lock aria-hidden className="mr-1 size-3" />
                      From NOVA PA
                    </Badge>
                  )}
                  <DeleteDocumentButton
                    documentId={document.id}
                    name={document.name}
                    disabled={document.uploadedByStaff}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-base">
            Add a document
          </CardTitle>
          <CardDescription>PDF or photo, up to 20 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUploadForm familyId={user.familyId} students={students} />
        </CardContent>
      </Card>
    </div>
  );
}
