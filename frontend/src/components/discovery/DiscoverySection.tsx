import type { ReactNode } from "react";

export default function DiscoverySection({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={"p-6 md:p-8 " + className}>
      <h3 className="mb-5 text-lg font-bold text-gray-900">{title}</h3>

      <div className="space-y-4">{children}</div>
    </section>
  );
}
