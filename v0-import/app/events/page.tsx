import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Timer, ChevronLeft, ChevronRight } from "lucide-react";

// Mock data for development - replace with actual Supabase call
const mockEvents = [
  {
    id: "1",
    name: "Spring Marathon Classic",
    city: "Austin",
    state: "TX",
    race_date: "2026-04-15",
    pr_cutoff: "3:30:00",
  },
  {
    id: "2", 
    name: "Hill Country Half Marathon",
    city: "San Antonio",
    state: "TX",
    race_date: "2026-04-22",
    pr_cutoff: "1:45:00",
  },
  {
    id: "3",
    name: "Texas 10K Championship",
    city: "Houston",
    state: "TX", 
    race_date: "2026-05-01",
    pr_cutoff: "0:45:00",
  },
  {
    id: "4",
    name: "Bluebonnet 5K Fun Run",
    city: "Dallas",
    state: "TX",
    race_date: "2026-05-08",
    pr_cutoff: "0:25:00",
  },
];

const PAGE_SIZE = 10;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page ?? "1"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // For now, use mock data
  // TODO: Replace with actual Supabase call when connected
  const events = mockEvents.slice(from, to + 1);
  const count = mockEvents.length;
  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#1E3A5F]">
            Upcoming Events
          </h1>
          <p className="mt-3 text-[#1E3A5F]/70">
            Find your next race and register today
          </p>
        </div>

        {/* Events List */}
        <div className="space-y-4">
          {events?.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`}>
              <Card className="group border-[#1E3A5F]/10 bg-white hover:border-[#E87722]/50 transition-all">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1">
                      {/* Event Name */}
                      <h2 className="font-display text-xl font-semibold text-[#1E3A5F] group-hover:text-[#E87722] transition-colors">
                        {event.name}
                      </h2>
                      
                      {/* Event Details */}
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[#1E3A5F]/70">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-[#E87722]" />
                          <span>{formatDate(event.race_date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-[#E87722]" />
                          <span>{event.city}, {event.state}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Timer className="h-4 w-4 text-[#E87722]" />
                          <span>Entry deadline: {event.pr_cutoff}</span>
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      className="bg-[#E87722] hover:bg-[#E87722]/90 text-white shrink-0"
                    >
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Empty State */}
        {(!events || events.length === 0) && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Calendar className="h-12 w-12 text-[#1E3A5F]/30" />
            <h3 className="mt-4 font-display text-lg font-semibold text-[#1E3A5F]">
              No events found
            </h3>
            <p className="mt-2 text-[#1E3A5F]/60">
              Check back soon for upcoming races
            </p>
          </div>
        )}

        {/* Pagination */}
        {events && events.length > 0 && (
          <div className="mt-10 flex items-center justify-center gap-4">
            {page > 1 && (
              <Button asChild variant="outline" size="sm" className="border-[#1E3A5F]/20 text-[#1E3A5F]">
                <Link href={`/events?page=${page - 1}`} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Link>
              </Button>
            )}
            
            <span className="text-sm text-[#1E3A5F]/60">
              Page {page} of {totalPages}
            </span>
            
            {page < totalPages && (
              <Button asChild variant="outline" size="sm" className="border-[#1E3A5F]/20 text-[#1E3A5F]">
                <Link href={`/events?page=${page + 1}`} className="gap-1">
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
