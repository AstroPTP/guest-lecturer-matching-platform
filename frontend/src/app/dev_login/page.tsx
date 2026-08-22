import { notFound } from "next/navigation";
import DevLoginForm from "@/components/dev_login/DevLoginForm";
import { devLoginEnabled } from "@/lib/auth/config";

/**
 * Demonstration sign-in against the development identity provider.
 *
 * Returns a 404 unless NEXT_PUBLIC_DEV_LOGIN is explicitly "true", and never
 * renders when NODE_ENV is production. A page that hands out signed tokens for
 * an email address is an authentication bypass wherever it is reachable.
 */
export default function DevLoginPage() {
  if (!devLoginEnabled()) {
    notFound();
  }

  return <DevLoginForm />;
}
