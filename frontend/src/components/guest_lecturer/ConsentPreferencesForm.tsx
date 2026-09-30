"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConsentOption from "@/components/shared/ConsentOption";
import FormNavButtons from "@/components/shared/FormNavButtons";
import { getGuestLecturerConsent, saveGuestLecturerConsent } from "@/services/profile/guestLecturerProfileService";
export default function ConsentPreferencesForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [profileMatchingConsent, setProfileMatchingConsent] = useState(false);
  const [informationAccurate, setInformationAccurate] = useState(false);
  const [receiveUpdates, setReceiveUpdates] = useState(false);
  const [futureTeachingReuse, setFutureTeachingReuse] = useState(false);
  const [otherUnitsReuse, setOtherUnitsReuse] = useState(false);
  const [timeLimitedUse, setTimeLimitedUse] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      try {
        const data = await getGuestLecturerConsent();
        if (cancelled || !data) {
          return;
        }
        setProfileMatchingConsent(data.profileMatchingConsent);
        setInformationAccurate(data.informationAccurate);
        setReceiveUpdates(data.receiveUpdates);
        setFutureTeachingReuse(data.futureTeachingReuse);
        setOtherUnitsReuse(data.otherUnitsReuse);
        setTimeLimitedUse(data.timeLimitedUse);
        setTermsAccepted(data.termsAccepted);
      } catch {
      }
    }

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, []);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profileMatchingConsent) {
      alert("Please consent to your profile being used for matching.");
      return;
    }
    if (!informationAccurate) {
      alert("Please confirm that your information is accurate.");
      return;
    }
    if (!termsAccepted) {
      alert("Please read and accept the Terms and Conditions.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      // Saving consent marks the profile as complete, so the next sign-in
      // goes straight to the dashboard.
      await saveGuestLecturerConsent({
        profileMatchingConsent,
        informationAccurate,
        receiveUpdates,
        futureTeachingReuse,
        otherUnitsReuse,
        timeLimitedUse,
        termsAccepted,
      });
      router.push("/guest_lecturer/confirmation");
    } catch {
      setError("Could not save your information. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }
  return (
    <main className="mx-auto w-full max-w-6xl">
      <div className="mb-8 flex flex-col items-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-gray-500">Step 4 of 4</p>

        <div className="flex gap-2">
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
        </div>
      </div>

      <div className="mb-12 text-center">
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-[#1f1f1f] md:text-5xl">Consent & Contact Preferences</h1>

        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          Last step — please review and agree to how your information will be used, then set your contact and recording preferences.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Data Consent</h2>

          <p className="mt-2 text-sm text-gray-500">Please read and confirm the following before completing your profile.</p>

          <div className="mt-6 space-y-3">
            <ConsentOption
              checked={profileMatchingConsent}
              onChange={() => setProfileMatchingConsent(!profileMatchingConsent)}
              title="I consent to my profile being used for matching"
              description="My expertise, availability, and contact details may be shared with Unit Coordinators within the Faculty of Business and Law for the purpose of arranging guest speaking engagements. (Required)"
            />

            <ConsentOption
              checked={informationAccurate}
              onChange={() => setInformationAccurate(!informationAccurate)}
              title="I confirm the information I have provided is accurate"
              description="I understand that CCAE may verify my details, for example through LinkedIn, before my profile is approved. (Required)"
            />

            <ConsentOption
              checked={receiveUpdates}
              onChange={() => setReceiveUpdates(!receiveUpdates)}
              title="I would like to receive occasional updates"
              description="Newsletters or notifications about new speaking opportunities and platform updates. (Optional)"
            />
          </div>

          <p className="mt-5 text-sm leading-relaxed text-gray-500">
            You may withdraw your consent and request removal of your profile and data at any time by contacting <span className="font-semibold">CCAE</span>.
            Withdrawing consent will not affect any engagements already arranged.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Recording Consent</h2>

          <p className="mt-2 text-sm text-gray-500">If you agree to be recorded, please confirm how the content may be used.</p>

          <div className="mt-6 space-y-3">
            <ConsentOption
              checked={futureTeachingReuse}
              onChange={() => setFutureTeachingReuse(!futureTeachingReuse)}
              title="Reuse in future teaching periods"
              description="Recording may be replayed in subsequent semesters for the same unit."
            />

            <ConsentOption
              checked={otherUnitsReuse}
              onChange={() => setOtherUnitsReuse(!otherUnitsReuse)}
              title="Reuse across other units"
              description="Recording may be shared with other units within the Faculty of Business and Law."
            />

            <ConsentOption
              checked={timeLimitedUse}
              onChange={() => setTimeLimitedUse(!timeLimitedUse)}
              title="Time-limited use only"
              description="Recording is deleted after 12 months unless re-consented."
            />
          </div>

          <p className="mt-5 text-sm text-gray-500">You can withdraw this consent at any time by contacting CCAE.</p>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Terms and Conditions</h2>

          <div className="mt-5 max-h-56 overflow-y-auto rounded-xl bg-[#f3f3f0] px-6 py-5 text-sm leading-7 text-gray-600">
            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">1. Purpose of the Platform.</span> This platform is operated by CCAE, Faculty of Business and Law, to
              connect guest speakers with Unit Coordinators for arranging guest lectures, panels, workshops, and related teaching activities.
            </p>

            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">2. Use of Information.</span> Information provided in this profile, including expertise, availability
              and contact details, may be stored and shared with Unit Coordinators within the Faculty of Business and Law for matching purposes only.
            </p>

            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">3. Voluntary Participation.</span> Registration does not guarantee a speaking engagement. Guest
              Lecturers may decline an invitation without affecting their profile status.
            </p>

            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">4. Recording and Reuse.</span> Where applicable, recording consent is collected separately and governs
              how session content may be reused.
            </p>

            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">5. Data Retention.</span> Profile data is retained while the account remains active and may be deleted
              at the Guest Lecturer&apos;s request, subject to university record-keeping obligations.
            </p>

            <p>
              <span className="font-bold text-[#2d2d2d]">6. Amendments.</span> CCAE may update these terms from time to time. Continued use of the platform
              constitutes acceptance of the updated terms.
            </p>
          </div>

          <div className="mt-4">
            <ConsentOption
              checked={termsAccepted}
              onChange={() => setTermsAccepted(!termsAccepted)}
              title="I have read and agree to the Terms and Conditions above"
              description="Required to complete your profile."
            />
          </div>
        </section>

        {error && <p className="text-center text-sm text-red-600">{error}</p>}
        <FormNavButtons submitLabel={isSaving ? "Saving..." : "Complete Profile"} isFinalStep />
      </form>
    </main>
  );
}
