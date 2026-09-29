import { redirect } from "next/navigation";
import { homeFor } from "@/server/auth/roles";
import { getContext } from "@/server/context";

/** The site's front door: signed-in people go to their own area, everyone else to sign in. */
export default async function HomePage() {
  const context = await getContext();
  if (!context) redirect("/login");
  redirect(context.mustChangePassword ? "/change-password" : homeFor(context.role));
}
