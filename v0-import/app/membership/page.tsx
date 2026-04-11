import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Calendar, Gift, Trophy, Users } from "lucide-react";

const benefits = [
  {
    icon: Calendar,
    title: "Priority Registration",
    description: "Get early access to register for popular events before general admission opens.",
  },
  {
    icon: Gift,
    title: "Birthday Month Credits",
    description: "Receive special credits on Peer Racing fees during your birthday month.",
  },
  {
    icon: Trophy,
    title: "PR Tracking",
    description: "Automatic personal record tracking across all your races with detailed analytics.",
  },
  {
    icon: Users,
    title: "Pacer Network",
    description: "Access to our certified pacer network to help you hit your goal times.",
  },
];

const membershipTiers = [
  {
    name: "Community",
    price: "Free",
    period: "",
    description: "Perfect for casual runners exploring events",
    features: [
      "Browse and view all events",
      "Basic profile creation",
      "Event registration",
      "Results tracking",
    ],
    cta: "Get Started",
    href: "/login",
    featured: false,
  },
  {
    name: "Pro Runner",
    price: "$12",
    period: "/month",
    description: "For dedicated runners who want the full experience",
    features: [
      "Everything in Community",
      "Priority event registration",
      "Birthday month fee credits",
      "Advanced PR analytics",
      "Pacer request access",
      "Exclusive member events",
    ],
    cta: "Upgrade to Pro",
    href: "/login?tier=pro",
    featured: true,
  },
];

export default function MembershipPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#1E3A5F]">
            Join the Community
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[#1E3A5F]/70">
            All users are Peer Racing members. Creating or entering an event will 
            walk you through membership if needed.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="mb-16">
          <h2 className="mb-6 text-center font-display text-xl font-semibold text-[#1E3A5F]">
            Member Benefits
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="border-[#1E3A5F]/10 bg-white">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#E87722]/10">
                      <benefit.icon className="h-5 w-5 text-[#E87722]" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold text-[#1E3A5F]">
                        {benefit.title}
                      </h3>
                      <p className="mt-1 text-sm text-[#1E3A5F]/60 leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="mb-12">
          <h2 className="mb-6 text-center font-display text-xl font-semibold text-[#1E3A5F]">
            Choose Your Plan
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {membershipTiers.map((tier) => (
              <Card 
                key={tier.name} 
                className={`relative border-[#1E3A5F]/10 bg-white ${
                  tier.featured ? "border-[#E87722] ring-1 ring-[#E87722]" : ""
                }`}
              >
                {tier.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#E87722] text-white text-xs font-medium px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="font-display text-lg text-[#1E3A5F]">
                    {tier.name}
                  </CardTitle>
                  <CardDescription className="text-[#1E3A5F]/60">
                    {tier.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-5">
                    <span className="font-display text-3xl font-bold text-[#1E3A5F]">
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-[#1E3A5F]/60">{tier.period}</span>
                    )}
                  </div>
                  <ul className="mb-6 space-y-2">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#E87722]" />
                        <span className="text-sm text-[#1E3A5F]/70">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    asChild 
                    className={`w-full ${
                      tier.featured 
                        ? "bg-[#E87722] hover:bg-[#E87722]/90 text-white" 
                        : "border-[#1E3A5F]/20 text-[#1E3A5F] hover:bg-[#1E3A5F]/5"
                    }`}
                    variant={tier.featured ? "default" : "outline"}
                  >
                    <Link href={tier.href}>{tier.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQ or additional info */}
        <div className="border-t border-[#1E3A5F]/10 pt-10 text-center">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
            Questions?
          </h2>
          <p className="mt-3 text-[#1E3A5F]/60">
            Membership is automatically handled when you register for events.{" "}
            <Link href="/events" className="text-[#E87722] hover:underline">
              Browse upcoming races
            </Link>{" "}
            to get started.
          </p>
        </div>
      </main>
    </div>
  );
}
