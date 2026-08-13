import Image from "next/image";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import infoIcon from "@/assets/info.png";
import schoolIcon from "@/assets/school.png";
import verifiedUserIcon from "@/assets/verified_user.png";

export default function Home() {
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
            <p>This system is restricted to authorized Global Learning Management administrators. Unauthorized access attempts will be blocked and reported.</p>
            <small>
              <Image alt="" aria-hidden="true" src={verifiedUserIcon} />
              All administrative actions are logged and audited.
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
