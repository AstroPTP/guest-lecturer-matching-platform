import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

/**
 * The frame shared by the About, Privacy, Terms and Contact pages: the landing
 * navigation and footer around one readable column of text.
 */
export default function InfoPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gray-50">
      <Navbar />
      <article className="mx-auto max-w-3xl px-8 pb-16 pt-6">
        <h1 className="text-4xl font-bold text-[#2d2d2d]">{title}</h1>
        <p className="mt-4 text-lg text-gray-600">{intro}</p>
        <div className="mt-10 space-y-10 leading-relaxed text-gray-700">{children}</div>
      </article>
      <Footer />
    </main>
  );
}

export function InfoSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-[#2d2d2d]">{heading}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
