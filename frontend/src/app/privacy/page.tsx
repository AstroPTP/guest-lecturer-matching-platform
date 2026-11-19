import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { InfoSection } from "@/components/info/InfoPage";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      intro="What the platform collects, why it needs it, and the choices you have. The platform follows Curtin University's privacy policies and the Australian Privacy Act 1988."
    >
      <InfoSection heading="What we collect">
        <ul className="list-disc space-y-2 pl-6">
          <li>Your name and email address, from signing in.</li>
          <li>
            The profile you fill in: your role, organisation or unit, areas of expertise, availability and teaching
            preferences.
          </li>
          <li>The messages you send to people you are matched with.</li>
          <li>A record of sign-ins and of security-related actions, such as an administrator changing an account.</li>
        </ul>
      </InfoSection>

      <InfoSection heading="Why we use it">
        <p>
          Only to match guest lecturers with unit coordinators, to let matched people talk to each other, and to keep
          the platform secure. Your information is not sold and is not used for advertising.
        </p>
      </InfoSection>

      <InfoSection heading="Who can see it">
        <p>
          Other users see the profile details needed for matching. Your email address and phone number are not shown
          to other users; matched people talk through the platform&apos;s messages.
        </p>
        <p>
          CCAE administrators can see account details so they can manage accounts and act on reports. Every
          administrator action is recorded in an audit log.
        </p>
      </InfoSection>

      <InfoSection heading="How it is protected">
        <p>
          Sign-in is handled by Auth0, all traffic uses HTTPS, and every request is checked against the role of the
          account that sent it, so people can only reach what their role allows.
        </p>
      </InfoSection>

      <InfoSection heading="How long it is kept">
        <p>
          Your profile and personal details are kept only while your account is active. Messages are kept for no
          longer than 12 months.
        </p>
      </InfoSection>

      <InfoSection heading="Your choices">
        <ul className="list-disc space-y-2 pl-6">
          <li>See and correct your details at any time in My Profile and Settings.</li>
          <li>Change or withdraw the consents you gave when you set up your profile.</li>
          <li>Delete your account in Settings.</li>
        </ul>
        <p>
          Questions about your information can be sent to CCAE; see{" "}
          <Link href="/contact" className="font-medium text-blue-700 underline">
            Contact
          </Link>
          .
        </p>
      </InfoSection>
    </InfoPage>
  );
}
