"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import arrowBackIcon from "@/assets/arrow_back.png";
import { getProfileManagementActions, type ProfileManagementAction } from "@/lib/user_directory_actions";
import { statusColors } from "@/lib/user_status";
import { AccountStatus, VerificationStatus, type DirectoryUser } from "@/types/admin";

const actionLabels: Record<ProfileManagementAction, string> = {
  verify: "Verify User",
  suspend: "Suspend Account",
  "request-verification": "Request Additional Verification",
  activate: "Activate Account",
  reactivate: "Reactivate Account",
};

export function UserProfileManagement({ initialUser }: { initialUser: DirectoryUser }) {
  const [user, setUser] = useState(initialUser);
  const [notice, setNotice] = useState("");
  const actions = getProfileManagementActions(user.verificationStatus, user.accountStatus);

  function runManagementAction(action: ProfileManagementAction) {
    if (action === "verify") {
      setUser((current) => ({ ...current, verificationStatus: VerificationStatus.Verified }));
    } else if (action === "suspend") {
      setUser((current) => ({ ...current, accountStatus: AccountStatus.Suspended }));
    } else if (action === "activate" || action === "reactivate") {
      setUser((current) => ({ ...current, accountStatus: AccountStatus.Active }));
    }

    setNotice(
      action === "request-verification"
        ? "Additional verification request prepared."
        : actionLabels[action] + " completed.",
    );
  }

  return (
    <div className="user-profile-page">
      <Link className="profile-back-link" href="/dashboard/users">
        <Image alt="" aria-hidden="true" height={14} src={arrowBackIcon} width={14} />
        Back to User Directory
      </Link>
      <header className="user-profile-heading">
        <div>
          <span className="directory-avatar" aria-hidden="true">
            {user.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}
          </span>
          <div>
            <h1>{user.name}</h1>
            <p>{user.role} · {user.id}</p>
          </div>
        </div>
      </header>

      <section className="profile-details-card" aria-label="User profile details">
        <dl>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Joined</dt><dd>{user.joined}</dd></div>
          <div>
            <dt>Verification</dt>
            <dd style={{ color: statusColors[user.verificationStatus] }}>{user.verificationStatus}</dd>
          </div>
          <div>
            <dt>Account Status</dt>
            <dd style={{ color: statusColors[user.accountStatus] }}>{user.accountStatus}</dd>
          </div>
        </dl>

        <div className="profile-management-actions">
          <h2>Account Management</h2>
          <div>
            {actions.map((action) => (
              <button key={action} onClick={() => runManagementAction(action)} type="button">
                {actionLabels[action]}
              </button>
            ))}
          </div>
          {notice && <p role="status">{notice}</p>}
        </div>
      </section>
    </div>
  );
}
