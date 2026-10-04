"use client";

// Generic error boundary: never renders error details (which could include internals).
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-slate-600">Unable to process the request.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Try again
      </button>
    </main>
  );
}
