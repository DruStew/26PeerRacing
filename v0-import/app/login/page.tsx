"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

// Mock function - replace with actual Supabase call
const mockSignIn = async (email: string): Promise<{ error: string | null }> => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (!email.includes("@")) {
    return { error: "Please enter a valid email address" };
  }
  return { error: null };
};

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/events";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    
    // TODO: Replace with actual Supabase auth
    // const supabase = createClient();
    // const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    // const callbackUrl = `${baseUrl.replace(/\/$/, "")}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`;
    // const { error: signError } = await supabase.auth.signInWithOtp({
    //   email: email.trim(),
    //   options: { emailRedirectTo: callbackUrl },
    // });
    
    const { error: signError } = await mockSignIn(email.trim());
    
    if (signError) {
      setStatus("error");
      setError(signError);
      return;
    }
    setStatus("sent");
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        {/* Back link */}
        <Link 
          href="/" 
          className="absolute left-6 top-6 flex items-center gap-2 text-sm text-[#1E3A5F]/70 hover:text-[#1E3A5F] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center text-center">
            <Image
              src="/images/pr-logo.png"
              alt="Peer Racing"
              width={180}
              height={90}
              className="h-auto w-auto"
            />
          </div>

          <Card className="border-[#1E3A5F]/10 bg-white shadow-sm">
            <CardHeader className="text-center">
              <CardTitle className="font-display text-xl text-[#1E3A5F]">
                Sign In
              </CardTitle>
              <CardDescription className="text-[#1E3A5F]/60">
                {status !== "sent" 
                  ? "Enter your email and we'll send you a magic link" 
                  : "Check your inbox for the login link"
                }
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              {status !== "sent" ? (
                <form onSubmit={handleSendLink} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[#1E3A5F]">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E3A5F]/40" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                        required
                      />
                    </div>
                  </div>

                  {status === "error" && error && (
                    <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      {error}
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full bg-[#E87722] hover:bg-[#E87722]/90 text-white" 
                    disabled={status === "loading"}
                  >
                    {status === "loading" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending link...
                      </>
                    ) : (
                      "Send magic link"
                    )}
                  </Button>
                </form>
              ) : (
                <div className="flex flex-col items-center py-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E87722]/10">
                    <CheckCircle className="h-6 w-6 text-[#E87722]" />
                  </div>
                  <p className="mt-4 text-[#1E3A5F]">
                    We sent a login link to
                  </p>
                  <p className="mt-1 font-medium text-[#E87722]">
                    {email}
                  </p>
                  <p className="mt-4 text-sm text-[#1E3A5F]/60">
                    Click the link in your email to sign in. It may take a moment to arrive.
                  </p>
                  <Button 
                    variant="ghost" 
                    className="mt-6 text-[#1E3A5F] hover:text-[#E87722]"
                    onClick={() => {
                      setStatus("idle");
                      setEmail("");
                    }}
                  >
                    Use a different email
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Browse without login */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[#1E3A5F]/60">
              Just browsing?{" "}
              <Link href="/events" className="font-medium text-[#E87722] hover:underline">
                View events without signing in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
