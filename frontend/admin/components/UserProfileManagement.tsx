"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import arrowBackIcon from "@/assets/arrow_back.png";
import { RequestDetailsButton } from "@/components/RequestDetailsButton";
import { statusColors } from "@/lib/user_status";
import { getUser, setUserStatus } from "@/services/adminApi";
import { AccountStatus, type DirectoryUser } from "@/types/admin";

type ProfileAction = "deactivate" | "reactivate";

const actionLabels: Record<ProfileAction, string> = {
  deactivate: "Deactivate Account",
  reactivate: "Reactivate Account",
};

/**
 * Managing one account.
 *
 * An administrator must be able to remove a guest lecturer from the platform.
 * Deactivating sets the same marker as account deletion, which the API's
 * JWT guard already refuses, so the person is locked out on their next
 * request and drops out of discovery; reactivating restores them. Because
 * deactivating locks someone out, it asks for confirmation first. The change is shown at once and rolled
 * back if the API refuses it, so the page never claims something that did not
 * happen.
 */
export function UserProfileManagement({ directoryId }: { directoryId: string }) {
  const [user, setUser] = useState<DirectoryUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState<ProfileAction | null>(null);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const confirmDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const row = await getUser(directoryId);
      if (active) {
        setUser(row);
        setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [directoryId]);

  async function runManagementAction(action: ProfileAction) {
    if (!user) return;

    const previous = user;
    const status = action === "deactivate" ? "deactivated" : "active";

    setUser({
      ...user,
      accountStatus: status === "deactivated" ? AccountStatus.Suspended : AccountStatus.Active,
    });
    setPending(action);
    setNotice("");
    setErrorMessage("");

    try {
      await setUserStatus(directoryId, status);
      setNotice(`${actionLabels[action]} completed.`);
    } catch (error) {
      setUser(previous);
      setErrorMessage(error instanceof Error ? error.message : "That change could not be saved.");
    } finally {
      setPending(null);
    }
  }

  if (isLoading) {
    return <p className="control-empty">Loading profile…</p>;
  }

  if (!user) {
    return (
      <div className="profile-page">
        <Link className="back-link" href="/dashboard/users">
          <Image alt="" aria-hidden="true" src={arrowBackIcon} />
          Back to users
        </Link>
        <p className="control-empty">No user with that identifier.</p>
      </div>
    );
  }

  const actions: ProfileAction[] =
    user.accountStatus === AccountStatus.Suspended ? ["reactivate"] : ["deactivate"];

  return (
    <div className="profile-page">
      <Link className="back-link" href="/dashboard/users">
        <Image alt="" aria-hidden="true" src={arrowBackIcon} />
        Back to users
      </Link>

      <header className="profile-heading">
        <h1>{user.name}</h1>
        <p>
          {user.role} · {user.id}
        </p>
      </header>

      <dl className="profile-details">
        <div>
          <dt>Email</dt>
          <dd>{user.email || "Not recorded"}</dd>
        </div>
        <div>
          <dt>Joined</dt>
          <dd>{user.joined}</dd>
        </div>
        <div>
          <dt>Account status</dt>
          <dd style={{ color: statusColors[user.accountStatus] }}>{user.accountStatus}</dd>
        </div>
      </dl>

      <div className="profile-actions">
        {actions.map((action) => (
          <button
            disabled={pending !== null}
            key={action}
            onClick={() =>
              action === "deactivate"
                ? confirmDialog.current?.showModal()
                : void runManagementAction(action)
            }
            type="button"
          >
            {pending === action ? "Saving…" : actionLabels[action]}
          </button>
        ))}
        <RequestDetailsButton userId={directoryId} userName={user.name} />
      </div>

      <dialog
        aria-labelledby="confirm-deactivate-title"
        className="confirm-dialog"
        ref={confirmDialog}
      >
        <h2 id="confirm-deactivate-title">Deactivate {user.name}?</h2>
        <p>
          They will be signed out on their next request and will no longer
          appear to unit coordinators. Their profile and history are kept, and
          you can reactivate the account at any time.
        </p>
        <form className="confirm-actions" method="dialog">
          <button autoFocus type="submit" value="cancel">
            Cancel
          </button>
          <button
            className="danger"
            onClick={() => void runManagementAction("deactivate")}
            type="submit"
            value="confirm"
          >
            Deactivate
          </button>
        </form>
      </dialog>

      {notice ? (
        <p className="profile-notice" role="status">
          {notice}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="profile-notice error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
