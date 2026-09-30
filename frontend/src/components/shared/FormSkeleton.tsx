/**
 * Placeholder in the shape of a setup wizard step, shown while its saved
 * draft loads, so the page appears straight away instead of as a blank line
 * of text.
 */
export default function FormSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse" aria-busy="true" aria-label="Loading your details">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="h-[3px] w-56 rounded bg-gray-200" />
      </div>
      <div className="mb-12 flex flex-col items-center gap-4">
        <div className="h-12 w-2/3 max-w-xl rounded-lg bg-gray-200" />
        <div className="h-4 w-3/4 max-w-3xl rounded bg-gray-200" />
        <div className="h-4 w-1/2 max-w-2xl rounded bg-gray-200" />
      </div>
      <div className="space-y-6">
        <div className="h-40 rounded-3xl bg-white/70" />
        <div className="h-56 rounded-3xl bg-white/70" />
      </div>
    </div>
  );
}
