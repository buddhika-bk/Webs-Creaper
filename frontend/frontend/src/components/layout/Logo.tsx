export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-brand" />
      <circle cx="16" cy="14" r="5" fill="#fff" />
      <path d="M16 29 8.5 18.5a9 9 0 1 1 15 0Z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="16" cy="14" r="2.2" className="fill-accent" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[19px] font-bold leading-none tracking-tight">
        WebPoint <span className="font-medium text-muted">Leads</span>
      </span>
    </div>
  );
}
