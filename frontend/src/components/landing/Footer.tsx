import Link from "next/link";

const LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
  { href: "/about", label: "About" },
];

export default function Footer() {
  return (
    <footer className="mt-20 border-t">
      <div className="max-w-7xl mx-auto px-8 py-10 flex justify-between">
        <p className="text-gray-600">© 2026 Curtin GLMP</p>
        <div className="flex gap-6 text-gray-600">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-black transition-colors">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
