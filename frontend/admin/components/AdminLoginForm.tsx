"use client";

export function AdminLoginForm() {
  function handleSignIn() {
    window.location.href = "/auth/login?returnTo=/dashboard";
  }

  return (
    <div className="admin-login-form">
      <p className="login-description">
        Sign in with your CCAE administrator account to access the admin portal.
      </p>
      <button className="signin-button" type="button" onClick={handleSignIn}>
        Sign in to admin portal
      </button>
    </div>
  );
}