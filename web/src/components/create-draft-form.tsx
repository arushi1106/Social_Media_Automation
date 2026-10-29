"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generateStudioDraft, saveStudioDraft } from "@/app/studio/actions";
import { markIdeaUsed } from "@/app/studio/ideas/actions";
import { markPlanItemDrafted } from "@/app/studio/planner/actions";
import { isExpiredSessionMessage } from "@/lib/api-auth";
import { formatPlatform, type BrandDraft, type Platform } from "@/lib/brand";
import type { ContentPillar } from "@/lib/pillars";
import {
  emptyCreateForm,
  flattenGeneratedText,
  formatLabel,
  formatsForPlatform,
  validateCreateForm,
  type CreateFieldErrors,
  type CreateFormState,
  type GeneratedContent,
} from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DraftPreview } from "@/components/draft-preview";

export function CreateDraftForm({
  brand,
  pillars = [],
  initialForm,
  pillarUnavailable = false,
  ideaId,
  planItemId,
}: {
  brand: BrandDraft;
  pillars?: ContentPillar[];
  initialForm?: CreateFormState;
  pillarUnavailable?: boolean;
  ideaId?: string;
  planItemId?: string;
}) {
  const router = useRouter();
  const allowed = brand.platforms.length ? brand.platforms : (["linkedin"] as Platform[]);
  const [form, setForm] = useState<CreateFormState>(
    () => initialForm ?? emptyCreateForm(allowed, brand.preferredPlatform),
  );
  const [errors, setErrors] = useState<CreateFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"generate" | "save" | null>(null);
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [copied, setCopied] = useState(false);

  const formatOptions = useMemo(() => formatsForPlatform(form.platform), [form.platform]);
  const selectedPillar = pillars.find((item) => item.id === form.pillarId) ?? null;

  function update<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "platform") {
        const nextFormats = formatsForPlatform(value as Platform);
        if (!nextFormats.includes(next.format as (typeof nextFormats)[number])) {
          next.format = nextFormats[0] ?? "";
        }
      }
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function onGenerate() {
    const fieldErrors = validateCreateForm(form, allowed);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setPending("generate");
    setMessage(null);
    setCopied(false);
    try {
      const response = await generateStudioDraft(form);
      if (!response.ok) {
        if (isExpiredSessionMessage(response.message)) {
          router.push("/login?next=/studio/create");
          router.refresh();
          return;
        }
        setMessage(response.message);
        if (response.fieldErrors) setErrors(response.fieldErrors);
        return;
      }
      setResult(response.content);
      if (selectedPillar) {
        setForm((current) => ({
          ...current,
          pillarId: selectedPillar.id,
          pillarName: selectedPillar.name,
          pillarDescription: selectedPillar.description,
        }));
      }
    } catch {
      setMessage("Generation failed. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function onSave() {
    if (!result) return;
    setPending("save");
    setMessage(null);
    try {
      const response = await saveStudioDraft(result, form);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      if (ideaId) {
        await markIdeaUsed(ideaId);
      }
      if (planItemId) {
        await markPlanItemDrafted(planItemId, response.id);
      }
      router.push(`/studio/drafts/${response.id}`);
      router.refresh();
    } catch {
      setMessage("Could not save the draft.");
    } finally {
      setPending(null);
    }
  }

  async function onCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(flattenGeneratedText(result));
    setCopied(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="font-serif text-2xl">New draft</h2>
        <p className="mt-2 text-sm text-ink/70">
          Uses {brand.name || "your brand"} voice. Nothing is posted to social networks.
          {ideaId
            ? " This brief was loaded from a saved idea. The idea is marked used only after you save a draft."
            : null}
          {planItemId ? " Saving will mark the planner slot as drafted, not published." : null}
        </p>
        <div className="mt-6 space-y-5">
          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
              Platform
            </legend>
            <div className="flex flex-wrap gap-2">
              {allowed.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  aria-pressed={form.platform === platform}
                  onClick={() => update("platform", platform)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    form.platform === platform
                      ? "border-accent bg-accent/10"
                      : "border-ink/15"
                  }`}
                >
                  {formatPlatform(platform)}
                </button>
              ))}
            </div>
            {errors.platform ? (
              <p className="mt-1.5 text-sm text-accent" role="alert">
                {errors.platform}
              </p>
            ) : null}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
              Format
            </legend>
            <div className="flex flex-wrap gap-2">
              {formatOptions.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={form.format === item}
                  onClick={() => update("format", item)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    form.format === item ? "border-accent bg-accent/10" : "border-ink/15"
                  }`}
                >
                  {formatLabel(item)}
                </button>
              ))}
            </div>
            {errors.format ? (
              <p className="mt-1.5 text-sm text-accent" role="alert">
                {errors.format}
              </p>
            ) : null}
          </fieldset>
          <div>
            <Label htmlFor="pillar">Content pillar (optional)</Label>
            {pillars.length === 0 ? (
              <p className="text-sm leading-6 text-ink/70">
                No saved pillars yet. Generation still works from your topic and brand.{" "}
                <Link href="/studio/brand" className="underline underline-offset-2">
                  Add pillars in Brand settings
                </Link>
                .
              </p>
            ) : (
              <>
                <select
                  id="pillar"
                  className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                  value={form.pillarId}
                  aria-invalid={Boolean(errors.pillarId)}
                  onChange={(event) => update("pillarId", event.target.value)}
                >
                  <option value="">No pillar — use topic and brand only</option>
                  {pillars.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {selectedPillar ? (
                  <p className="mt-1.5 text-sm leading-6 text-ink/70">{selectedPillar.description}</p>
                ) : (
                  <p className="mt-1.5 text-sm leading-6 text-ink/70">
                    Choose a saved theme or leave this blank. Nothing is selected by default.
                  </p>
                )}
              </>
            )}
            {pillarUnavailable && !form.pillarId ? (
              <p className="mt-1.5 text-sm text-accent" role="alert">
                That content pillar is no longer available. Choose another or continue without
                one. Nothing else was substituted.
              </p>
            ) : null}
            {errors.pillarId ? (
              <p className="mt-1.5 text-sm text-accent" role="alert">
                {errors.pillarId}
              </p>
            ) : null}
            <p className="mt-1.5 text-xs leading-5 text-ink/55">
              Pillars guide content direction. They do not guarantee engagement or performance.
            </p>
          </div>
          <div>
            <Label htmlFor="topic">Topic or brief</Label>
            <Textarea
              id="topic"
              required
              rows={4}
              value={form.topic}
              aria-invalid={Boolean(errors.topic)}
              onChange={(event) => update("topic", event.target.value)}
            />
            {errors.topic ? (
              <p className="mt-1.5 text-sm text-accent" role="alert">
                {errors.topic}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="key-points">Key points (optional)</Label>
            <Textarea
              id="key-points"
              rows={3}
              value={form.keyPoints}
              onChange={(event) => update("keyPoints", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cta">Call to action (optional)</Label>
            <Input
              id="cta"
              value={form.callToAction}
              onChange={(event) => update("callToAction", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="keywords">Keywords or hashtags (optional)</Label>
            <Input
              id="keywords"
              value={form.keywords}
              onChange={(event) => update("keywords", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="extra">Additional instructions (optional)</Label>
            <Textarea
              id="extra"
              rows={3}
              value={form.extraInstructions}
              onChange={(event) => update("extraInstructions", event.target.value)}
            />
          </div>
          <Button type="button" onClick={onGenerate} disabled={pending !== null}>
            {pending === "generate" ? "Generating…" : result ? "Regenerate" : "Generate draft"}
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        {message ? (
          <p className="text-sm text-accent" role="alert">
            {message}
          </p>
        ) : null}
        {pending === "generate" ? (
          <Card>
            <p className="text-sm text-ink/70">Writing a draft in your brand voice…</p>
          </Card>
        ) : null}
        {result ? (
          <>
            <DraftPreview content={result} />
            <Card>
              <Label htmlFor="edit-body">Edit before saving</Label>
              {result.format === "script" && result.script ? (
                <div className="space-y-3">
                  <Textarea
                    aria-label="Hook"
                    rows={2}
                    value={result.script.hook}
                    onChange={(event) =>
                      setResult({
                        ...result,
                        script: { ...result.script!, hook: event.target.value },
                      })
                    }
                  />
                  <Textarea
                    aria-label="Body"
                    rows={4}
                    value={result.script.body}
                    onChange={(event) =>
                      setResult({
                        ...result,
                        script: { ...result.script!, body: event.target.value },
                      })
                    }
                  />
                  <Textarea
                    aria-label="Call to action"
                    rows={2}
                    value={result.script.cta}
                    onChange={(event) =>
                      setResult({
                        ...result,
                        script: { ...result.script!, cta: event.target.value },
                      })
                    }
                  />
                </div>
              ) : result.format === "carousel" ? (
                <div className="space-y-3">
                  {result.slides.map((slide, index) => (
                    <Textarea
                      key={index}
                      aria-label={`Slide ${index + 1}`}
                      rows={3}
                      value={`${slide.title ? `${slide.title}\n` : ""}${slide.text}`}
                      onChange={(event) => {
                        const [title, ...rest] = event.target.value.split("\n");
                        const next = [...result.slides];
                        next[index] = {
                          title: rest.length ? title : "",
                          text: rest.length ? rest.join("\n") : title,
                        };
                        setResult({ ...result, slides: next });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Textarea
                  id="edit-body"
                  rows={10}
                  value={result.body}
                  onChange={(event) => setResult({ ...result, body: event.target.value })}
                />
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={onSave} disabled={pending !== null}>
                  {pending === "save" ? "Saving…" : "Save as draft"}
                </Button>
                <Button type="button" variant="ghost" onClick={onCopy} disabled={pending !== null}>
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onGenerate}
                  disabled={pending !== null}
                >
                  {pending === "generate" ? "Generating…" : "Regenerate"}
                </Button>
              </div>
            </Card>
          </>
        ) : (
          <Card>
            <p className="text-sm leading-6 text-ink/70">
              Generated copy will appear here so you can edit it before saving. Saved drafts stay
              in your account. They are never auto-published.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
