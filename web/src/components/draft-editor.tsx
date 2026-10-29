"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  generateStudioHooks,
  generateStudioVariations,
  refineStudioDraft,
  repurposeStudioDraft,
  reviewStudioDraft,
  saveStudioDraft,
  updateStudioDraft,
} from "@/app/studio/actions";
import { QualityReviewSection } from "@/components/quality-review";
import type { QualityReview } from "@/lib/quality";
import { isExpiredSessionMessage } from "@/lib/api-auth";
import { formatPlatform } from "@/lib/brand";
import {
  contentEquals,
  flattenGeneratedText,
  formatLabel,
  type CreateFormState,
  type GeneratedContent,
} from "@/lib/content";
import {
  REFINE_ACTIONS,
  REFINE_ACTION_LABELS,
  defaultRepurposeTarget,
  editorStatusLabel,
  inputsForRepurposedDraft,
  supportedRepurposeOptions,
  type RefineAction,
} from "@/lib/refine";
import {
  VARIATION_ANGLES,
  VARIATION_ANGLE_LABELS,
  applyHookToContent,
  hookAngleLabel,
  labelsForVariationAngle,
  variationDifference,
  type HookOption,
  type VariationAngle,
} from "@/lib/variations";
import { rememberLastDraftId } from "@/lib/studio-session";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DraftPreview } from "@/components/draft-preview";

type Pending = "save" | "refine" | "variations" | "hooks" | "repurpose" | "save-new" | "review" | null;

export function DraftEditor({
  draftId,
  initial,
  inputs,
}: {
  draftId: string;
  initial: GeneratedContent;
  inputs: CreateFormState;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [working, setWorking] = useState(initial);
  const [proposal, setProposal] = useState<GeneratedContent | null>(null);
  const [alternatives, setAlternatives] = useState<GeneratedContent[] | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState<number | null>(null);
  const [variationAngle, setVariationAngle] = useState<VariationAngle>("mixed");
  const [resultAngle, setResultAngle] = useState<VariationAngle>("mixed");
  const [hooks, setHooks] = useState<HookOption[] | null>(null);
  const [selectedHook, setSelectedHook] = useState<number | null>(null);
  const [repurposeResult, setRepurposeResult] = useState<GeneratedContent | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [target, setTarget] = useState(() => defaultRepurposeTarget(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [copied, setCopied] = useState(false);
  const [review, setReview] = useState<QualityReview | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const busy = pending !== null;
  const savedEqualsWorking = contentEquals(saved, working);
  const status = editorStatusLabel({
    savedEqualsWorking,
    hasProposal: Boolean(proposal),
    hasAlternatives: Boolean(alternatives?.length),
    hasHooks: Boolean(hooks?.length),
  });
  const alternativeLabels = labelsForVariationAngle(resultAngle);
  const repurposeOptions = useMemo(() => supportedRepurposeOptions(saved), [saved]);
  const leaveGuard = !savedEqualsWorking || Boolean(proposal || alternatives?.length || hooks?.length || repurposeResult);

  useEffect(() => {
    rememberLastDraftId(draftId);
  }, [draftId]);

  useEffect(() => {
    if (!leaveGuard) return;
    function onLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [leaveGuard]);

  function handleExpired(text: string) {
    if (isExpiredSessionMessage(text)) {
      router.push(`/login?next=/studio/drafts/${draftId}`);
      router.refresh();
      return true;
    }
    return false;
  }

  async function onSave() {
    setPending("save");
    setMessage(null);
    try {
      const result = await updateStudioDraft(draftId, working, inputs);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setSaved(working);
      setProposal(null);
      setAlternatives(null);
      setHooks(null);
      setSelectedHook(null);
      setMessage("Draft saved.");
      router.refresh();
    } catch {
      setMessage("Could not save this draft.");
    } finally {
      setPending(null);
    }
  }

  async function onCopy() {
    await navigator.clipboard.writeText(flattenGeneratedText(working));
    setCopied(true);
  }

  async function runReview() {
    setPending("review");
    setReviewError(null);
    try {
      const result = await reviewStudioDraft(saved);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setReviewError(result.message);
        return;
      }
      setReview(result.review);
    } catch {
      setReviewError("Could not review this draft. The saved copy is unchanged.");
    } finally {
      setPending(null);
    }
  }

  async function runRefine(action: RefineAction) {
    setPending("refine");
    setMessage(null);
    try {
      const result = await refineStudioDraft(working, action, customInstructions, inputs);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setProposal(result.content);
      setAlternatives(null);
      setHooks(null);
      setRepurposeResult(null);
      setMessage("Rewrite ready. Apply it to the editor before saving.");
    } catch {
      setMessage("Rewrite failed. Your current draft is unchanged.");
    } finally {
      setPending(null);
    }
  }

  async function runVariations() {
    setPending("variations");
    setMessage(null);
    try {
      const result = await generateStudioVariations(working, customInstructions, inputs, variationAngle);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setAlternatives(result.alternatives);
      setResultAngle(variationAngle);
      setSelectedAlternative(null);
      setProposal(null);
      setHooks(null);
      setRepurposeResult(null);
      setMessage("Select an alternative, then apply it. The editor and saved draft are unchanged.");
    } catch {
      setMessage("Could not generate alternatives. Your current draft is unchanged.");
    } finally {
      setPending(null);
    }
  }

  async function runHooks() {
    setPending("hooks");
    setMessage(null);
    try {
      const result = await generateStudioHooks(working, customInstructions, inputs);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setHooks(result.hooks);
      setSelectedHook(null);
      setAlternatives(null);
      setProposal(null);
      setRepurposeResult(null);
      setMessage("Select a hook, then apply it. Only the opening changes when you apply.");
    } catch {
      setMessage("Could not generate hooks. Your current draft is unchanged.");
    } finally {
      setPending(null);
    }
  }

  async function runRepurpose() {
    setPending("repurpose");
    setMessage(null);
    try {
      const result = await repurposeStudioDraft(
        working,
        target.platform,
        target.format,
        customInstructions,
        inputs,
      );
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setRepurposeResult(result.content);
      setProposal(null);
      setAlternatives(null);
      setHooks(null);
      setMessage("Repurposed draft ready. Save it as a new draft to keep the original.");
    } catch {
      setMessage("Repurpose failed. The original draft is unchanged.");
    } finally {
      setPending(null);
    }
  }

  async function saveRepurposed() {
    if (!repurposeResult) return;
    setPending("save-new");
    setMessage(null);
    try {
      const result = await saveStudioDraft(
        repurposeResult,
        inputsForRepurposedDraft(inputs, repurposeResult),
      );
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      router.push(`/studio/drafts/${result.id}`);
      router.refresh();
    } catch {
      setMessage("Could not save the new draft.");
    } finally {
      setPending(null);
    }
  }

  function applyProposal() {
    if (!proposal) return;
    setWorking(proposal);
    setProposal(null);
    setMessage("Rewrite applied in the editor. Save to persist it.");
  }

  function selectAlternative(index: number) {
    if (!alternatives?.[index]) return;
    setSelectedAlternative(index);
    setMessage("Alternative selected. Apply it to the editor when you want to replace the working copy.");
  }

  function applySelectedAlternative() {
    if (selectedAlternative === null || !alternatives?.[selectedAlternative]) return;
    setWorking(alternatives[selectedAlternative]);
    setReview(null);
    setMessage("Alternative applied in the editor. Save to persist it. Quality review was for the previous saved text.");
  }

  function selectHook(index: number) {
    if (!hooks?.[index]) return;
    setSelectedHook(index);
    setMessage("Hook selected. Apply it to change only the opening.");
  }

  function applySelectedHook() {
    if (selectedHook === null || !hooks?.[selectedHook]) return;
    setWorking(applyHookToContent(working, hooks[selectedHook].text));
    setReview(null);
    setMessage("Hook applied to the opening only. Save to persist it. Quality review was for the previous saved text.");
  }

  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-ink/10 bg-paper-raised px-4 py-3 text-sm text-ink/70" role="status">
        {status}
      </p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/studio/drafts" variant="ghost">
          Back to drafts
        </ButtonLink>
      </div>
      {inputs.pillarId ? (
        <p className="text-sm leading-6 text-ink/70">
          {inputs.pillarName
            ? `Saved with pillar: ${inputs.pillarName}. ${inputs.pillarDescription} Rewrites keep this theme when you apply them. Pillars do not guarantee engagement. `
            : "This draft referenced a content pillar that is no longer in Brand settings. Rewrites continue without substituting another pillar. "}
          <Link href="/studio/brand#content-pillars" className="underline underline-offset-2">
            Manage pillars
          </Link>
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <DraftPreview content={working} />
        <Card>
          <Label htmlFor="draft-title">Title</Label>
          <Input
            id="draft-title"
            value={working.title}
            onChange={(event) => setWorking({ ...working, title: event.target.value })}
          />
          <div className="mt-4">
            <Label htmlFor="draft-body">Edit draft</Label>
            <Textarea
              id="draft-body"
              rows={10}
              value={working.body}
              onChange={(event) => setWorking({ ...working, body: event.target.value })}
            />
          </div>
          {working.format === "carousel"
            ? working.slides.map((slide, index) => (
                <div key={`${slide.title}-${index}`} className="mt-3">
                  <Label htmlFor={`slide-${index}`}>{`Slide ${index + 1}`}</Label>
                  <Textarea
                    id={`slide-${index}`}
                    rows={3}
                    value={slide.text}
                    onChange={(event) => {
                      const slides = working.slides.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, text: event.target.value } : item,
                      );
                      setWorking({ ...working, slides });
                    }}
                  />
                </div>
              ))
            : null}
          {working.format === "script" && working.script ? (
            <div className="mt-4 space-y-3">
              <Textarea
                aria-label="Hook"
                rows={2}
                value={working.script.hook}
                onChange={(event) =>
                  setWorking({
                    ...working,
                    script: { ...working.script!, hook: event.target.value },
                  })
                }
              />
              <Textarea
                aria-label="Script body"
                rows={4}
                value={working.script.body}
                onChange={(event) =>
                  setWorking({
                    ...working,
                    script: { ...working.script!, body: event.target.value },
                  })
                }
              />
              <Textarea
                aria-label="Call to action"
                rows={2}
                value={working.script.cta}
                onChange={(event) =>
                  setWorking({
                    ...working,
                    script: { ...working.script!, cta: event.target.value },
                  })
                }
              />
            </div>
          ) : null}
          {message ? (
            <p className="mt-3 text-sm text-ink/70" role="status">
              {message}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={onSave} disabled={busy}>
              {pending === "save" ? "Saving…" : "Save this draft"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setWorking(saved);
                setProposal(null);
                setAlternatives(null);
                setRepurposeResult(null);
                setMessage("Restored the last saved draft.");
              }}
              disabled={busy || savedEqualsWorking}
            >
              Restore saved
            </Button>
            <Button type="button" variant="ghost" onClick={onCopy} disabled={busy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Card>
      </div>

      <QualityReviewSection
        review={review}
        pending={pending === "review"}
        hasUnsavedEdits={!savedEqualsWorking}
        comparingAlternatives={Boolean(alternatives?.length || hooks?.length)}
        error={reviewError}
        onReview={runReview}
        onImprove={runRefine}
        disabled={busy}
      />

      <div id="refine-panel">
      <Card>
        <h2 className="font-serif text-2xl">Refine this draft</h2>
        <p className="mt-1 text-sm text-ink/65">
          Results stay in this page until you apply them and save. The saved {formatPlatform(saved.platform)}{" "}
          {formatLabel(saved.format)} is not overwritten automatically.
        </p>
        <div className="mt-4">
          <Label htmlFor="custom-instructions">Custom instructions (optional)</Label>
          <Textarea
            id="custom-instructions"
            rows={3}
            value={customInstructions}
            onChange={(event) => setCustomInstructions(event.target.value)}
            placeholder="Optional direction for rewrite, alternatives, or repurpose"
          />
        </div>
        <div className="mt-4">
          <Label htmlFor="variation-angle">Creative angle for alternatives</Label>
          <select
            id="variation-angle"
            className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            value={variationAngle}
            onChange={(event) => setVariationAngle(event.target.value as VariationAngle)}
            disabled={busy}
          >
            {VARIATION_ANGLES.map((angle) => (
              <option key={angle} value={angle}>
                {VARIATION_ANGLE_LABELS[angle]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-5 text-ink/55">
            Alternatives keep this platform, format, topic, brand voice, and pillar snapshot. They are
            not ranked by predicted engagement.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {REFINE_ACTIONS.map((action) => (
            <Button
              key={action}
              type="button"
              variant="ghost"
              onClick={() => runRefine(action)}
              disabled={busy}
            >
              {REFINE_ACTION_LABELS[action]}
            </Button>
          ))}
          <Button type="button" variant="secondary" onClick={runVariations} disabled={busy}>
            {pending === "variations" ? "Generating alternatives…" : "Generate three alternatives"}
          </Button>
          <Button type="button" variant="ghost" onClick={runHooks} disabled={busy}>
            {pending === "hooks" ? "Generating hooks…" : "Generate opening hooks"}
          </Button>
        </div>
        {pending === "refine" || pending === "variations" || pending === "hooks" ? (
          <p className="mt-3 text-sm text-ink/60" role="status">
            Generating… the current editor content is unchanged until you apply a result.
          </p>
        ) : null}

        {proposal ? (
          <div className="mt-6 rounded-xl border border-ink/10 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Proposed rewrite</p>
            <h3 className="mt-2 font-serif text-xl">{proposal.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">
              {flattenGeneratedText(proposal)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={applyProposal} disabled={busy}>
                Apply to editor
              </Button>
              <Button type="button" variant="ghost" onClick={() => setProposal(null)} disabled={busy}>
                Discard proposal
              </Button>
            </div>
          </div>
        ) : null}

        {alternatives ? (
          <div className="mt-6 space-y-3">
            <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Compare alternatives</p>
            <p className="text-sm leading-6 text-ink/70">
              Original working copy vs generated options. Select one, then apply. Nothing is saved until
              you save.
            </p>
            <div className="rounded-xl border border-ink/10 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Original (working copy)</p>
              <h3 className="mt-1 font-serif text-lg">{working.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">
                {flattenGeneratedText(working)}
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {alternatives.map((item, index) => {
                const angleKey: VariationAngle = alternativeLabels[index] ?? "distinct";
                const angleLabel = VARIATION_ANGLE_LABELS[angleKey];
                return (
                  <div
                    key={`${item.title}-${index}`}
                    className={`rounded-xl border p-4 ${
                      selectedAlternative === index ? "border-accent bg-accent/5" : "border-ink/10"
                    }`}
                  >
                    <p className="text-xs text-ink/50">
                      Option {index + 1} · {angleLabel}
                    </p>
                    <h3 className="mt-1 font-serif text-lg">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink/65">
                      {variationDifference(working, item, angleLabel)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">
                      {flattenGeneratedText(item)}
                    </p>
                    <Button
                      type="button"
                      variant={selectedAlternative === index ? "secondary" : "ghost"}
                      className="mt-3"
                      onClick={() => selectAlternative(index)}
                      disabled={busy}
                    >
                      {selectedAlternative === index ? "Selected" : "Select this option"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              onClick={applySelectedAlternative}
              disabled={busy || selectedAlternative === null}
            >
              Apply selected alternative to editor
            </Button>
          </div>
        ) : null}

        {hooks ? (
          <div className="mt-6 space-y-3">
            <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Opening hooks</p>
            <p className="text-sm leading-6 text-ink/70">
              Four openings for this draft. Applying one replaces only the hook, first slide, or first
              paragraph—not the rest of the piece.
            </p>
            {hooks.length === 0 ? (
              <p className="text-sm text-ink/70">No hooks returned. Try again.</p>
            ) : (
              hooks.map((item, index) => (
                <div
                  key={`${item.text}-${index}`}
                  className={`rounded-xl border p-4 ${
                    selectedHook === index ? "border-accent bg-accent/5" : "border-ink/10"
                  }`}
                >
                  <p className="text-xs text-ink/50">{hookAngleLabel(item.angle)}</p>
                  <p className="mt-2 text-sm leading-6 text-ink/80">{item.text}</p>
                  <Button
                    type="button"
                    variant={selectedHook === index ? "secondary" : "ghost"}
                    className="mt-3"
                    onClick={() => selectHook(index)}
                    disabled={busy}
                  >
                    {selectedHook === index ? "Selected" : "Select this hook"}
                  </Button>
                </div>
              ))
            )}
            <Button type="button" onClick={applySelectedHook} disabled={busy || selectedHook === null}>
              Apply selected hook to opening
            </Button>
          </div>
        ) : null}
      </Card>
      </div>

      <Card>
        <h2 className="font-serif text-2xl">Repurpose content</h2>
        <p className="mt-1 text-sm text-ink/65">
          Source: {formatPlatform(saved.platform)} · {formatLabel(saved.format)}. The new version is saved as a
          separate draft. This original stays on {formatPlatform(saved.platform)}.
        </p>
        <div className="mt-4">
          <Label htmlFor="repurpose-target">Target platform and format</Label>
          <select
            id="repurpose-target"
            className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm"
            value={`${target.platform}:${target.format}`}
            onChange={(event) => {
              const [platform, format] = event.target.value.split(":");
              setTarget({
                platform: platform as typeof target.platform,
                format: format as typeof target.format,
              });
            }}
            disabled={busy}
          >
            {repurposeOptions.map((option) => (
              <option key={`${option.platform}:${option.format}`} value={`${option.platform}:${option.format}`}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={runRepurpose} disabled={busy}>
            {pending === "repurpose" ? "Repurposing…" : "Generate repurposed draft"}
          </Button>
        </div>
        {repurposeResult ? (
          <div className="mt-6 rounded-xl border border-ink/10 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ink/50">
              Preview · {formatPlatform(repurposeResult.platform)} · {formatLabel(repurposeResult.format)}
            </p>
            <Label htmlFor="repurpose-title">Edit new draft title</Label>
            <Input
              id="repurpose-title"
              className="mt-2"
              value={repurposeResult.title}
              onChange={(event) => setRepurposeResult({ ...repurposeResult, title: event.target.value })}
            />
            <Label htmlFor="repurpose-body">Edit new draft</Label>
            <Textarea
              id="repurpose-body"
              rows={8}
              value={repurposeResult.body}
              onChange={(event) => setRepurposeResult({ ...repurposeResult, body: event.target.value })}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={saveRepurposed} disabled={busy}>
                {pending === "save-new" ? "Saving new draft…" : "Save as a new draft"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRepurposeResult(null)} disabled={busy}>
                Discard
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
