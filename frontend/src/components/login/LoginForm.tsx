"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import BrandLogo from "@/components/brand/BrandLogo";
import visibility from "@/assets/visibility.png";
import visibility_off from "@/assets/visibility_off.png";
import { releaseDeviceIfSignedOut } from "@/lib/push/signOutCleanup";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const searchParams = useSearchParams();

  // Arriving here with no session, whether sent by the server or after
  // signing out, means this device should no longer receive the previous
  // person's notifications. Sign-outs that run in the page do this themselves
  // first; this covers the ones that only redirect.
  useEffect(() => {
    void releaseDeviceIfSignedOut();
  }, []);

  // The browser can bring this page back from its back/forward cache with the
  // email and password still typed in. Empty the form when that happens.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setEmail("");
        setPassword("");
        setError(null);
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);
  const role = searchParams.get("role") === "coordinator"  ? "coordinator" : "guest";
  // The start page sends a user who has finished the setup wizard to the
  // dashboard, and everyone else to Basic information.
  const fallbackReturnTo = role === "coordinator" ? "/unit_coordinator/start" : "/guest_lecturer/start";

  // The middleware sends signed-out visitors here with ?redirectTo=. Only a
  // path inside one of the two dashboards is honoured, so the parameter cannot
  // be used to bounce a user to another site after signing in.
  const requestedReturnTo = searchParams.get("redirectTo");
  const returnTo =
    requestedReturnTo &&
    /^\/(guest_lecturer|unit_coordinator)(\/|\?|$)/.test(requestedReturnTo) &&
    !/[\\\x00-\x20]/.test(requestedReturnTo)
      ? requestedReturnTo
      : fallbackReturnTo;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);
    setIsChecking(true);
    try {
      const status = await fetch("/api/auth/account-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!status.ok) {
        const body = await status.json().catch(() => null);
        throw new Error(body?.error || "We couldn't check your account. Please try again.");
      }
      const result = (await status.json()) as { exists: boolean };
      if (!result.exists) {
        setError("The account does not exist. Please register first.");
        return;
      }

      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      if (!login.ok) {
        const body = await login.json().catch(() => null);
        throw new Error(body?.error || "We couldn't sign you in right now. Please try again.");
      }

      // A full navigation, so the new session cookie is what the route gate sees.
      // It replaces this page in the history, so Back never returns to a login
      // form with the credentials still filled in.
      window.location.replace(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't sign you in right now. Please try again.");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 px-4 ">
      <div className="bg-white w-full max-w-lg rounded-2xl border border-blue-100 shadow-xl shadow-blue-900/10 p-10">
        <div className="mb-8 flex justify-center">
          <BrandLogo variant="full" size={60} />
        </div>
        <h1 className="text-5xl font-bold mb-4">Welcome</h1>
        <p className="text-gray-600 mb-10">Sign in to continue your academic journey.</p>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email address"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 pr-12 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2">
              <Image src={showPassword ? visibility : visibility_off} alt="Toggle password" width={22} height={22} />
            </button>
          </div>
          <div>
            <Link href="/forgot_password" className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
              Forgot password?
            </Link>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isChecking}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isChecking ? "Signing in…" : "Log in"}
          </button>
        </form>

        <p className="text-center mt-10 text-sm text-gray-600">
          Don&apos;t have an account? Register as{" "}
          <Link href="/register?role=guest" className="font-medium text-blue-600 underline hover:text-blue-700">
            Guest Lecturer
          </Link>{" "}
          or{" "}
          <Link href="/register?role=coordinator" className="font-medium text-blue-600 underline hover:text-blue-700">
            Unit Coordinator
          </Link>
        </p>
      </div>
    </main>
  );
}
