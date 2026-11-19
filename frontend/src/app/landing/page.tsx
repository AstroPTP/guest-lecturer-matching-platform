import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import FeatureCard from "@/components/landing/FeatureCard";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main id="discover" className="min-h-screen bg-gray-50">
      <Navbar />

      <Hero />

      <section id="role-cards" className="mx-auto max-w-7xl scroll-mt-6 px-8 pb-20">
        <div className="grid md:grid-cols-2 gap-8">
          <FeatureCard
            title="For Guest Speakers"
            description="Give back to your field."
            buttonText="Join as Speaker"
            items={["Build your academic profile", "Industrial university matches", "Scheduling & honorariums"]}
            role="guest"
          />

          <FeatureCard
            title="For Unit Coordinators"
            description="Find verified industry experts."
            buttonText="Join as Coordinator"
            items={["Verified practitioners", "Advanced search", "Booking workflow"]}
            role="coordinator"
          />
        </div>
      </section>

      <Footer />
    </main>
  );
}
