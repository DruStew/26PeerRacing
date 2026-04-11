import { MemberRoleToggles } from "@/components/admin/MemberRoleToggles";
import { GLOBAL_ROLE_SCOPE_ID } from "@/lib/admin/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function hasGlobalRole(
  roleRows: { role: string; scope_event_id: string | null }[],
  role: string,
): boolean {
  return roleRows.some(
    (r) =>
      r.role === role &&
      (r.scope_event_id == null || r.scope_event_id === GLOBAL_ROLE_SCOPE_ID),
  );
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const supabase = await createServerSupabaseClient();

  let list: {
    id: unknown;
    first_name: unknown;
    last_name: unknown;
    email: unknown;
    phone: unknown;
    hometown: unknown;
    home_state: unknown;
    zip: unknown;
    created_at: unknown;
  }[] = [];

  if (query.length !== 1) {
    let profileReq = supabase
      .from("profiles")
      .select("id,first_name,last_name,email,phone,hometown,home_state,zip,created_at")
      .order("created_at", { ascending: false })
      .limit(75);

    if (query.length >= 2) {
      const safe = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
      profileReq = profileReq.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,hometown.ilike.%${safe}%,home_state.ilike.%${safe}%,zip.ilike.%${safe}%`,
      );
    }

    const { data: profiles, error } = await profileReq;

    if (error) {
      throw new Error(error.message);
    }
    list = profiles ?? [];
  }
  const ids = list.map((p) => p.id as string);

  const rolesByUser = new Map<string, { role: string; scope_event_id: string | null }[]>();
  if (ids.length > 0) {
    const { data: roleRows } = await supabase
      .from("roles")
      .select("user_id,role,scope_event_id")
      .in("user_id", ids);

    for (const r of roleRows ?? []) {
      const uid = r.user_id as string;
      const arr = rolesByUser.get(uid) ?? [];
      arr.push({
        role: r.role as string,
        scope_event_id: r.scope_event_id as string | null,
      });
      rolesByUser.set(uid, arr);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        Admin
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        Members & Roles
      </h1>
      <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
        Search by name or email. Toggle admin, promoter, or race check-in (the{" "}
        <code className="rounded bg-[#1E3A5F]/10 px-1 py-0.5 text-xs">booth</code> role in the
        database). Updates sync to Supabase <code className="rounded bg-[#1E3A5F]/10 px-1 py-0.5 text-xs">roles</code>{" "}
        for global access.
      </p>

      <form method="get" className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="member-q" className="text-sm font-medium text-[#1E3A5F]">
            Search
          </label>
          <input
            id="member-q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="First name, last name, or email (2+ characters)"
            className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] shadow-sm placeholder:text-[#1E3A5F]/40 focus:border-[#E87722] focus:outline-none focus:ring-1 focus:ring-[#E87722]"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
        >
          Search
        </button>
      </form>

      {query.length === 1 ? (
        <p className="mt-6 text-sm text-amber-800">
          Enter at least two characters to search.
        </p>
      ) : null}

      {query.length === 0 ? (
        <p className="mt-4 text-sm text-[#1E3A5F]/60">
          Showing the most recently created profiles (up to 75). Use search to narrow down.
        </p>
      ) : null}

      <ul className="mt-8 space-y-6">
        {list.map((p) => {
          const id = p.id as string;
          const rr = rolesByUser.get(id) ?? [];
          const initial = {
            admin: hasGlobalRole(rr, "admin"),
            promoter: hasGlobalRole(rr, "promoter"),
            booth: hasGlobalRole(rr, "booth"),
          };
          const name =
            [p.first_name, p.last_name].filter(Boolean).join(" ") || (p.email as string) || id;

          return (
            <li
              key={id}
              className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-5 shadow-sm sm:p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">{name}</h2>
                  <p className="mt-1 font-mono text-xs text-[#1E3A5F]/55">{id}</p>
                  <div className="mt-3 space-y-1 text-sm text-[#1E3A5F]/85">
                    {p.email ? (
                      <p>
                        <span className="text-[#1E3A5F]/55">Email: </span>
                        <a href={`mailto:${p.email}`} className="font-medium text-[#E87722] hover:underline">
                          {String(p.email)}
                        </a>
                      </p>
                    ) : null}
                    {p.phone ? (
                      <p>
                        <span className="text-[#1E3A5F]/55">Phone: </span>
                        {String(p.phone)}
                      </p>
                    ) : null}
                    {[p.hometown, p.home_state, p.zip].some(Boolean) ? (
                      <p>
                        <span className="text-[#1E3A5F]/55">Location: </span>
                        {[p.hometown, p.home_state, p.zip].filter(Boolean).join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="w-full shrink-0 lg:max-w-sm">
                  <h3 className="text-sm font-semibold text-[#1E3A5F]">Roles</h3>
                  <MemberRoleToggles userId={id} initial={initial} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {list.length === 0 ? (
        <p className="mt-8 text-sm text-[#1E3A5F]/65">
          No profiles match. Try a different search.
        </p>
      ) : null}
    </main>
  );
}
