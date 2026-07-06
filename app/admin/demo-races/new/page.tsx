import Link from "next/link";

import { DemoEventCreateForm } from "./DemoEventCreateForm";

export default function NewDemoRacePage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-12">
      <Link href="/admin/demo-races" className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]">
        ← Demo races
      </Link>
      <h1 className="font-display mt-6 text-3xl font-bold text-[#1E3A5F]">Create demo race</h1>
      <p className="mt-2 text-sm text-[#1E3A5F]/75">
        Same setup as a real event — then import participants without accounts and preview results.
      </p>
      <div className="mt-8">
        <DemoEventCreateForm />
      </div>
    </main>
  );
}
