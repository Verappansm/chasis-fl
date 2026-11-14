import Link from "next/link";

export function NotFoundPanel() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-indigo-600">404</p>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Page or record not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        The link may be mistyped, or the record may have been deleted. Deletions are listed in the activity log.
      </p>
      <Link href="/" className="mt-6 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
        Go to start
      </Link>
    </div>
  );
}
