import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Aplica a todo excepto estáticos y la home pública.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
