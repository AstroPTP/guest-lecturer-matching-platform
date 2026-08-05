export default function Footer() {
  return (
    <footer className="mt-20 border-t">
      <div className="max-w-7xl mx-auto px-8 py-10 flex justify-between">
        <p className="text-gray-600">© 2026 Curtin University</p>

        <div className="flex gap-6 text-gray-600">
          <a href="#" className="hover:text-black transition-colors">
            Privacy Policy
          </a>
          <a href="#" className="hover:text-black transition-colors">
            Terms
          </a>
          <a href="#" className="hover:text-black transition-colors">
            Contact
          </a>
          <a href="#" className="hover:text-black transition-colors">
            About
          </a>
        </div>
      </div>
    </footer>
  );
}
