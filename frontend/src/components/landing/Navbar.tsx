export default function Navbar() {
  return (
    <header className="w-full">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <a href="#discover" className="text-2xl font-bold">
          Curtin University
        </a>
        <nav aria-label="Landing page navigation" className="hidden gap-10 md:flex">
          <a href="#discover" className="border-b-2 border-black font-medium">
            Discover
          </a>
          <a href="#lectures" className="text-gray-700 transition-colors hover:text-black">
            Lectures
          </a>
        </nav>
        <a href="#role-cards" className="rounded-xl bg-black px-6 py-3 text-white transition-colors hover:bg-gray-800">
          Sign In
        </a>
      </div>
    </header>
  );
}
