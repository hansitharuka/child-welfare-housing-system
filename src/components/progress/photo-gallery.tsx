"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Modal } from "@/components/modal";
import type { Photo } from "@/server/stages/queries";

/**
 * STG-6: a stage's photo thumbnails. A thumbnail opens the full photo in a viewer, with buttons to
 * the previous and next photo and a link that opens it in a new tab. The files are protected (SEC-7),
 * so they come from our own /files route, never through Next's image optimizer.
 */
export function PhotoGallery({ photos, label }: { photos: Photo[]; label: string }) {
  const t = useTranslations("progress.photos");
  const [shown, setShown] = useState<number | null>(null);
  const photo = shown === null ? null : photos[shown];
  const count = photos.length;
  const titleId = `photo-${photos[0]?.id ?? "none"}-title`;

  return (
    <>
      <ul className="mt-1.5 flex flex-wrap gap-2" aria-label={label}>
        {photos.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setShown(index)}
              aria-label={t("open", { label, number: index + 1 })}
              className="block overflow-hidden rounded-lg border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/files/${item.id}/thumb`}
                alt=""
                loading="lazy"
                width={88}
                height={66}
                className="h-16.5 w-22 object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <Modal
        open={photo !== null && photo !== undefined}
        onClose={() => setShown(null)}
        labelledBy={titleId}
        size="photo"
      >
        {photo && shown !== null && (
          <>
            <div className="flex items-center justify-between gap-4">
              <h2 id={titleId} className="text-xl font-bold">
                {t("title", { label, number: shown + 1, count })}
              </h2>
              <button
                type="button"
                onClick={() => setShown(null)}
                className="h-11 shrink-0 rounded-lg border border-input px-4.5 font-semibold"
              >
                {t("close")}
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/files/${photo.id}`}
              alt={t("alt", { label, number: shown + 1 })}
              className="h-[min(calc(100vh-14rem),1067px)] w-full rounded-lg bg-muted object-contain"
            />
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShown((shown + count - 1) % count)}
                disabled={count < 2}
                className="h-11.5 rounded-lg border border-input px-4.5 font-semibold disabled:opacity-50"
              >
                ← {t("previous")}
              </button>
              <a
                href={`/files/${photo.id}`}
                target="_blank"
                rel="noopener"
                className="font-semibold text-primary underline"
              >
                {t("newTab")}
              </a>
              <button
                type="button"
                onClick={() => setShown((shown + 1) % count)}
                disabled={count < 2}
                className="h-11.5 rounded-lg border border-input px-4.5 font-semibold disabled:opacity-50"
              >
                {t("next")} →
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
