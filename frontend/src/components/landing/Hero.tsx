import Image from "next/image";
import auditorium from "@/assets/auditorium.jpg";

export default function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-8 py-20">
      <div id="lectures" className="grid scroll-mt-8 items-center gap-16 lg:grid-cols-2">
        <div>
          <h1 className="text-6xl font-black leading-tight mb-8">
            Where Industry
            <br />
            Meets the Lecture
            <br />
            Hall.
          </h1>

          <p className="text-xl text-gray-700 leading-relaxed">
            A platform connecting distinguished industry leaders with academic institutions for impactful guest lectures. Facilitate the transfer of knowledge
            and expertise from the industry to the academic world, enriching the learning experience for students and fostering collaboration between academia
            and industry.
          </p>
        </div>

        <div>
          <Image src={auditorium} alt="Auditorium" width={700} height={700} loading="eager" className="rounded-3xl" />
        </div>
      </div>
    </section>
  );
}
