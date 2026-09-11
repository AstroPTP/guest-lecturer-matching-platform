"use client";

import { useEffect, useState } from "react";
import { cancelEmailChange, changePassword, confirmEmailChange, deleteAccount, getAccountSettings, requestEmailChange} from "@/services/settings/settingsService";
import AccountSection from "@/components/settings/AccountSection";
import PasswordSection from "@/components/settings/PasswordSection";
import DeleteAccountSection from "@/components/settings/DeleteAccountSection";
import SettingsNav, { type SettingsTab } from "@/components/settings/SettingsNav";

interface SettingsPageContentProps {
  seedEmail: string;
}

export default function SettingsPageContent({  seedEmail }: SettingsPageContentProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [email, setEmail] = useState(seedEmail);
  const [loadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const settings = await getAccountSettings(seedEmail);

        if (!cancelled) {
          setEmail(settings.email);
        }
      } catch {

      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [seedEmail]);

  return (
    <div className="-m-8 flex h-[calc(100vh-5rem)] overflow-hidden bg-white">
      <SettingsNav activeTab={activeTab} onSelect={setActiveTab} />

      <div className="min-w-0 flex-1 overflow-y-auto bg-[#fafafa] px-10 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
          {loadError && <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">{loadError}</p>}
          {activeTab === "account" && (
            <AccountSection
              currentEmail={email}
              onRequestEmailChange={({ newEmail, currentPassword }) => requestEmailChange(newEmail, currentPassword)}
              onConfirmEmailChange={async ({ code }) => {
                const result = await confirmEmailChange(code);
                if (result.success) {
                  try {
                    const settings = await getAccountSettings( seedEmail);
                    setEmail(settings.email);
                  } catch {
                  }
                }

                return result;
              }}
              onCancelEmailChange={() => cancelEmailChange()}
            />
          )}
          {activeTab === "password" && (
            <PasswordSection onChangePassword={({ currentPassword, newPassword }) => changePassword( currentPassword, newPassword)} />
          )}
          {activeTab === "delete" && <DeleteAccountSection onDeleteAccount={() => deleteAccount()} />}
        </div>
      </div>
    </div>
  );
}
