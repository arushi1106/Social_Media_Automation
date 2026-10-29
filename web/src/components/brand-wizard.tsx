"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBrand } from "@/app/onboarding/actions";
import {
  GOALS,
  NICHE_EXAMPLES,
  PLATFORMS,
  TONES,
  emptyBrandDraft,
  formatGoal,
  formatPlatform,
  formatTone,
  hasErrors,
  parseTopics,
  toggleValue,
  validateBrandDraft,
  type BrandDraft,
  type FieldErrors,
  type Goal,
  type Platform,
  type Tone,
} from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

const STEPS = [
  { id: 1, label: "Welcome" },
  { id: 2, label: "Identity" },
  { id: 3, label: "Voice" },
  { id: 4, label: "Content" },
  { id: 5, label: "Review" },
] as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-accent">
      {message}
    </p>
  );
}

function ChoiceButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        selected
          ? "border-accent bg-accent/10 text-ink"
          : "border-ink/15 bg-paper text-ink/80 hover:border-ink/30"
      }`}
    >
      {children}
    </button>
  );
}

export function BrandWizard({
  initialDraft,
  mode,
}: {
  initialDraft?: BrandDraft | null;
  mode: "onboarding" | "edit";
}) {
  const router = useRouter();
  const [step, setStep] = useState(mode === "edit" ? 2 : 1);
  const [draft, setDraft] = useState<BrandDraft>(initialDraft ?? emptyBrandDraft());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const topicsPreview = useMemo(() => parseTopics(draft.topicsText), [draft.topicsText]);

  function update<K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function goTo(nextStep: number) {
    if (nextStep < 1 || nextStep > 5) return;
    if (nextStep > step) {
      const stepErrors = validateBrandDraft(draft, step);
      if (hasErrors(stepErrors)) {
        setErrors(stepErrors);
        return;
      }
    }
    setErrors({});
    setFormError(null);
    setStep(nextStep);
  }

  async function onSave() {
    const allErrors = validateBrandDraft(draft);
    if (hasErrors(allErrors)) {
      setErrors(allErrors);
      setFormError("Please complete the required fields before saving.");
      if (allErrors.name || allErrors.niche || allErrors.audience) setStep(2);
      else if (allErrors.tone || allErrors.customTone || allErrors.language) setStep(3);
      else if (allErrors.platforms || allErrors.goals) setStep(4);
      return;
    }
    setPending(true);
    setFormError(null);
    setSaved(false);
    try {
      const result = await saveBrand(draft);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      setSaved(true);
      router.push("/studio");
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <ol className="mb-8 flex flex-wrap gap-2" aria-label="Onboarding steps">
        {STEPS.map((item) => {
          const current = item.id === step;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => goTo(item.id)}
                aria-current={current ? "step" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-medium tracking-wide ${
                  current
                    ? "bg-ink text-paper"
                    : item.id < step
                      ? "bg-accent/15 text-ink"
                      : "bg-ink/5 text-ink/50"
                }`}
              >
                {item.id}. {item.label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <Card>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
            Brand onboarding
          </p>
          <h1 className="mt-3 font-serif text-4xl">Set the voice once. Write faster later.</h1>
          <p className="mt-4 text-base leading-7 text-ink/75">
            Tell us who you are, how you sound, and where you publish. We will save these
            preferences to your account and use them when generating drafts. Nothing is posted
            to LinkedIn or Instagram.
          </p>
          <div className="mt-8">
            <Button type="button" onClick={() => goTo(2)}>
              Set up my brand
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <h1 className="font-serif text-3xl">Brand identity</h1>
          <p className="mt-2 text-sm text-ink/70">Required fields are marked.</p>
          <div className="mt-6 space-y-5">
            <div>
              <Label htmlFor="brand-name">Brand name</Label>
              <Input
                id="brand-name"
                required
                autoComplete="organization"
                value={draft.name}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "brand-name-error" : undefined}
                onChange={(event) => update("name", event.target.value)}
              />
              <FieldError id="brand-name-error" message={errors.name} />
            </div>
            <div>
              <Label htmlFor="brand-niche">Niche or industry</Label>
              <Input
                id="brand-niche"
                required
                list="niche-examples"
                value={draft.niche}
                aria-invalid={Boolean(errors.niche)}
                aria-describedby={errors.niche ? "brand-niche-error" : undefined}
                onChange={(event) => update("niche", event.target.value)}
              />
              <datalist id="niche-examples">
                {NICHE_EXAMPLES.map((example) => (
                  <option key={example} value={example} />
                ))}
              </datalist>
              <FieldError id="brand-niche-error" message={errors.niche} />
            </div>
            <div>
              <Label htmlFor="brand-bio">Short bio (optional)</Label>
              <Textarea
                id="brand-bio"
                rows={4}
                value={draft.bio}
                onChange={(event) => update("bio", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="brand-audience">Target audience</Label>
              <Textarea
                id="brand-audience"
                required
                rows={3}
                value={draft.audience}
                aria-invalid={Boolean(errors.audience)}
                aria-describedby={errors.audience ? "brand-audience-error" : undefined}
                onChange={(event) => update("audience", event.target.value)}
              />
              <FieldError id="brand-audience-error" message={errors.audience} />
            </div>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <h1 className="font-serif text-3xl">Voice and writing style</h1>
          <fieldset className="mt-6">
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
              Preferred tone
            </legend>
            <div className="flex flex-wrap gap-2">
              {TONES.map((tone) => (
                <ChoiceButton
                  key={tone}
                  selected={draft.tone === tone}
                  onClick={() => update("tone", tone as Tone)}
                >
                  {tone === "custom" ? "Custom" : tone.charAt(0).toUpperCase() + tone.slice(1)}
                </ChoiceButton>
              ))}
            </div>
            <FieldError id="tone-error" message={errors.tone} />
          </fieldset>
          {draft.tone === "custom" ? (
            <div className="mt-5">
              <Label htmlFor="custom-tone">Describe your tone</Label>
              <Input
                id="custom-tone"
                value={draft.customTone}
                aria-invalid={Boolean(errors.customTone)}
                aria-describedby={errors.customTone ? "custom-tone-error" : undefined}
                onChange={(event) => update("customTone", event.target.value)}
              />
              <FieldError id="custom-tone-error" message={errors.customTone} />
            </div>
          ) : null}
          <div className="mt-5">
            <Label htmlFor="writing-style">Writing style (optional)</Label>
            <Textarea
              id="writing-style"
              rows={3}
              placeholder="Short sentences, first person, no jargon…"
              value={draft.writingStyle}
              onChange={(event) => update("writingStyle", event.target.value)}
            />
          </div>
          <div className="mt-5">
            <Label htmlFor="avoid">Words or styles to avoid (optional)</Label>
            <Textarea
              id="avoid"
              rows={3}
              value={draft.avoid}
              onChange={(event) => update("avoid", event.target.value)}
            />
          </div>
          <div className="mt-5">
            <Label htmlFor="language">Language</Label>
            <Input
              id="language"
              required
              value={draft.language}
              aria-invalid={Boolean(errors.language)}
              aria-describedby={errors.language ? "language-error" : undefined}
              onChange={(event) => update("language", event.target.value)}
            />
            <FieldError id="language-error" message={errors.language} />
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <h1 className="font-serif text-3xl">Content preferences</h1>
          <fieldset className="mt-6">
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
              Platforms
            </legend>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => (
                <ChoiceButton
                  key={platform}
                  selected={draft.platforms.includes(platform)}
                  onClick={() => update("platforms", toggleValue(draft.platforms, platform as Platform))}
                >
                  {formatPlatform(platform)}
                </ChoiceButton>
              ))}
            </div>
            <FieldError id="platforms-error" message={errors.platforms} />
          </fieldset>
          <fieldset className="mt-6">
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
              Content goals
            </legend>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((goal) => (
                <ChoiceButton
                  key={goal}
                  selected={draft.goals.includes(goal)}
                  onClick={() => update("goals", toggleValue(draft.goals, goal as Goal))}
                >
                  {formatGoal(goal)}
                </ChoiceButton>
              ))}
            </div>
            <FieldError id="goals-error" message={errors.goals} />
          </fieldset>
          <div className="mt-6">
            <Label htmlFor="topics">Topics or themes (optional)</Label>
            <Textarea
              id="topics"
              rows={4}
              placeholder="One topic per line, or comma-separated"
              value={draft.topicsText}
              onChange={(event) => update("topicsText", event.target.value)}
            />
            <p className="mt-1.5 text-xs text-ink/50">Saved as a list, not a single string.</p>
          </div>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <h1 className="font-serif text-3xl">Review</h1>
          <p className="mt-2 text-sm text-ink/70">
            Confirm these details. You can edit them later from the studio.
          </p>
          <dl className="mt-6 space-y-4 text-sm">
            <ReviewRow label="Name" value={draft.name} onEdit={() => setStep(2)} />
            <ReviewRow label="Niche" value={draft.niche} onEdit={() => setStep(2)} />
            <ReviewRow label="Bio" value={draft.bio || "—"} onEdit={() => setStep(2)} />
            <ReviewRow label="Audience" value={draft.audience} onEdit={() => setStep(2)} />
            <ReviewRow
              label="Tone"
              value={formatTone(draft.tone, draft.customTone)}
              onEdit={() => setStep(3)}
            />
            <ReviewRow
              label="Writing style"
              value={draft.writingStyle || "—"}
              onEdit={() => setStep(3)}
            />
            <ReviewRow label="Avoid" value={draft.avoid || "—"} onEdit={() => setStep(3)} />
            <ReviewRow label="Language" value={draft.language} onEdit={() => setStep(3)} />
            <ReviewRow
              label="Platforms"
              value={draft.platforms.map(formatPlatform).join(", ") || "—"}
              onEdit={() => setStep(4)}
            />
            <ReviewRow
              label="Goals"
              value={draft.goals.map(formatGoal).join(", ") || "—"}
              onEdit={() => setStep(4)}
            />
            <ReviewRow
              label="Topics"
              value={topicsPreview.join(", ") || "—"}
              onEdit={() => setStep(4)}
            />
          </dl>
        </Card>
      ) : null}

      {formError ? (
        <p className="mt-4 text-sm text-accent" role="alert">
          {formError}
        </p>
      ) : null}
      {saved ? (
        <p className="mt-4 text-sm text-ink/70" role="status">
          Saved. Opening the studio…
        </p>
      ) : null}

      {step > 1 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={pending}>
            Back
          </Button>
          {step < 5 ? (
            <Button type="button" onClick={() => goTo(step + 1)} disabled={pending}>
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={onSave} disabled={pending}>
              {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Save brand"}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink/10 pb-3">
      <div>
        <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">{label}</dt>
        <dd className="mt-1 whitespace-pre-wrap text-ink">{value}</dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-xs font-medium text-accent underline-offset-2 hover:underline"
      >
        Edit
      </button>
    </div>
  );
}
