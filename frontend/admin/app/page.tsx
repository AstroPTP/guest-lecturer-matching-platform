import type { Metadata } from "next";
import Image from "next/image";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import BrandLogo, { BRAND_NAME } from "@/components/brand/BrandLogo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import infoIcon from "@/assets/info.png";
import verifiedUserIcon from "@/assets/verified_user.png";

// The root layout's title template does not apply to a page in its own
// segment, so the full title is written out here.
export const metadata: Metadata = { title: `${BRAND_NAME} | Admin sign in` };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  // Set by the middleware when a signed-in account without the administrator
  // role tries to open the dashboard.
  const { denied } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-intro-head">
          <div className="login-brand">
            <BrandLogo variant="full" size={64} />
          </div>
          <ThemeToggle />
        </div>

        <div className="login-intro-content">
          <h1>
            CCAE Platform
            <br />
            Administration
          </h1>
          <div className="security-notice">
            <p>This system is restricted to CCAE administrators. Every request is checked against the account&apos;s role, and other accounts are refused.</p>
            <small>
              <Image alt="" aria-hidden="true" src={verifiedUserIcon} />
              Sessions are kept in an encrypted, HTTP-only cookie and expire automatically.
            </small>
          </div>
        </div>

        <footer>© 2026 Curtin GLMP. All rights reserved.</footer>
      </section>

      <section className="login-form-panel">
        <div className="mobile-login-brand">
          <BrandLogo variant="compact" size={36} />
        </div>
        <div className="login-form-wrap">
          <h2>Administrator sign in</h2>
          {denied === "administrator-only" && (
            <p className="access-denied" role="alert">
              That account is not an administrator, so the dashboard is not
              available to it.
            </p>
          )}
          <AdminLoginForm />
          <div className="signin-support">
            <Image alt="" aria-hidden="true" src={infoIcon} />
            <p>
              Having trouble signing in? Contact the <a href="mailto:itservicedesk@curtin.edu.au">IT Service Desk</a> or your technical account manager for
              assistance.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
