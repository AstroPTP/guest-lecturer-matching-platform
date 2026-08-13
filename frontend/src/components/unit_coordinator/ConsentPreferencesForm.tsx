"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ConsentOption from "@/components/shared/ConsentOption";
import FormNavButtons from "@/components/shared/FormNavButtons";

import type { UnitCoordinatorConsentData } from "@/types/profile/unitCoordinatorProfileTypes";

import { getUnitCoordinatorConsent, saveUnitCoordinatorConsent } from "@/services/profile/unitCoordinatorProfileService";

export default function UnitCoordinatorConsentForm() {
  const router = useRouter();

  const [detailsMatchingConsent, setDetailsMatchingConsent] = useState(false);
  const [informationAccurate, setInformationAccurate] = useState(false);
  const [receiveUpdates, setReceiveUpdates] = useState(false);

  const [useWithinAgreedScope, setUseWithinAgreedScope] = useState(false);
  const [noExternalRedistribution, setNoExternalRedistribution] = useState(false);
  const [studentPrivacyCompliance, setStudentPrivacyCompliance] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        const data = await getUnitCoordinatorConsent();

        if (cancelled || !data) {
          return;
        }

        setDetailsMatchingConsent(data.detailsMatchingConsent);

        setInformationAccurate(data.informationAccurate);

        setReceiveUpdates(data.receiveUpdates);

        setUseWithinAgreedScope(data.useWithinAgreedScope);

        setNoExternalRedistribution(data.noExternalRedistribution);

        setStudentPrivacyCompliance(data.studentPrivacyCompliance);

        setTermsAccepted(data.termsAccepted);
      } catch {
        // TODO(API): No backend to load saved consent from yet; continue with a blank form.
      }
    }

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detailsMatchingConsent) {
      alert("Please consent to your unit details being used for matching.");
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

    const consentPreferencesData: UnitCoordinatorConsentData = {
      detailsMatchingConsent,
      informationAccurate,
      receiveUpdates,
      useWithinAgreedScope,
      noExternalRedistribution,
      studentPrivacyCompliance,
      termsAccepted,
      requestStatus: "pending-match",
    };

    try {
      await saveUnitCoordinatorConsent(consentPreferencesData);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }

    router.push("/unit_coordinator/confirmation");
  }

  return (
    <main className="mx-auto w-full max-w-6xl">
      {/* Progress */}
      <div className="mb-8 flex flex-col items-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-gray-500">Step 4 of 4</p>

        <div className="flex gap-2">
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
        </div>
      </div>

      {/* Heading */}
      <div className="mb-12 text-center">
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-[#1f1f1f] md:text-5xl">Consent &amp; Preferences</h1>

        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          Last step — please review and agree to how your information will be used before we start matching your request with a guest speaker.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        {/* Data Consent */}
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Data Consent</h2>

          <p className="mt-2 text-sm text-gray-500">Please read and confirm the following before submitting your request.</p>

          <div className="mt-6 space-y-3">
            <ConsentOption
              checked={detailsMatchingConsent}
              onChange={() => setDetailsMatchingConsent(!detailsMatchingConsent)}
              title="I consent to my criteria details being used for matching"
              description="My unit information, session needs, and contact details may be shared with prospective Guest Lecturers for the purpose of arranging a speaking engagement. (Required)"
            />

            <ConsentOption
              checked={informationAccurate}
              onChange={() => setInformationAccurate(!informationAccurate)}
              title="I confirm the information I have provided is accurate"
              description="I understand that CCAE may follow up to clarify unit requirements before proceeding with a match. (Required)"
            />

            <ConsentOption
              checked={receiveUpdates}
              onChange={() => setReceiveUpdates(!receiveUpdates)}
              title="I would like to receive occasional updates"
              description="Newsletters or notifications about new guest speakers and platform updates. (Optional)"
            />
          </div>

          <p className="mt-5 text-sm leading-relaxed text-gray-500">
            You may withdraw your consent and request removal of your data at any time by contacting <span className="font-semibold">CCAE</span>. Withdrawing
            consent will not affect any engagements already arranged.
          </p>
        </section>

        {/* Recording & Reuse Responsibilities */}
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Recording &amp; Reuse Responsibilities</h2>

          <p className="mt-2 text-sm text-gray-500">If a guest speaker consents to being recorded, please confirm how you will handle that content.</p>

          <div className="mt-6 space-y-3">
            <ConsentOption
              checked={useWithinAgreedScope}
              onChange={() => setUseWithinAgreedScope(!useWithinAgreedScope)}
              title="I will only use recordings within the scope the speaker agreed to"
              description="For example, only within the same unit or teaching period, if that is what the speaker consented to."
            />

            <ConsentOption
              checked={noExternalRedistribution}
              onChange={() => setNoExternalRedistribution(!noExternalRedistribution)}
              title="I will not redistribute recordings outside approved units"
              description="Recordings will not be shared publicly or with units the speaker has not agreed to."
            />

            <ConsentOption
              checked={studentPrivacyCompliance}
              onChange={() => setStudentPrivacyCompliance(!studentPrivacyCompliance)}
              title="I will comply with student privacy requirements"
              description="Where students appear or participate in a recorded session, I will follow the university's student privacy and recording policy."
            />
          </div>

          <p className="mt-5 text-sm text-gray-500">Questions about recording use can be directed to CCAE at any time.</p>
        </section>

        {/* Terms and Conditions */}
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Terms and Conditions</h2>

          <div className="mt-5 max-h-56 overflow-y-auto rounded-xl bg-[#f3f3f0] px-6 py-5 text-sm leading-7 text-gray-600">
            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">1. Purpose of the Platform.</span> This platform is operated by CCAE, Faculty of Business and Law, to
              connect Unit Coordinators with Guest Lecturers for arranging guest lectures, panels, workshops, and related teaching activities.
            </p>

            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">2. Use of Information.</span> Information provided in this request, including unit details, session
              needs, and contact information, may be shared with prospective Guest Lecturers for matching purposes only.
            </p>

            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">3. No Guarantee of a Match.</span> Submitting a request does not guarantee a suitable Guest Lecturer
              will be found. CCAE will make reasonable efforts to identify a match within the requested timeframe.
            </p>

            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">4. Recording and Reuse.</span> Where a session is recorded, its use is governed by the consent given by
              the Guest Lecturer. Unit Coordinators agree to use recordings only within that agreed scope.
            </p>

            <p className="mb-4">
              <span className="font-bold text-[#2d2d2d]">5. Data Retention.</span> Request data is retained while the account remains active and may be deleted
              at the Unit Coordinator&apos;s request, subject to university record-keeping obligations.
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
              description="Required to submit your request."
            />
          </div>
        </section>

        {/* Request Status */}
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-[#1f1f1f]">Request Status</h2>

            <span className="rounded-full bg-[#faecd9] px-4 py-2 text-sm font-semibold text-[#98611e]">Pending match</span>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            CCAE reviews new requests within 3 business days and will begin identifying suitable Guest Lecturers. You&apos;ll be notified by email once a{" "}
            <span className="font-semibold text-gray-700">match</span> is found.
          </p>
        </section>

        {/* Buttons */}
        <FormNavButtons submitLabel="Complete Profile" isFinalStep />
      </form>
    </main>
  );
}
