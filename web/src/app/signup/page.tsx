import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <p className="font-serif text-3xl">Create an account</p>
      <p className="mt-2 text-sm text-ink/70">
        Onboarding and brand voice setup come in the next phase. This step only
        creates an auth user.
      </p>
      <Card className="mt-8">
        <AuthForm mode="signup" />
      </Card>
      <p className="mt-4 text-sm text-ink/60">
        Already registered?{" "}
        <Link href="/login" className="text-accent underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
