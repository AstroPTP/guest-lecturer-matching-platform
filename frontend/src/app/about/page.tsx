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
          <li>Unit coordinators describe what their unit needs and browse guest lecturers, using the filters and sort order they choose.</li>
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

      <InfoSection heading="You choose the order">
        <p>
          Discovery lists profiles in the order each person chooses. Use Sort by to list people by when
          they joined, newest first, name, most shared topics or most recently active, and use Filters to narrow the
          list. Every match is a person&apos;s own choice.
        </p>
        <p>
          Ranked matching is an option that CCAE can switch on, and it is off by default. While it is on, Discovery
          can also list the best match first and coordinators get a Suggested speakers page. It ranks by topic fit,
          time since a lecturer&apos;s last session and sessions so far, never by personal characteristics. Nobody is
          hidden, and you can always choose another order.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
