"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { discoverStudioIdeas } from "@/app/studio/actions";
import { saveStudioIdea } from "@/app/studio/ideas/actions";
import { deleteStudioProject, updateStudioProject } from "@/app/studio/projects/actions";
import { isExpiredSessionMessage } from "@/lib/api-auth";
import { formatPlatform, type Platform } from "@/lib/brand";
import type { DraftRow } from "@/lib/content";
import type { ContentPillar } from "@/lib/pillars";
import type { GeneratedIdea, IdeaRecord } from "@/lib/ideas";
import {
  briefExtraInstructions,
  briefTheme,
  projectToDraft,
  validateProjectDraft,
  type ContentProject,
  type ProjectDraft,
  type ProjectFieldErrors,
} from "@/lib/projects";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

export function ProjectWorkspace({
  project,
  pillars,
  brandPlatforms,
  ideas,
  drafts,
}: {
  project: ContentProject;
  pillars: ContentPillar[];
  brandPlatforms: Platform[];
  ideas: IdeaRecord[];
  drafts: DraftRow[];
}) {
  const router = useRouter();
  const [brief, setBrief] = useState<ProjectDraft>(() => projectToDraft(project));
  const [errors, setErrors] = useState<ProjectFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GeneratedIdea[]>([]);
  const [edits, setEdits] = useState<Record<number, { title: string; concept: string }>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const allowed = brandPlatforms.length ? brandPlatforms : (["linkedin"] as Platform[]);

  const selectedPillar = useMemo(
    () => pillars.find((item) => item.id === brief.pillar_id) ?? null,
    [pillars, brief.pillar_id],
  );

  function handleExpired(text: string) {
    if (isExpiredSessionMessage(text)) {
      router.push(`/login?next=/studio/projects/${project.id}`);
      router.refresh();
      return true;
    }
    return false;
  }

  async function onSaveBrief() {
    const fieldErrors = validateProjectDraft(brief);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setPending("brief");
    setMessage(null);
    try {
      const result = await updateStudioProject(project.id, brief);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      setMessage("Brief saved. Planning dates are not a publish schedule.");
      router.refresh();
    } catch {
      setMessage("Could not save the brief.");
    } finally {
      setPending(null);
    }
  }

  async function onDiscover() {
    setPending("ideas");
    setMessage(null);
    try {
      const current = { ...project, ...brief, id: project.id, pillar_id: brief.pillar_id || null };
      const result = await discoverStudioIdeas({
        theme: briefTheme({ name: brief.name, objective: brief.objective }),
        platform: brief.platforms[0] && allowed.includes(brief.platforms[0]) ? brief.platforms[0] : "",
        objective: "",
        count: 5,
        extraInstructions: briefExtraInstructions({
          ...project,
          ...current,
          platforms: brief.platforms,
        }),
      });
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setSuggestions(result.ideas);
      setEdits({});
      setMessage("Suggestions only. Save the ones you want into this project.");
    } catch {
      setMessage("Could not generate ideas.");
    } finally {
      setPending(null);
    }
  }

  async function onSaveIdea(index: number) {
    const idea = suggestions[index];
    if (!idea) return;
    const patch = edits[index];
    setPending(`save-${index}`);
    try {
      const result = await saveStudioIdea(
        {
          ...idea,
          title: patch?.title?.trim() || idea.title,
          concept: patch?.concept?.trim() || idea.concept,
        },
        project.id,
      );
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setSuggestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
      setMessage("Idea saved to this project and the Idea Bank.");
      router.refresh();
    } catch {
      setMessage("Could not save that idea.");
    } finally {
      setPending(null);
    }
  }

  async function onDelete() {
    setPending("delete");
    try {
      const result = await deleteStudioProject(project.id);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      router.push("/studio/projects");
      router.refresh();
    } catch {
      setMessage("Could not delete that project.");
    } finally {
      setPending(null);
    }
  }

  const createHref = `/studio/create?project=${encodeURIComponent(project.id)}${
    brief.pillar_id ? `&pillar=${encodeURIComponent(brief.pillar_id)}` : ""
  }`;

  return (
    <div className="space-y-8">
      {message ? (
        <p className="text-sm text-ink/70" role="status">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/studio/projects" variant="ghost">
          All projects
        </ButtonLink>
        <ButtonLink href={createHref}>New draft in this project</ButtonLink>
      </div>

      <Card>
        <h2 className="font-serif text-2xl">Brief</h2>
        <p className="mt-2 text-sm text-ink/70">
          Reuses your saved brand. Audience here is extra context for this project only.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="brief-name">Name</Label>
            <Input id="brief-name" value={brief.name} onChange={(event) => setBrief({ ...brief, name: event.target.value })} />
            {errors.name ? <p className="mt-1.5 text-sm text-accent" role="alert">{errors.name}</p> : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="brief-objective">Objective</Label>
            <Textarea id="brief-objective" rows={3} value={brief.objective} onChange={(event) => setBrief({ ...brief, objective: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="brief-audience">Audience</Label>
            <Input id="brief-audience" value={brief.audience} onChange={(event) => setBrief({ ...brief, audience: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="brief-message">Core message</Label>
            <Input id="brief-message" value={brief.core_message} onChange={(event) => setBrief({ ...brief, core_message: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="brief-offer">Offer or subject</Label>
            <Input id="brief-offer" value={brief.offer} onChange={(event) => setBrief({ ...brief, offer: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="brief-action">Desired action</Label>
            <Input id="brief-action" value={brief.desired_action} onChange={(event) => setBrief({ ...brief, desired_action: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="brief-tone">Tone or constraints</Label>
            <Input id="brief-tone" value={brief.tone} onChange={(event) => setBrief({ ...brief, tone: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="brief-pillar">Content pillar (optional)</Label>
            <select
              id="brief-pillar"
              className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              value={brief.pillar_id}
              onChange={(event) => setBrief({ ...brief, pillar_id: event.target.value })}
            >
              <option value="">None</option>
              {pillars.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {selectedPillar ? <p className="mt-1.5 text-sm text-ink/70">{selectedPillar.description}</p> : null}
          </div>
          <div>
            <Label htmlFor="brief-start">Planning start (optional)</Label>
            <Input id="brief-start" type="date" value={brief.plan_start} onChange={(event) => setBrief({ ...brief, plan_start: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="brief-end">Planning end (optional)</Label>
            <Input
              id="brief-end"
              type="date"
              value={brief.plan_end}
              aria-invalid={Boolean(errors.plan_end)}
              onChange={(event) => setBrief({ ...brief, plan_end: event.target.value })}
            />
            {errors.plan_end ? <p className="mt-1.5 text-sm text-accent" role="alert">{errors.plan_end}</p> : null}
            <p className="mt-1.5 text-xs text-ink/55">Planning targets only. Not a social posting schedule.</p>
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
            Preferred platforms
          </legend>
          <div className="flex flex-wrap gap-2">
            {allowed.map((platform) => {
              const on = brief.platforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent/10" : "border-ink/15"}`}
                  onClick={() =>
                    setBrief({
                      ...brief,
                      platforms: on
                        ? brief.platforms.filter((item) => item !== platform)
                        : [...brief.platforms, platform],
                    })
                  }
                >
                  {formatPlatform(platform)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={onSaveBrief} disabled={pending === "brief"}>
            {pending === "brief" ? "Saving…" : "Save brief"}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Ideas from this brief</h2>
        <p className="mt-2 text-sm text-ink/70">
          Suggestions are not saved until you choose them. They also appear in the Idea Bank.
        </p>
        <div className="mt-4">
          <Button type="button" variant="ghost" onClick={onDiscover} disabled={pending === "ideas"}>
            {pending === "ideas" ? "Generating…" : "Generate suggestions"}
          </Button>
        </div>
        {suggestions.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">No unsaved suggestions right now.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {suggestions.map((idea, index) => (
              <li key={`${idea.title}-${index}`} className="rounded-xl border border-ink/10 p-4">
                <Label htmlFor={`sug-title-${index}`}>Title</Label>
                <Input
                  id={`sug-title-${index}`}
                  value={edits[index]?.title ?? idea.title}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      [index]: {
                        title: event.target.value,
                        concept: current[index]?.concept ?? idea.concept,
                      },
                    }))
                  }
                />
                <div className="mt-3">
                  <Label htmlFor={`sug-concept-${index}`}>Concept</Label>
                  <Textarea
                    id={`sug-concept-${index}`}
                    rows={3}
                    value={edits[index]?.concept ?? idea.concept}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [index]: {
                          title: current[index]?.title ?? idea.title,
                          concept: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="mt-3">
                  <Button type="button" onClick={() => onSaveIdea(index)} disabled={pending === `save-${index}`}>
                    {pending === `save-${index}` ? "Saving…" : "Save to project"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-6 font-serif text-xl">Saved in this project</h3>
        {ideas.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">No saved ideas linked yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <span className="font-medium">{idea.title}</span>
                <span className="text-ink/60"> · {idea.status}</span>
                {" · "}
                <a className="underline underline-offset-2" href={`/studio/create?idea=${idea.id}&project=${project.id}`}>
                  Create draft
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Drafts in this project</h2>
        {drafts.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">
            None yet. New drafts opened from this project keep a reference; the full copy stays in Drafts.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <a className="underline underline-offset-2" href={`/studio/drafts/${draft.id}`}>
                  {draft.title || draft.topic || "Untitled draft"}
                </a>
                <span className="text-ink/60"> · {draft.status} · {draft.platform}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-xl">Delete project</h2>
        <p className="mt-2 text-sm text-ink/70">
          Removes the brief. Saved ideas and drafts stay in your account; they just lose this grouping.
        </p>
        {confirmDelete ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={onDelete} disabled={pending === "delete"}>
              {pending === "delete" ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep project
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete project
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
