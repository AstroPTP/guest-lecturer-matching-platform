import Link from "next/link";

export default function Navbar() {
  return (
    <header className="w-full">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <Link href="/landing#discover" className="text-2xl font-bold">
          Curtin University
        </Link>
        <nav aria-label="Landing page navigation" className="hidden gap-10 md:flex">
          <Link href="/landing#discover" className="border-b-2 border-black font-medium">
            Discover
          </Link>
          <Link href="/landing#lectures" className="text-gray-700 transition-colors hover:text-black">
            Lectures
          </Link>
        </nav>
        <nav aria-label="Account actions" className="flex gap-2 md:flex">
          <Link href="/landing#role-cards" className="rounded-xl bg-transparent px-6 py-3 text-black transition-colors hover:bg-gray-200">
            Sign Up
          </Link>
          <Link href="/login" className="rounded-xl bg-black px-6 py-3 text-white transition-colors hover:bg-gray-800">
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}