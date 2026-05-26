import { ViewToggle } from "./view-toggle";

export function Topbar({
  title, role, subtitle, viewMode,
}: {
  title: string;
  role: "global" | "branch";
  subtitle?: string;
  viewMode?: "native" | "usd";
}) {
  const [first, ...rest] = title.split(" ");
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="font-serif text-2xl text-navy font-light">
          {first} <span className="font-semibold">{rest.join(" ")}</span>
        </h1>
        {subtitle && <p className="text-[12px] text-ink-3 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        {viewMode !== undefined && <ViewToggle mode={viewMode} />}
        <span
          className={
            role === "global"
              ? "bg-brand-orange text-white text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
              : "bg-brand-black text-brand-yellow text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
          }
        >
          {role === "global" ? "Global Admin" : "Cabang"}
        </span>
      </div>
    </div>
  );
}
