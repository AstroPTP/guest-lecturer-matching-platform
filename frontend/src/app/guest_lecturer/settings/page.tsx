"use client";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SettingsPageContent from "@/components/settings/SettingsPageContent";

import { guestLecturerMenu } from "@/config/guestLecturerDashboard";
import { useCurrentUser } from "@/components/auth/SessionProvider";

/**
 * Reference for converting the remaining dashboard pages off the demo
 * constants.
 *
 * The other fifteen still read DEMO_GUEST_LECTURER_ID / DEMO_USER_EMAILS from
 * config/demoUsers.ts. The change is the three lines below: call
 * useCurrentUser(), hold the render while isLoading, and pass user.id and
 * user.email where the DEMO_* constants used to go.
 *
 * Only this page is converted here, deliberately — the other fifteen are
 * spread across several of Ken's in-flight fixbug branches and converting them
 * from this branch would collide with all of them at once.
 */
export default function GuestLecturerSettingsPage() {
  const { user, isLoading } = useCurrentUser();

  // The session is read in an effect, so the first render has no user yet.
  // Rendering the signed-out state here instead would flash "not signed in" at
  // someone who is.
  if (isLoading) {
    return null;
  }

  // Reachable only when NEXT_PUBLIC_AUTH_ENFORCED is false; with it on, the
  // proxy has already redirected to /login. Kept so the page degrades to a
  // message rather than a crash.
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-slate-600">
        You need to be signed in to view your settings.
      </main>
    );
  }

  return (
    <DashboardShell
      role="guestLecturer"
      currentUserId={user.id}
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
      messagesHref="/guest_lecturer/messages"
      profileHref="/guest_lecturer/my_profile"
    >
      <SettingsPageContent userType="guestLecturer" currentUserId={user.id} seedEmail={user.email} />
    </DashboardShell>
  );
}
