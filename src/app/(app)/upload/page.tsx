import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";

export default function UploadPage() {
  const session = getSession()!;
  return (
    <>
      <Topbar title="Upload Mutasi" role={session.role} subtitle="Pilih file mutasi rekening untuk diproses" />
      <div className="card">
        <p className="text-[12px] text-ink-3">Skeleton — Milestone 3. Upload zone + parser BCA CSV.</p>
      </div>
    </>
  );
}
