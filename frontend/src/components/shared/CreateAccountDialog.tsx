import Link from "next/link";

interface CreateAccountDialogProps {
  registerHref: string;
}

export default function CreateAccountDialog({ registerHref }: CreateAccountDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
        <h2 className="mb-3 text-2xl font-bold text-gray-900">No account found</h2>
        <p className="mb-6 text-gray-600">
          We couldn&apos;t find an account for this login. Would you like to create one?
        </p>
        <Link
          href={registerHref}
          className="block w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}
