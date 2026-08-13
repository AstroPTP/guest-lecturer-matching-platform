"use client";

import { useEffect, useState } from "react";

import type { UserRole } from "@/types/shared/userRole";

import { cancelEmailChange, changePassword, confirmEmailChange, deleteAccount, getAccountSettings, requestEmailChange} from "@/services/settings/settingsService";

import AccountSection from "@/components/settings/AccountSection";
import PasswordSection from "@/components/settings/PasswordSection";
import DeleteAccountSection from "@/components/settings/DeleteAccountSection";
import SettingsNav, { type SettingsTab } from "@/components/settings/SettingsNav";

interface SettingsPageContentProps {
  userType: UserRole;
  currentUserId: string;
  seedEmail: string;
}

export default function SettingsPageContent({ currentUserId, seedEmail }: SettingsPageContentProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [email, setEmail] = useState(seedEmail);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const settings = await getAccountSettings(currentUserId, seedEmail);

        if (!cancelled) {
          setEmail(settings.email);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Account settings aren't connected to a backend yet — showing a placeholder email.");
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, seedEmail]);

  return (
    <div className="-m-8 flex h-[calc(100vh-5rem)] overflow-hidden bg-white">
      <SettingsNav activeTab={activeTab} onSelect={setActiveTab} />

      <div className="min-w-0 flex-1 overflow-y-auto bg-[#fafafa] px-10 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
          {loadError && <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">{loadError}</p>}

          {activeTab === "account" && (
            <AccountSection
              currentEmail={email}
              onRequestEmailChange={({ newEmail, currentPassword }) => requestEmailChange(currentUserId, newEmail, currentPassword)}
              onConfirmEmailChange={async ({ code }) => {
                const result = await confirmEmailChange(currentUserId, code);

                if (result.success) {
                  // re-read the confirmed email so the view reflects it immediately
                  try {
                    const settings = await getAccountSettings(currentUserId, seedEmail);
                    setEmail(settings.email);
                  } catch {
                    // Nothing to fall back to beyond the currently displayed email.
                  }
                }

                return result;
              }}
              onCancelEmailChange={() => cancelEmailChange(currentUserId)}
            />
          )}

          {activeTab === "password" && (
            <PasswordSection onChangePassword={({ currentPassword, newPassword }) => changePassword(currentUserId, currentPassword, newPassword)} />
          )}

          {activeTab === "delete" && <DeleteAccountSection onDeleteAccount={() => deleteAccount(currentUserId)} />}
        </div>
      </div>
    </div>
  );
}
