"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { discoverStudioIdeas } from "@/app/studio/actions";
import { deleteStudioIdea, saveStudioIdea, updateStudioIdea } from "@/app/studio/ideas/actions";
import { isExpiredSessionMessage } from "@/lib/api-auth";
import { formatPlatform, type BrandDraft, type Platform } from "@/lib/brand";
import { formatLabel } from "@/lib/content";
import {
  DISCOVERY_OBJECTIVES,
  emptyDiscoveryForm,
  filterIdeas,
  formatObjective,
  validateDiscoveryForm,
  type DiscoveryFieldErrors,
  type DiscoveryForm,
  type GeneratedIdea,
  type IdeaRecord,
} from "@/lib/ideas";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

export function IdeaBank({ brand, saved }: { brand: BrandDraft; saved: IdeaRecord[] }) {
  const router = useRouter();
  const allowed = brand.platforms.length ? brand.platforms : (["linkedin"] as Platform[]);
  const [form, setForm] = useState<DiscoveryForm>(() => emptyDiscoveryForm(allowed));
  const [errors, setErrors] = useState<DiscoveryFieldErrors>({});
  const [suggestions, setSuggestions] = useState<GeneratedIdea[]>([]);
  const [disclaimer, setDisclaimer] = useState(
    "AI-generated suggestions, not proven performance predictions.",
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "saved" | "used">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"discover" | string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editConcept, setEditConcept] = useState("");

  const visible = useMemo(() => filterIdeas(saved, query, statusFilter), [saved, query, statusFilter]);

  function handleExpired(text: string) {
    if (isExpiredSessionMessage(text)) {
      router.push("/login?next=/studio/ideas");
      router.refresh();
      return true;
    }
    return false;
  }

  async function onDiscover() {
    const fieldErrors = validateDiscoveryForm(form, allowed);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setPending("discover");
    setMessage(null);
    try {
      const result = await discoverStudioIdeas(form);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      setSuggestions(result.ideas);
      setDisclaimer(result.disclaimer);
    } catch {
      setMessage("Could not generate ideas. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function onSaveSuggestion(idea: GeneratedIdea, index: number) {
    setPending(`save-${index}`);
    setMessage(null);
    try {
      const result = await saveStudioIdea(idea);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setSuggestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
      setMessage("Idea saved to your bank.");
      router.refresh();
    } catch {
      setMessage("Could not save that idea.");
    } finally {
      setPending(null);
    }
  }

  async function onDelete(id: string) {
    setPending(`delete-${id}`);
    setMessage(null);
    try {
      const result = await deleteStudioIdea(id);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setMessage("Idea deleted.");
      router.refresh();
    } catch {
      setMessage("Could not delete that idea.");
    } finally {
      setPending(null);
    }
  }

  async function onUpdate(id: string) {
    setPending(`edit-${id}`);
    setMessage(null);
    try {
      const result = await updateStudioIdea(id, { title: editTitle, concept: editConcept });
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setEditingId(null);
      setMessage("Idea updated.");
      router.refresh();
    } catch {
      setMessage("Could not update that idea.");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="space-y-8">
      <Card>
        <h2 className="font-serif text-2xl">Discover ideas</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          Uses {brand.name || "your brand"} niche, audience, voice, and goals. Suggestions are not
          trend scores or performance forecasts. Nothing is saved until you choose it. Nothing is
          published.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="theme">Topic or campaign (optional)</Label>
            <Input
              id="theme"
              value={form.theme}
              onChange={(event) => setForm({ ...form, theme: event.target.value })}
              placeholder="e.g. Q4 thought leadership on evals"
            />
            {errors.theme ? (
              <p className="mt-1.5 text-sm text-accent" role="alert">
                {errors.theme}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="idea-platform">Platform (optional)</Label>
            <select
              id="idea-platform"
              className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm"
              value={form.platform}
              onChange={(event) =>
                setForm({ ...form, platform: event.target.value as DiscoveryForm["platform"] })
              }
            >
              <option value="">Any saved platform</option>
              {allowed.map((platform) => (
                <option key={platform} value={platform}>
                  {formatPlatform(platform)}
                </option>
              ))}
            </select>
            {errors.platform ? (
              <p className="mt-1.5 text-sm text-accent" role="alert">
                {errors.platform}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="objective">Objective (optional)</Label>
            <select
              id="objective"
              className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm"
              value={form.objective}
              onChange={(event) =>
                setForm({ ...form, objective: event.target.value as DiscoveryForm["objective"] })
              }
            >
              <option value="">Any</option>
              {DISCOVERY_OBJECTIVES.map((item) => (
                <option key={item} value={item}>
                  {formatObjective(item)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="count">Number of ideas</Label>
            <Input
              id="count"
              type="number"
              min={3}
              max={8}
              value={form.count}
              onChange={(event) => setForm({ ...form, count: Number(event.target.value) })}
            />
            {errors.count ? (
              <p className="mt-1.5 text-sm text-accent" role="alert">
                {errors.count}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <Button type="button" onClick={onDiscover} disabled={busy}>
            {pending === "discover" ? "Generating ideas…" : "Generate ideas"}
          </Button>
        </div>
      </Card>

      {message ? (
        <p className="text-sm text-ink/70" role="status">
          {message}
        </p>
      ) : null}

      {pending === "discover" ? (
        <Card>
          <p className="text-sm text-ink/70">Generating suggestions from your brand profile…</p>
        </Card>
      ) : null}

      {suggestions.length ? (
        <section>
          <h2 className="font-serif text-2xl">Suggested ideas</h2>
          <p className="mt-1 text-sm text-ink/60">{disclaimer}</p>
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {suggestions.map((idea, index) => (
              <li key={`${idea.title}-${index}`}>
                <IdeaCard idea={idea}>
                  <Button
                    type="button"
                    onClick={() => onSaveSuggestion(idea, index)}
                    disabled={busy}
                  >
                    {pending === `save-${index}` ? "Saving…" : "Save idea"}
                  </Button>
                </IdeaCard>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-serif text-2xl">Idea bank</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Input
            aria-label="Search saved ideas"
            placeholder="Search saved ideas"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-sm"
          />
          <select
            aria-label="Filter by status"
            className="rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="saved">Saved</option>
            <option value="used">Used for a draft</option>
          </select>
        </div>
        {saved.length === 0 ? (
          <Card className="mt-4 max-w-xl">
            <p className="text-sm leading-6 text-ink/70">
              No saved ideas yet. Generate suggestions above and keep the ones worth writing.
            </p>
          </Card>
        ) : visible.length === 0 ? (
          <Card className="mt-4 max-w-xl">
            <p className="text-sm leading-6 text-ink/70">No saved ideas match that search.</p>
          </Card>
        ) : (
          <ul className="mt-4 space-y-4">
            {visible.map((idea) => (
              <li key={idea.id}>
                <IdeaCard idea={idea} status={idea.status}>
                  {editingId === idea.id ? (
                    <div className="w-full space-y-3">
                      <Input
                        aria-label="Edit title"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                      />
                      <Textarea
                        aria-label="Edit concept"
                        rows={4}
                        value={editConcept}
                        onChange={(event) => setEditConcept(event.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => onUpdate(idea.id)} disabled={busy}>
                          {pending === `edit-${idea.id}` ? "Saving…" : "Save edits"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ButtonLink href={`/studio/create?idea=${idea.id}`}>
                        Create draft from idea
                      </ButtonLink>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(idea.id);
                          setEditTitle(idea.title);
                          setEditConcept(idea.concept);
                        }}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onDelete(idea.id)}
                        disabled={busy}
                      >
                        {pending === `delete-${idea.id}` ? "Deleting…" : "Delete"}
                      </Button>
                    </>
                  )}
                </IdeaCard>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IdeaCard({
  idea,
  status,
  children,
}: {
  idea: GeneratedIdea;
  status?: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.14em] text-ink/50">
        {formatPlatform(idea.platform)} · {formatLabel(idea.format)}
        {status ? ` · ${status === "used" ? "Used for a draft" : "Saved"}` : " · Suggestion"}
      </p>
      <h3 className="mt-2 font-serif text-xl">{idea.title}</h3>
      {idea.pillar ? <p className="mt-1 text-xs text-ink/50">Pillar: {idea.pillar}</p> : null}
      <dl className="mt-3 space-y-2 text-sm leading-6 text-ink/80">
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Concept</dt>
          <dd>{idea.concept}</dd>
        </div>
        {idea.why_relevant ? (
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Why it may fit</dt>
            <dd>{idea.why_relevant}</dd>
          </div>
        ) : null}
        {idea.angle ? (
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Angle</dt>
            <dd>{idea.angle}</dd>
          </div>
        ) : null}
        {idea.hook ? (
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Suggested hook</dt>
            <dd>{idea.hook}</dd>
          </div>
        ) : null}
        {idea.call_to_action ? (
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Call to action</dt>
            <dd>{idea.call_to_action}</dd>
          </div>
        ) : null}
      </dl>
      {children ? <div className="mt-4 flex flex-wrap gap-2">{children}</div> : null}
    </Card>
  );
}
