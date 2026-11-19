"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/brand/BrandLogo";

const PROGRESS_DURATION_MS = 2800;
const REDIRECT_DELAY_MS = 3200;

export default function SplashScreen() {
  const router = useRouter();
  const [progressStarted, setProgressStarted] = useState(false);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      setProgressStarted(true);
    });
    const redirectTimer = window.setTimeout(() => {
      router.replace("/landing");
    }, REDIRECT_DELAY_MS);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(redirectTimer);
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-between overflow-hidden bg-white text-black">
      <div className="mt-12 md:mt-20">
        <BrandLogo variant="full" size={72} />
      </div>

      <main className="flex flex-col items-center px-6 text-center">
        <h1 className="mb-6 text-5xl font-black uppercase leading-none tracking-tight md:text-8xl">
          GUEST LECTURER
          <br />
          MATCHING
        </h1>

        <p className="text-xl font-medium text-gray-600 md:text-2xl">Curtin University · Faculty of Business &amp; Law</p>
        <div className="mt-16 h-1 w-48 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] ease-out"
            style={{
              width: progressStarted ? "100%" : "0%",
              transitionDuration: PROGRESS_DURATION_MS + "ms",
            }}
          />
        </div>

        <p className="mt-10 text-sm font-bold tracking-[0.4em] text-gray-500">FINDING YOUR NEXT MATCH...</p>
      </main>
      <footer className="py-10" />
    </div>
  );
}
