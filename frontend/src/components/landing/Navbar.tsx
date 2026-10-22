"use client";
import Link from "next/link";
import BrandLogo from "@/components/brand/BrandLogo";
import ThemeToggle from "@/components/theme/ThemeToggle";

/**
 * Scrolls to the role cards without adding #role-cards to the URL. A hash link
 * left /landing#role-cards in history, so Back from sign-up returned there, and
 * clicking Sign Up again did nothing because the URL did not change.
 */
function showRoleCards() {
  document.getElementById("role-cards")?.scrollIntoView({ behavior: "smooth" });
}

export default function Navbar() {
  return (
    <header className="w-full">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <Link href="/landing#discover" className="flex items-center">
          {/* Mark only on a phone, where the buttons on the right need the room. */}
          <span className="sm:hidden">
            <BrandLogo variant="mark" size={36} />
          </span>
          <span className="hidden sm:block">
            <BrandLogo variant="compact" size={40} />
          </span>
        </Link>
        <nav aria-label="Landing page navigation" className="hidden gap-10 md:flex">
          <Link href="/landing#discover" className="border-b-2 border-black font-medium">
            Discover
          </Link>
          <Link href="/landing#lectures" className="text-gray-700 transition-colors hover:text-black">
            Lectures
          </Link>
        </nav>
        <nav aria-label="Account actions" className="flex items-center gap-2 md:flex">
          <ThemeToggle className="hidden sm:inline-flex" />
          <button
            type="button"
            onClick={showRoleCards}
            className="cursor-pointer rounded-xl bg-transparent px-6 py-3 text-black transition-colors hover:bg-gray-200"
          >
            Sign Up
          </button>
          <Link href="/login" className="rounded-xl bg-black px-6 py-3 text-white transition-colors hover:bg-gray-800">
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}