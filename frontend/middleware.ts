import { withAuth } from "next-auth/middleware";

// Protect all app routes. Public paths (/login, /_next, /api/auth, static files)
// are excluded by the matcher below.
export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

export const config = {
  matcher: [
    "/((?!login|_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:jpg|jpeg|png|gif|svg|ico|webp)).*)",
  ],
};
