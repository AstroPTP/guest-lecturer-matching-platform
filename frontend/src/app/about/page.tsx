import type { Metadata } from "next";
import InfoPage, { InfoSection } from "@/components/info/InfoPage";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <InfoPage
      title="About the platform"
      intro="The Guest Lecturer Matching Platform connects industry professionals who are willing to give a guest lecture with teaching staff in Curtin University's Faculty of Business and Law who are looking for one."
    >
      <InfoSection heading="Who runs it">
        <p>
          The platform is run by the Centre for Change and Applied Ethics (CCAE) in the Faculty of Business and Law.
          It supports teaching on ethics in real business settings: privacy, fairness, security, environmental impact
          and corporate responsibility.
        </p>
      </InfoSection>

      <InfoSection heading="How it works">
        <ol className="list-decimal space-y-2 pl-6">
          <li>Guest lecturers create a profile with their expertise, availability and how they like to teach.</li>
          <li>Unit coordinators describe what their unit needs and browse guest lecturers, using filters they choose.</li>
          <li>
            When both sides express interest they are matched and continue in the platform&apos;s messages, without
            either side&apos;s email address or phone number being shown.
          </li>
        </ol>
      </InfoSection>

      <InfoSection heading="Who uses it">
        <ul className="list-disc space-y-2 pl-6">
          <li>Guest lecturers: practitioners from industry, government and the community.</li>
          <li>Unit coordinators: Curtin teaching staff who run a unit.</li>
          <li>CCAE administrators, who look after accounts and keep the platform safe.</li>
        </ul>
      </InfoSection>

      <InfoSection heading="You choose, the platform does not rank">
        <p>
          The platform does not score people or recommend matches with an algorithm. Coordinators sort and filter
          the list themselves, so every match is a person&apos;s own choice.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
