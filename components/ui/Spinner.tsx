export function Spinner({ size = "md", label }: { size?: "sm" | "md" | "lg"; label?: string }) {
  const dims = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-6 w-6";
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <svg className={`${dims} animate-spin text-current`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}
