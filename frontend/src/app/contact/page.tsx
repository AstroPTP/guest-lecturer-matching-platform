import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { InfoSection } from "@/components/info/InfoPage";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <InfoPage
      title="Contact"
      intro="The platform is run by the Centre for Change and Applied Ethics (CCAE), Faculty of Business and Law, Curtin University."
    >
      <InfoSection heading="Questions about the platform or guest lecturing">
        <p>Contact the CCAE team at Curtin University:</p>
        <address className="not-italic">
          Centre for Change and Applied Ethics
          <br />
          Faculty of Business and Law, Curtin University
          <br />
          Kent Street, Bentley WA 6102
        </address>
      </InfoSection>

      <InfoSection heading="Trouble signing in">
        <p>
          Use{" "}
          <Link href="/forgot_password" className="font-medium text-blue-700 underline">
            Forgot password
          </Link>{" "}
          on the sign-in page to reset your password with a code sent to your email.
        </p>
      </InfoSection>

      <InfoSection heading="Reporting a problem with another user">
        <p>Use the Report option in the app. A CCAE administrator reviews every report.</p>
      </InfoSection>

      <InfoSection heading="Your information">
        <p>
          How your information is used, and how to correct or delete it, is explained on the{" "}
          <Link href="/privacy" className="font-medium text-blue-700 underline">
            Privacy
          </Link>{" "}
          page.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
