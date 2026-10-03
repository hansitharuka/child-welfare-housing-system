"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";
import { FormError, FormField, FormTextArea } from "@/components/forms/form-field";
import { Modal } from "@/components/modal";
import { MAX_PHOTOS, PHOTO_ACCEPT, photoProblem, SNIFF_BYTES } from "@/lib/file-types";
import {
  type DayLimits,
  NOTE_ONLY,
  parseStageForm,
  type ProgressErrorKey,
  type StageField,
} from "@/lib/validation/progress";
import type { PhotoUploadError, UploadedFile } from "@/server/files/uploads";
import type { ProgressAction } from "./types";

type PhotoProblem = PhotoUploadError | "tooManyPhotos" | "fileFailed";

/** A photo chosen in this form. Once uploaded, it joins the update when the form is saved. */
type Photo = {
  key: number;
  name: string;
  state: "uploading" | "done" | "refused";
  id?: string;
  problem?: PhotoProblem;
};

export type PhotoUpload = (
  form: FormData,
) => Promise<{ ok: true; value: UploadedFile } | { ok: false; error: PhotoUploadError }>;

/**
 * STG-1, STG-2: the DS office's "update building progress" pop-up, as in the prototype. It offers the
 * stages after the current one, saying which stages a choice further ahead also marks (STG-2), or a
 * note-only visit. Photos are checked in the browser and uploaded one by one as soon as they are
 * chosen, so a wrong file is refused on its own (ERR-5); the server checks and cleans each one (STG-3).
 */
export function StageUpdate({
  caseId,
  version,
  choices,
  limits,
  today,
  buttonLabel,
  action,
  upload,
}: {
  caseId: string;
  version: number;
  /** The active stages after the current one, in order. Empty: only a note can be added (STG-4). */
  choices: { id: number; name: string }[];
  /** From stageLimits(). */
  limits: DayLimits;
  today: string;
  buttonLabel: string;
  action: ProgressAction;
  upload: PhotoUpload;
}) {
  const t = useTranslations("progress");
  const [state, dispatch, pending] = useActionState(action, { error: null, errors: {} });
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<StageField, string>>({
    stageId: choices.length === 0 ? NOTE_ONLY : "",
    visitedOn: today,
    note: "",
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const [checkErrors, setCheckErrors] = useState<Partial<Record<StageField, ProgressErrorKey>> | null>(null);
  const errors: Partial<Record<StageField, ProgressErrorKey>> = checkErrors ?? state.errors;

  const kept = photos.filter((p) => p.state !== "refused").length;
  const uploading = photos.some((p) => p.state === "uploading");
  const update = (key: number, change: Partial<Photo>) =>
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)));

  async function choose(files: File[]) {
    let room = MAX_PHOTOS - kept;
    for (const file of files) {
      nextKey.current += 1;
      const key = nextKey.current;
      const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
      const problem: PhotoProblem | null = room <= 0 ? "tooManyPhotos" : photoProblem(file.size, head);
      if (problem) {
        setPhotos((list) => [...list, { key, name: file.name, state: "refused", problem }]);
        continue;
      }
      room -= 1;
      setPhotos((list) => [...list, { key, name: file.name, state: "uploading" }]);
      const form = new FormData();
      form.set("file", file);
      try {
        const result = await upload(form);
        update(
          key,
          result.ok
            ? { state: "done", id: result.value.id, name: result.value.name }
            : { state: "refused", problem: result.error },
        );
      } catch {
        update(key, { state: "refused", problem: "fileFailed" });
      }
    }
  }

  function submit() {
    const checked = parseStageForm((field) => values[field], limits);
    if (!checked.ok) {
      setCheckErrors(checked.errors);
      return;
    }
    setCheckErrors(null);
    const form = new FormData();
    form.set("caseId", caseId);
    form.set("version", String(version));
    for (const [field, value] of Object.entries(values)) form.set(field, value);
    for (const photo of photos) if (photo.state === "done" && photo.id) form.append("photoId", photo.id);
    startTransition(() => dispatch(form));
  }

  const set = (field: StageField) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));
  const errorText = (field: StageField) => {
    const key = errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };
  const options = [
    ...choices.map((choice, index) => ({
      value: String(choice.id),
      label: choice.name,
      skips: index > 0 ? choices.slice(0, index).map((c) => c.name) : [],
    })),
    { value: NOTE_ONLY, label: t("stages.noteOnly"), skips: [] },
  ];
  const stageError = errorText("stageId");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12.5 rounded-lg bg-primary px-5 text-[17px] font-bold text-primary-foreground"
      >
        {buttonLabel}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="stage-update-title" size="wide">
        <h2 id="stage-update-title" className="text-[22px] font-bold">
          {t("stages.dialogTitle")}
        </h2>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4"
        >
          <fieldset aria-describedby={stageError ? "stage-choice-error" : undefined} className="flex flex-col gap-2">
            <legend className="mb-1.5 text-base font-semibold">{t("stages.stage")}</legend>
            {options.map((option) => (
              <label
                key={option.value}
                className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border-2 px-4 py-2.5 ${
                  values.stageId === option.value ? "border-primary bg-accent" : "border-border bg-card"
                }`}
              >
                <input
                  type="radio"
                  name="stageId"
                  value={option.value}
                  checked={values.stageId === option.value}
                  onChange={set("stageId")}
                  className="mt-1 size-5 accent-primary"
                />
                <span className="flex flex-col">
                  <span
                    className="text-[17px] font-semibold"
                    data-testid={option.value === NOTE_ONLY ? undefined : "stage-choice"}
                  >
                    {option.label}
                  </span>
                  {option.skips.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t("stages.skips", { stages: option.skips.join(", ") })}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {stageError && (
              <p id="stage-choice-error" className="text-[15px] font-medium text-destructive">
                {stageError}
              </p>
            )}
          </fieldset>
          <FormField
            id="stage-visitedOn"
            type="date"
            label={t("stages.visitedOn")}
            help={t("stages.visitedOnHelp")}
            max={limits.latest ?? undefined}
            value={values.visitedOn}
            onChange={set("visitedOn")}
            error={errorText("visitedOn")}
          />
          <FormTextArea
            id="stage-note"
            label={t("stages.note")}
            value={values.note}
            onChange={set("note")}
            error={errorText("note")}
          />

          <div className="flex flex-col gap-2">
            <span className="text-base font-semibold">{t("stages.photos")}</span>
            <span className="text-sm text-muted-foreground">{t("stages.photosHelp")}</span>
            {photos.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label={t("stages.photos")}>
                {photos.map((photo) => (
                  <li
                    key={photo.key}
                    className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 ${
                      photo.state === "refused" ? "border-destructive bg-destructive/5" : ""
                    }`}
                  >
                    {photo.state === "done" && photo.id && (
                      // A protected file, served by our own route, so not through Next's image optimizer.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/files/${photo.id}/thumb`}
                        alt=""
                        className="h-12 w-16 rounded bg-muted object-cover"
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{photo.name}</span>
                      <span
                        className={`text-sm ${photo.state === "refused" ? "font-medium text-destructive" : "text-muted-foreground"}`}
                      >
                        {photo.state === "uploading" && t("stages.uploading")}
                        {photo.state === "done" && t("stages.uploaded")}
                        {photo.state === "refused" && photo.problem && t(`errors.${photo.problem}`)}
                      </span>
                    </span>
                    {photo.state !== "uploading" && (
                      <button
                        type="button"
                        onClick={() => setPhotos((list) => list.filter((p) => p.key !== photo.key))}
                        aria-label={t("stages.removePhotoLabel", { name: photo.name })}
                        className="h-10 shrink-0 rounded-lg border border-input px-3.5 text-[15px] font-semibold"
                      >
                        {t("stages.removePhoto")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept={PHOTO_ACCEPT}
              data-testid="photo-input"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                // Clearing the picker lets the same photo be chosen again after it is removed.
                event.target.value = "";
                void choose(files);
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={kept >= MAX_PHOTOS}
              className="h-11.5 self-start rounded-lg border border-primary px-4 font-semibold text-primary disabled:opacity-50"
            >
              {t("stages.addPhotos")}
            </button>
          </div>

          {checkErrors === null && state.error && (
            <FormError id="stage-update-error" message={t(`errors.${state.error}`)} />
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 rounded-lg border border-input px-6 text-[17px] font-semibold"
            >
              {t("stages.cancel")}
            </button>
            <button
              type="submit"
              disabled={pending || uploading}
              className="h-12 rounded-lg bg-primary px-6.5 text-[17px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {pending ? t("stages.working") : t("stages.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
