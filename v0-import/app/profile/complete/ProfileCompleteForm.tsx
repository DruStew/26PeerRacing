"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  dob: string;
  sex: string;
  phone: string;
  email: string;
}

interface ProfileCompleteFormProps {
  profile: Profile | null;
  userId: string;
  returnUrl: string;
}

export function ProfileCompleteForm({ profile, returnUrl }: ProfileCompleteFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    dob: profile?.dob ?? "",
    sex: profile?.sex ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError(null);

    // Validate required fields
    if (!formData.first_name || !formData.last_name || !formData.dob || !formData.sex || !formData.email) {
      setStatus("error");
      setError("Please fill in all required fields");
      return;
    }

    // TODO: Replace with actual Supabase update
    // const supabase = createClient();
    // const { error: updateError } = await supabase
    //   .from("profiles")
    //   .upsert({
    //     id: userId,
    //     ...formData,
    //   });
    
    // Mock success
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    router.push(returnUrl);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="border-[#1E3A5F]/10 bg-white shadow-sm">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name" className="text-[#1E3A5F]">First Name *</Label>
              <Input
                id="first_name"
                placeholder="John"
                value={formData.first_name}
                onChange={(e) => handleChange("first_name", e.target.value)}
                className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name" className="text-[#1E3A5F]">Last Name *</Label>
              <Input
                id="last_name"
                placeholder="Doe"
                value={formData.last_name}
                onChange={(e) => handleChange("last_name", e.target.value)}
                className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#1E3A5F]">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
              required
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-[#1E3A5F]">Phone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
            />
          </div>

          {/* DOB and Sex */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dob" className="text-[#1E3A5F]">Date of Birth *</Label>
              <Input
                id="dob"
                type="date"
                value={formData.dob}
                onChange={(e) => handleChange("dob", e.target.value)}
                className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sex" className="text-[#1E3A5F]">Sex *</Label>
              <Select 
                value={formData.sex} 
                onValueChange={(value) => handleChange("sex", value)}
              >
                <SelectTrigger className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Error message */}
          {status === "error" && error && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Submit button */}
          <Button 
            type="submit" 
            className="w-full bg-[#E87722] hover:bg-[#E87722]/90 text-white" 
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Profile"
            )}
          </Button>

          <p className="text-center text-xs text-[#1E3A5F]/50">
            * Required fields
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
