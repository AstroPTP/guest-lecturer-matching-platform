interface ConsentOptionProps {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}

export default function ConsentOption({ checked, onChange, title, description }: ConsentOptionProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={
        "flex w-full items-start gap-4 rounded-xl border-2 px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 " +
        (checked ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300")
      }
    >
      <span
        className={
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors " +
          (checked ? "bg-blue-600 shadow-sm shadow-blue-600/30" : "border-2 border-gray-300 bg-white")
        }
      >
        {checked ? (
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-white stroke-[3]">
            <path d="m4 10 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>

      <span>
        <span className="block font-semibold text-[#2d2d2d]">{title}</span>

        <span className="mt-1 block text-sm leading-relaxed text-gray-500">{description}</span>
      </span>
    </button>
  );
}
