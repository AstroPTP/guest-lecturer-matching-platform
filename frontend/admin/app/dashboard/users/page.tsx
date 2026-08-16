"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import arrowIcon from "@/assets/arrow.png";
import ruleIcon from "@/assets/rule.png";
import { initialUsers, userDirectoryTabs, userDirectoryTotal, userSummary } from "@/data/users";
import { accountStatusOptions, statusColors, verificationStatusOptions} from "@/lib/user-status";
import { getUserDirectoryAction } from "@/lib/user-directory-actions";
import { AccountStatus, VerificationStatus, type UserDirectoryTab,
} from "@/types/admin";

const USERS_PER_PAGE = 10;

function getPaginationItems(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const visiblePages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  visiblePages.forEach((page, index) => {
    if (index > 0 && page - visiblePages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });

  return items;
}

export default function UsersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<UserDirectoryTab>("All");
  const [verificationFilter, setVerificationFilter] = useState<VerificationStatus | "All">("All");
  const [accountFilter, setAccountFilter] = useState<AccountStatus | "All">("All");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const users = initialUsers;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(userDirectoryTotal / USERS_PER_PAGE));
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const firstVisibleUser = userDirectoryTotal === 0 ? 0 : (currentPage - 1) * USERS_PER_PAGE + 1;
  const lastVisibleUser = Math.min(currentPage * USERS_PER_PAGE, userDirectoryTotal);

  const visibleUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesRole =
        activeTab === "All" ||
        (activeTab === "Guest Lecturers" && user.role === "Guest Lecturer") ||
        (activeTab === "Unit Coordinators" && user.role === "Unit Coordinator");
      const matchesVerification =
        verificationFilter === "All" || user.verificationStatus === verificationFilter;
      const matchesAccount = accountFilter === "All" || user.accountStatus === accountFilter;

      return matchesRole && matchesVerification && matchesAccount;
    });
  }, [accountFilter, activeTab, users, verificationFilter]);

  return (
    <div className="users-page">
      <header className="users-heading">
        <div>
          <h1>Platform User Directory</h1>
          <p>Manage and audit institutional accounts and lecturer profiles.</p>
        </div>
      </header>

      <section className="directory-toolbar" aria-label="User filters">
        <div className="directory-tabs">
          {userDirectoryTabs.map((tab) => (
            <button
              className={activeTab === tab ? "active" : ""}
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setCurrentPage(1);
              }}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="advanced-filters">
          <button
            aria-expanded={showAdvancedFilters}
            className="advanced-filter-button"
            onClick={() => setShowAdvancedFilters((isOpen) => !isOpen)}
            type="button"
          >
            <Image alt="" aria-hidden="true" src={ruleIcon} />
            Advanced Filters
          </button>
          {showAdvancedFilters && (
            <div className="advanced-filter-panel">
              <label htmlFor="verification-filter">Verification</label>
              <select
                id="verification-filter"
                onChange={(event) => {
                  setVerificationFilter(event.target.value as VerificationStatus | "All");
                  setCurrentPage(1);
                }}
                value={verificationFilter}
              >
                <option value="All">All</option>
                {verificationStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <label htmlFor="account-status-filter">Account Status</label>
              <select
                id="account-status-filter"
                onChange={(event) => {
                  setAccountFilter(event.target.value as AccountStatus | "All");
                  setCurrentPage(1);
                }}
                value={accountFilter}
              >
                <option value="All">All</option>
                {accountStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <section className="users-table-card">
        <div className="users-table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Verification</th>
                <th>Account Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => {
                const action = getUserDirectoryAction(
                  user.verificationStatus,
                  user.accountStatus,
                  user.id,
                );

                return (
                <tr key={user.id}>
                  <td>
                    <div className="directory-user">
                      <span className="directory-avatar" aria-hidden="true">
                        {user.name
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")}
                      </span>
                      <p>
                        <strong>{user.name}</strong>
                        <small>ID: {user.id}</small>
                      </p>
                    </div>
                  </td>
                  <td className="user-email">{user.email}</td>
                  <td>
                    <span className="role-chip">{user.role}</span>
                  </td>
                  <td className="joined-date">{user.joined}</td>
                  <td>
                    <span className="status-label" style={{ color: statusColors[user.verificationStatus] }}>
                      {user.verificationStatus}
                    </span>
                  </td>
                  <td>
                    <span className="status-label" style={{ color: statusColors[user.accountStatus] }}>
                      {user.accountStatus}
                    </span>
                  </td>
                  <td className="user-action">
                    <button
                      className={action.label === "View Profile" ? "text-action" : undefined}
                      onClick={() => router.push(action.href)}
                      type="button"
                    >
                      {action.label}
                    </button>
                  </td>
                </tr>
                );
              })}
              {visibleUsers.length === 0 && (
                <tr>
                  <td className="empty-users" colSpan={7}>
                    No users match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="users-pagination">
          <p>
            Showing <strong>{firstVisibleUser}-{lastVisibleUser}</strong> of <strong>{userDirectoryTotal}</strong> users
          </p>
          <div>
            <button
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              <Image alt="" src={arrowIcon} />
            </button>
            {paginationItems.map((item, index) =>
              item === "ellipsis" ? (
                <span aria-hidden="true" key={`ellipsis-${index}`}>…</span>
              ) : (
                <button
                  aria-current={currentPage === item ? "page" : undefined}
                  aria-label={`Page ${item}`}
                  className={currentPage === item ? "current" : ""}
                  key={item}
                  onClick={() => setCurrentPage(item)}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}
            <button
              aria-label="Next page"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              type="button"
            >
              <Image alt="" src={arrowIcon} />
            </button>
          </div>
        </footer>
      </section>

      <section className="user-summary" aria-label="User statistics">
        {userSummary.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            {"detail" in item && <small>{item.detail}</small>}
          </article>
        ))}
      </section>
    </div>
  );
}
