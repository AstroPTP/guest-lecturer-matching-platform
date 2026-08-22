import { Suspense } from "react";

import LoginForm from "@/components/login/LoginForm";

export default function LoginPage() {
  // LoginForm reads the ?redirectTo the proxy adds when it turns away an
  // unauthenticated request, and useSearchParams requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
