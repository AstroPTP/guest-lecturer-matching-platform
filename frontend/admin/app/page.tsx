import Image from "next/image";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import infoIcon from "@/assets/info.png";
import schoolIcon from "@/assets/school.png";
import verifiedUserIcon from "@/assets/verified_user.png";

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
        <div className="university-brand">
          <Image alt="" aria-hidden="true" src={schoolIcon} />
          <span>Curtin University</span>
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

        <footer>© 2026 Global Learning Management. All rights reserved.</footer>
      </section>

      <section className="login-form-panel">
        <div className="mobile-university-brand university-brand">
          <Image alt="" aria-hidden="true" src={schoolIcon} />
          <span>Curtin University</span>
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
