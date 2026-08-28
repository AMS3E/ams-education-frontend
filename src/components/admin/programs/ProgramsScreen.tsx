"use client";

// Data orchestration for the Programs list (TanStack Query over the
// /api/admin/programs BFF). Type/search filtering stays client-side in
// ProgramsView — the whole list is ~43 items.

import ProgramsView from "./ProgramsView";
import { usePrograms, useScreenRefresh, adminKeys } from "@/lib/admin/queries";

export default function ProgramsScreen() {
  const programs = usePrograms();
  const { refreshing, refresh } = useScreenRefresh("programs", [adminKeys.programs]);

  return (
    <ProgramsView
      programs={programs.data?.items ?? []}
      loading={programs.isPending}
      error={programs.isError}
      fetchedAt={programs.data?.fetchedAt}
      refreshing={refreshing}
      onRefresh={refresh}
    />
  );
}
