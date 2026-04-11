import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { ProfileCompleteForm } from "./ProfileCompleteForm";

// Mock user for development
const mockUser = {
  id: "1",
  email: "test@example.com",
};

const mockProfile = {
  id: "1",
  first_name: "",
  last_name: "",
  dob: "",
  sex: "",
  phone: "",
  email: "test@example.com",
};

export default async function ProfileCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  // TODO: Replace with actual Supabase auth
  // const supabase = await createServerSupabaseClient();
  // const { data: { user } } = await supabase.auth.getUser();
  // if (!user) {
  //   const resolved = await searchParams;
  //   const returnUrl = resolved.returnUrl ?? "/events";
  //   redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  // }

  // const { data: profile } = await supabase
  //   .from("profiles")
  //   .select("id,first_name,last_name,dob,sex,phone,email")
  //   .eq("id", user.id)
  //   .single();

  const user = mockUser;
  const profile = mockProfile;
  
  const resolved = await searchParams;
  const returnUrl = resolved.returnUrl ?? "/events";

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-xl px-6 py-12">
        {/* Back link */}
        <Link 
          href="/events" 
          className="mb-8 inline-flex items-center gap-2 text-sm text-[#1E3A5F]/70 hover:text-[#1E3A5F] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to events
        </Link>

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/images/pr-logo.png"
            alt="Peer Racing"
            width={160}
            height={80}
            className="h-auto w-auto"
          />
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1E3A5F]">
            Complete Your Profile
          </h1>
          <p className="mt-3 text-[#1E3A5F]/70 leading-relaxed">
            You need a complete profile before entering a race: first name, last name, 
            date of birth, sex, and email.
          </p>
        </div>

        {/* Form */}
        <ProfileCompleteForm 
          profile={profile} 
          userId={user.id} 
          returnUrl={returnUrl} 
        />
      </div>
    </div>
  );
}
