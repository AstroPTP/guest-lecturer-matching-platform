"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import visibilityIcon from "@/assets/visibility.png";
import visibilityOffIcon from "@/assets/visibility_off.png";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setError("Enter your administrator email and password.");
      return;
    }

    // UI-only handoff. Replace with a secure admin session API before release.
    router.push("/dashboard");
  }

  return (
    <form className="admin-login-form" onSubmit={handleSubmit}>
      <div className="login-field">
        <label htmlFor="email">Email address</label>
        <input autoComplete="username" id="email" name="email" placeholder="admin@ccae.curtin.edu.au" required type="email" />
      </div>
      <div className="login-field">
        <label htmlFor="password">Password</label>
        <div className="password-input-wrap">
          <input
            autoComplete="current-password"
            id="password"
            name="password"
            placeholder="Enter your password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="password-toggle"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            <Image alt="" aria-hidden="true" src={showPassword ? visibilityIcon : visibilityOffIcon} />
          </button>
        </div>
      </div>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <button className="signin-button" type="submit">
        Sign in to admin portal
      </button>
    </form>
  );
}
