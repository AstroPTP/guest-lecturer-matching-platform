import type { Metadata } from "next";
import InfoPage, { InfoSection } from "@/components/info/InfoPage";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms of use"
      intro="By creating an account you agree to these terms. They are the same terms you accept when you set up your profile."
    >
      <InfoSection heading="1. Purpose of the platform">
        <p>
          The platform is operated by CCAE, Faculty of Business and Law, to connect unit coordinators with guest
          lecturers for guest lectures, panels, workshops and related teaching activities.
        </p>
      </InfoSection>

      <InfoSection heading="2. Use of information">
        <p>
          Information you give in your profile or a request, including expertise, availability, unit details and
          session needs, may be shown to prospective matches for matching purposes only.
        </p>
      </InfoSection>

      <InfoSection heading="3. No guarantee of a match">
        <p>
          Registering or posting a request does not guarantee a speaking engagement or a suitable guest lecturer. CCAE
          will make reasonable efforts to help a match happen within the requested timeframe.
        </p>
      </InfoSection>

      <InfoSection heading="4. Recording and reuse">
        <p>
          Where a session is recorded, its use is governed by the recording consent the guest lecturer gives
          separately. Unit coordinators agree to use recordings only within that agreed scope.
        </p>
      </InfoSection>

      <InfoSection heading="5. Respectful use">
        <p>
          Use the platform and its messages only to arrange teaching, and treat everyone with respect. Anyone can report
          a user. CCAE administrators review every report and may deactivate an account.
        </p>
      </InfoSection>

      <InfoSection heading="6. Data retention">
        <p>
          Your data is kept while your account is active and may be deleted at your request, subject to the
          university&apos;s record-keeping obligations.
        </p>
      </InfoSection>

      <InfoSection heading="7. Changes to these terms">
        <p>
          CCAE may update these terms from time to time. Continuing to use the platform means you accept the updated
          terms.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
