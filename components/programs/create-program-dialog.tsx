"use client";

import React, { Suspense, useState } from "react";
import { Rocket } from "lucide-react";
import { Button } from "../ui/button";
import { LaunchProgramStudio } from "./launch-program-studio";

export function CreateProgramDialog({
  organizationId,
  triggerLabel = "Launch Program Studio",
}: {
  organizationId: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <span className="inline-flex items-center gap-2">
          <Rocket className="size-4" />
          <span>{triggerLabel}</span>
        </span>
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Launch Program Studio"
          className="fixed inset-0 z-50 overflow-y-auto bg-[#F6F8FB]"
        >
          <Suspense
            fallback={
              <div className="min-h-screen bg-[#F6F8FB] p-6 text-sm text-[#667085]">
                Loading Launch Program Studio...
              </div>
            }
          >
            <LaunchProgramStudio
              organizationId={organizationId}
              organizationName="Northwind Cloud"
              existingPrograms={[]}
              canCreate={true}
              initialMode="studio"
              onCloseModal={() => setOpen(false)}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
