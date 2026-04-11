"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Home() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate submission
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Image
            src="/images/pr-logo.png"
            alt="Peer Racing Logo"
            width={300}
            height={150}
            className="h-auto w-auto max-w-[280px] sm:max-w-[320px]"
            priority
          />
        </div>

        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#1E3A5F] mb-6">
            Welcome to Peer Racing
          </h1>
          <p className="text-[#1E3A5F]/80 text-base sm:text-lg leading-relaxed max-w-3xl mx-auto">
            Where racers of every pace find their place. Whether you&apos;re a seasoned racer, 
            a determined enthusiast, a resilient challenger, an ambitious achiever, or someone 
            just starting your journey, we&apos;re here to celebrate your unique path. At Peer Racing, 
            it&apos;s not about how fast you race; it&apos;s about embracing your pace and enjoying the journey. 
            Stride with us and discover a community that&apos;s by your side, stride for stride, stroke for stroke.
          </p>
          <p className="text-[#1E3A5F]/80 text-base sm:text-lg leading-relaxed max-w-3xl mx-auto mt-4">
            Together, we&apos;re redefining what it means to win in the world of racing, offering podiums, 
            cash payouts, prizes, and the thrill of achievement to racers of all levels. 
            Set your pace, win your way - with Peer Racing.
          </p>
        </div>

        {/* Entry Form */}
        {submitted ? (
          <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/20 rounded-lg p-8 text-center">
            <div className="w-16 h-16 bg-[#E87722] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-bold text-[#1E3A5F] mb-2">Entry Submitted!</h2>
            <p className="text-[#1E3A5F]/70">Thank you for your entry. We&apos;ll be in touch soon.</p>
            <Button 
              onClick={() => setSubmitted(false)} 
              className="mt-6 bg-[#E87722] hover:bg-[#E87722]/90 text-white"
            >
              Submit Another Entry
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Info Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-[#1E3A5F]">First Name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  required
                  placeholder="First Name"
                  className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-[#1E3A5F]">Last Name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  required
                  placeholder="Last Name"
                  className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dob" className="text-[#1E3A5F]">DOB</Label>
                <Input
                  id="dob"
                  name="dob"
                  type="date"
                  required
                  className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender" className="text-[#1E3A5F]">Gender</Label>
                <Select name="gender" required>
                  <SelectTrigger className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]">
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non-binary">Non-Binary</SelectItem>
                    <SelectItem value="prefer-not">Prefer Not to Say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#1E3A5F]">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="Email"
                  className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[#1E3A5F]">Phone Number</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="Phone Number"
                  className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                />
              </div>
            </div>

            {/* Event Info */}
            <div className="border-t border-[#1E3A5F]/10 pt-6 mt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="eventName" className="text-[#1E3A5F]">Event Name</Label>
                  <Select name="eventName" required>
                    <SelectTrigger className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]">
                      <SelectValue placeholder="Select Event" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="180-fun-run">180 Fun Run</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfRun" className="text-[#1E3A5F]">Date of Run</Label>
                  <Input
                    id="dateOfRun"
                    name="dateOfRun"
                    type="date"
                    required
                    className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="finishTime" className="text-[#1E3A5F]">Finish Time (hh:mm:ss)</Label>
                <Input
                  id="finishTime"
                  name="finishTime"
                  placeholder="00:00:00"
                  required
                  className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heartRate" className="text-[#1E3A5F]">Ave Heart Rate (BPM)</Label>
                <Input
                  id="heartRate"
                  name="heartRate"
                  type="number"
                  placeholder="Average Heart Rate"
                  className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="distance" className="text-[#1E3A5F]">Distance</Label>
              <Select name="distance" required>
                <SelectTrigger className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722]">
                  <SelectValue placeholder="Select Distance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5k">5K</SelectItem>
                  <SelectItem value="10k">10K</SelectItem>
                  <SelectItem value="half">Half Marathon</SelectItem>
                  <SelectItem value="full">Full Marathon</SelectItem>
                  <SelectItem value="18-miles">18 Miles</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Screenshot Upload */}
            <div className="space-y-2">
              <Label htmlFor="screenshot" className="text-[#1E3A5F]">
                Attach Screenshot Proof of your Activity
              </Label>
              <p className="text-sm text-[#1E3A5F]/60 mb-2">Must match your other inputs</p>
              <Input
                id="screenshot"
                name="screenshot"
                type="file"
                accept="image/*"
                className="border-[#1E3A5F]/20 focus:border-[#E87722] focus:ring-[#E87722] file:bg-[#1E3A5F] file:text-white file:border-0 file:rounded file:px-4 file:py-2 file:mr-4 file:cursor-pointer"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto bg-[#E87722] hover:bg-[#E87722]/90 text-white font-semibold py-6 px-12 text-lg"
              >
                {isSubmitting ? "Submitting..." : "Enter Now"}
              </Button>
            </div>
          </form>
        )}

        {/* Additional Navigation */}
        <div className="mt-16 pt-8 border-t border-[#1E3A5F]/10">
          <div className="flex flex-wrap justify-center gap-6">
            <Link 
              href="/events" 
              className="text-[#1E3A5F] hover:text-[#E87722] font-medium transition-colors"
            >
              View All Events
            </Link>
            <Link 
              href="/membership" 
              className="text-[#1E3A5F] hover:text-[#E87722] font-medium transition-colors"
            >
              Membership
            </Link>
            <Link 
              href="/login" 
              className="text-[#1E3A5F] hover:text-[#E87722] font-medium transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1E3A5F]/10 bg-white mt-12">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <p className="text-center text-sm text-[#1E3A5F]/60">
            Peer Racing - Set your pace, win your way
          </p>
        </div>
      </footer>
    </div>
  );
}
