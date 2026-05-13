import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default function Root() {
  const s = getSession();
  redirect(s ? "/dashboard" : "/login");
}
