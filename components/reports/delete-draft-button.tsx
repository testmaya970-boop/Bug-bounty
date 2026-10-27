"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { deleteReportDraftAction } from "../../actions/reports";

/** Deletes a draft (and its staged files) after a confirm; the list refreshes from the server. */
export function DeleteDraftButton({ draftId, title }: { draftId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!window.confirm(`Delete "${title}" and its attachments? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteReportDraftAction({ draftId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <Button type="button" variant="quiet" className="text-danger" pending={pending} onClick={remove} aria-label={`Delete draft ${title}`}>
        Delete
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
