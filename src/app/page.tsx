import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { homePath } from "@/lib/permissions";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <GoHome />
    </Suspense>
  );
}

/** Lands each user on the first page they are allowed to see. */
async function GoHome(): Promise<null> {
  const user = await requireUser();
  redirect(homePath(user));
}
