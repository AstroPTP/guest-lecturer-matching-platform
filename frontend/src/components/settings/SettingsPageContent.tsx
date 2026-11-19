"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { changePassword, deleteAccount, getAccountSettings, requestEmailChange } from "@/services/settings/settingsService";
import AccountSection from "@/components/settings/AccountSection";
import PasswordSection from "@/components/settings/PasswordSection";
import DeleteAccountSection from "@/components/settings/DeleteAccountSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import SettingsNav, { type SettingsTab } from "@/components/settings/SettingsNav";
import { getPushKey } from "@/services/notifications/pushService";
import type { PushKeyResponse } from "@/types/notifications/pushTypes";

interface SettingsPageContentProps {
  seedEmail: string;
}

export default function SettingsPageContent(props: SettingsPageContentProps) {
  // Reading the address needs a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <SettingsPageBody {...props} />
    </Suspense>
  );
}

function SettingsPageBody({  seedEmail }: SettingsPageContentProps) {
  const [chosenTab, setChosenTab] = useState<SettingsTab | null>(null);
  const [email, setEmail] = useState(seedEmail);
  const [loadError] = useState("");
  // Null until the API answers. The Notifications tab is shown only when the
  // server has pushed notifications switched on.
  const [push, setPush] = useState<PushKeyResponse | null>(null);
  const pushKey = push?.enabled ? push.publicKey : null;
  // The reminder on Messages links here with ?section=notifications.
  const opensNotifications = useSearchParams().get("section") === "notifications";
  const activeTab: SettingsTab = chosenTab ?? (opensNotifications && pushKey ? "notifications" : "account");

  useEffect(() => {
    let cancelled = false;

    getPushKey()
      .then((answer) => {
        if (!cancelled) {
          setPush(answer);
        }
      })
      .catch(() => {
        // Without an answer the section stays hidden.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const settings = await getAccountSettings();

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
      <SettingsNav activeTab={activeTab === "notifications" && !pushKey ? "account" : activeTab} onSelect={setChosenTab} showNotifications={Boolean(pushKey)} />

      <div className="min-w-0 flex-1 overflow-y-auto bg-[#fafafa] px-10 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
          {loadError && <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">{loadError}</p>}
          {activeTab === "account" && (
            <AccountSection
              currentEmail={email}
              onRequestEmailChange={async ({ newEmail, currentPassword }) => {
                const result = await requestEmailChange(newEmail, currentPassword);
                if (result.success) {
                  setEmail(newEmail);
                }

                return result;
              }}
            />
          )}
          {activeTab === "password" && (
            <PasswordSection onChangePassword={({ currentPassword, newPassword }) => changePassword( currentPassword, newPassword)} />
          )}
          {activeTab === "notifications" && pushKey && <NotificationsSection publicKey={pushKey} />}
          {activeTab === "delete" && <DeleteAccountSection onDeleteAccount={() => deleteAccount()} />}
        </div>
      </div>
    </div>
  );
}
