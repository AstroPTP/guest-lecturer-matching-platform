"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import arrowIcon from "@/assets/arrow.png";
import ruleIcon from "@/assets/rule.png";
import { getUsers } from "@/services/adminApi";
import type { DirectoryUser } from "@/types/admin";
import { accountStatusOptions, statusColors } from "@/lib/user_status";
import { getUserDirectoryAction } from "@/lib/user_directory_actions";
import { AccountStatus, type UserDirectoryTab } from "@/types/admin";

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

const userDirectoryTabs: UserDirectoryTab[] = ["All", "Guest Lecturers", "Unit Coordinators"];

export default function UsersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<UserDirectoryTab>("All");
  const [accountFilter, setAccountFilter] = useState<AccountStatus | "All">("All");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await getUsers();
        if (active) setUsers(rows);
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "The directory could not be loaded.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const matchingUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesRole =
        activeTab === "All" ||
        (activeTab === "Guest Lecturers" && user.role === "Guest Lecturer") ||
        (activeTab === "Unit Coordinators" && user.role === "Unit Coordinator");
      const matchesAccount = accountFilter === "All" || user.accountStatus === accountFilter;
      const matchesSearch =
        needle === "" ||
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        user.id.toLowerCase().includes(needle);

      return matchesRole && matchesAccount && matchesSearch;
    });
  }, [accountFilter, activeTab, search, users]);

  // Pagination now counts and slices the rows that are actually there. It used
  // to be computed from a fixed total of 248 while the table rendered three
  // rows and never sliced, so pages two to twenty-five were blank and the
  // footer count was fiction.
  const totalMatching = matchingUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalMatching / USERS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginationItems = getPaginationItems(safePage, totalPages);
  const firstVisibleUser = totalMatching === 0 ? 0 : (safePage - 1) * USERS_PER_PAGE + 1;
  const lastVisibleUser = Math.min(safePage * USERS_PER_PAGE, totalMatching);

  const visibleUsers = useMemo(
    () => matchingUsers.slice((safePage - 1) * USERS_PER_PAGE, safePage * USERS_PER_PAGE),
    [matchingUsers, safePage],
  );

  const userSummary = useMemo(() => {
    const deactivated = users.filter((u) => u.accountStatus === AccountStatus.Suspended).length;

    return [
      { label: "Total users", value: String(users.length), detail: "Across every role" },
      { label: "Guest lecturers", value: String(users.filter((u) => u.role === "Guest Lecturer").length) },
      { label: "Unit coordinators", value: String(users.filter((u) => u.role === "Unit Coordinator").length) },
      { label: "Deactivated", value: String(deactivated) },
    ] as { label: string; value: string; detail?: string }[];
  }, [users]);

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
              <label htmlFor="user-search">Search</label>
              <input
                id="user-search"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Name, email or id"
                type="search"
                value={search}
              />
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
                  <td className="empty-users" colSpan={6}>
                    {isLoading
                      ? "Loading users…"
                      : errorMessage
                        ? errorMessage
                        : users.length === 0
                          ? "Nobody has registered yet."
                          : "No users match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="users-pagination">
          <p>
            Showing <strong>{firstVisibleUser}-{lastVisibleUser}</strong> of <strong>{totalMatching}</strong> users
          </p>
          <div>
            <button
              aria-label="Previous page"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              <Image alt="" src={arrowIcon} />
            </button>
            {paginationItems.map((item, index) =>
              item === "ellipsis" ? (
                <span aria-hidden="true" key={"ellipsis-" + index}>…</span>
              ) : (
                <button
                  aria-current={safePage === item ? "page" : undefined}
                  aria-label={"Page " + item}
                  className={safePage === item ? "current" : ""}
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
              disabled={safePage === totalPages}
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
