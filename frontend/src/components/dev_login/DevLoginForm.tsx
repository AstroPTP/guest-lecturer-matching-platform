"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authenticateAccount } from "@/services/auth/authService";
import { useCurrentUser } from "@/components/auth/SessionProvider";
import { roleLabel } from "@/services/auth/roleMapper";
import { isAppRole } from "@/services/auth/roleMapper";

/**
 * Deliberately built from the same markup and Tailwind classes as
 * components/login/LoginForm.tsx, so a demo of this looks like the product
 * rather than a debug page. The password field is replaced by an account
 * picker, because the dev identity provider does not check passwords.
 *
 * The amber banner is not decoration. Anyone looking at a screenshot should be
 * able to tell instantly that this is not the real login.
 */

interface DevUser {
  email: string;
  name: string;
  roles: string[];
}

export default function DevLoginForm() {
  const router = useRouter();
  const { refresh } = useCurrentUser();

  const [users, setUsers] = useState<DevUser[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/dev-users")
      .then((response) => (response.ok ? response.json() : []))
      .then((list: DevUser[]) => {
        setUsers(list);
        setEmail((current) => current || list[0]?.email || "");
      })
      .catch(() =>
        setError(
          "Could not reach the dev identity provider. Run: node tools/dev-idp/server.js",
        ),
      );
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const result = await authenticateAccount(email, "");
    setBusy(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    // The provider holds the session; make sure the UI has read it before we
    // navigate, or the destination renders as signed-out.
    await refresh();

    if (result.account.role === "admin") {
      router.push("/unit_coordinator/profile");
      return;
    }
    router.push(
      result.account.role === "coordinator"
        ? "/unit_coordinator/profile"
        : "/guest_lecturer/profile",
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 px-4 ">
      <div className="bg-white w-full max-w-lg rounded-2xl border border-blue-100 shadow-xl shadow-blue-900/10 p-10">
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">Development sign-in.</strong> Issues a real
          signed token from the local test identity provider without checking a
          password. Not reachable in a deployed build.
        </div>

        <h1 className="text-5xl font-bold mb-4">Welcome</h1>
        <p className="text-gray-600 mb-10">Choose a test account to continue.</p>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <select
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            {users.length === 0 && <option value="">Loading accounts…</option>}
            {users.map((user) => (
              <option key={user.email} value={user.email}>
                {user.name} — {user.roles.filter(isAppRole).map(roleLabel).join(", ") || "no roles"}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={busy || !email}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Log in"}
          </button>

          {error && <p className="text-center text-sm text-red-600">{error}</p>}
        </form>

        <p className="text-center mt-10 text-sm">
          <Link href="/login" className="font-medium text-blue-600 underline hover:text-blue-700">
            Back to the real login
          </Link>
        </p>
      </div>
    </main>
  );
}
