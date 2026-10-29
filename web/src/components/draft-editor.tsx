"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateStudioVariations,
  refineStudioDraft,
  repurposeStudioDraft,
  reviewStudioDraft,
  saveStudioDraft,
  updateStudioDraft,
} from "@/app/studio/actions";
import { QualityReviewPanel } from "@/components/quality-review";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DraftPreview } from "@/components/draft-preview";

type Pending = "save" | "refine" | "variations" | "repurpose" | "save-new" | "review" | null;

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
  const [repurposeResult, setRepurposeResult] = useState<GeneratedContent | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [target, setTarget] = useState(() => defaultRepurposeTarget(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [copied, setCopied] = useState(false);
  const [review, setReview] = useState<QualityReview | null>(null);

  const busy = pending !== null;
  const savedEqualsWorking = contentEquals(saved, working);
  const status = editorStatusLabel({
    savedEqualsWorking,
    hasProposal: Boolean(proposal),
    hasAlternatives: Boolean(alternatives?.length),
  });
  const repurposeOptions = useMemo(() => supportedRepurposeOptions(saved), [saved]);

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
    setMessage(null);
    try {
      const result = await reviewStudioDraft(saved);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setReview(result.review);
      setMessage(
        savedEqualsWorking
          ? "Advisory review of the saved draft."
          : "Reviewing the last saved draft. Save first to include unsaved edits.",
      );
    } catch {
      setMessage("Could not review this draft. The saved copy is unchanged.");
    } finally {
      setPending(null);
    }
  }

  async function runRefine(action: RefineAction) {
    setPending("refine");
    setMessage(null);
    try {
      const result = await refineStudioDraft(working, action, customInstructions);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setProposal(result.content);
      setAlternatives(null);
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
      const result = await generateStudioVariations(working, customInstructions);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setAlternatives(result.alternatives);
      setSelectedAlternative(null);
      setProposal(null);
      setRepurposeResult(null);
      setMessage("Select an alternative to edit. Nothing is saved yet.");
    } catch {
      setMessage("Could not generate alternatives. Your current draft is unchanged.");
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
      );
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setRepurposeResult(result.content);
      setProposal(null);
      setAlternatives(null);
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

  function applyAlternative(index: number) {
    if (!alternatives?.[index]) return;
    setSelectedAlternative(index);
    setWorking(alternatives[index]);
    setMessage("Alternative applied in the editor. Save to persist it.");
  }

  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-ink/10 bg-paper-raised px-4 py-3 text-sm text-ink/70" role="status">
        {status}
      </p>
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
            <Button type="button" variant="secondary" onClick={runReview} disabled={busy}>
              {pending === "review" ? "Reviewing…" : "Review content"}
            </Button>
          </div>
        </Card>
      </div>

      {pending === "review" ? (
        <Card>
          <p className="text-sm text-ink/70">Reviewing the saved draft against your brand profile…</p>
        </Card>
      ) : null}

      {review ? (
        <QualityReviewPanel review={review} onImprove={runRefine} disabled={busy} />
      ) : null}

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
        </div>
        {pending === "refine" || pending === "variations" ? (
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
            <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Alternatives</p>
            {alternatives.map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                className={`rounded-xl border p-4 ${
                  selectedAlternative === index ? "border-accent bg-accent/5" : "border-ink/10"
                }`}
              >
                <p className="text-xs text-ink/50">Option {index + 1}</p>
                <h3 className="mt-1 font-serif text-lg">{item.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">
                  {flattenGeneratedText(item)}
                </p>
                <Button
                  type="button"
                  variant={selectedAlternative === index ? "secondary" : "ghost"}
                  className="mt-3"
                  onClick={() => applyAlternative(index)}
                  disabled={busy}
                >
                  {selectedAlternative === index ? "Selected in editor" : "Edit this option"}
                </Button>
              </div>
            ))}
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
