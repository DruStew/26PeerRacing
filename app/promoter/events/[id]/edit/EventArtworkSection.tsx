"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  removeEventArtwork,
  uploadEventArtwork,
  type ArtworkActionState,
} from "./event-artwork-actions";

const initialState: ArtworkActionState = null;

export function EventArtworkSection({
  eventId,
  artworkUrl,
}: {
  eventId: string;
  artworkUrl: string | null;
}) {
  const router = useRouter();
  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadEventArtwork,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeEventArtwork,
    initialState,
  );

  useEffect(() => {
    if (uploadState?.ok || removeState?.ok) {
      router.refresh();
    }
  }, [uploadState?.ok, removeState?.ok, router]);

  const uploadError = uploadState && !uploadState.ok ? uploadState.error : null;
  const removeError = removeState && !removeState.ok ? removeState.error : null;

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Race Artwork</h2>
      <p className="mt-1 text-sm text-[#1E3A5F]/70">
        Optional poster or banner image (JPEG, PNG, WebP, or GIF, up to 5 MB). Shown on the public
        race page and in the upcoming races list. For best results, create a portrait image 1080
        pixels wide x 1920 pixels high (1080x1920) for optimal viewing on a phone.
      </p>

      <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
        {artworkUrl ? (
          <div className="relative mb-6 overflow-hidden rounded-lg border border-[#1E3A5F]/10 bg-[#1E3A5F]/5">
            <div className="relative aspect-[21/9] w-full max-h-56 sm:max-h-72">
              <Image
                src={artworkUrl}
                alt="Race artwork preview"
                fill
                className="object-contain object-center"
                sizes="(max-width: 896px) 100vw, 896px"
              />
            </div>
          </div>
        ) : (
          <p className="mb-6 rounded-lg border border-dashed border-[#1E3A5F]/20 bg-white px-4 py-8 text-center text-sm text-[#1E3A5F]/60">
            No artwork uploaded yet.
          </p>
        )}

        <form action={uploadAction} className="space-y-3">
          <input type="hidden" name="event_id" value={eventId} />
          <div>
            <label htmlFor="event-artwork-file" className="text-sm font-medium text-[#1E3A5F]">
              {artworkUrl ? "Replace image" : "Upload image"}
            </label>
            <input
              id="event-artwork-file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="mt-1.5 block w-full text-sm text-[#1E3A5F] file:mr-4 file:rounded-md file:border-0 file:bg-[#E87722] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#E87722]/90"
            />
          </div>
          {uploadError ? (
            <p className="text-sm text-red-600" role="alert">
              {uploadError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={uploadPending}
            className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:opacity-60"
          >
            {uploadPending ? "Uploading…" : artworkUrl ? "Replace artwork" : "Upload artwork"}
          </button>
        </form>

        {artworkUrl ? (
          <form action={removeAction} className="mt-6 border-t border-[#1E3A5F]/10 pt-6">
            <input type="hidden" name="event_id" value={eventId} />
            {removeError ? (
              <p className="mb-3 text-sm text-red-600" role="alert">
                {removeError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={removePending}
              className="text-sm font-semibold text-[#1E3A5F]/70 underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-60"
            >
              {removePending ? "Removing…" : "Remove artwork"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
