"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStudioProject } from "@/app/studio/projects/actions";
import { isExpiredSessionMessage } from "@/lib/api-auth";
import { type Platform } from "@/lib/brand";
import type { ContentPillar } from "@/lib/pillars";
import {
  MAX_PROJECTS,
  canAddProject,
  emptyProjectDraft,
  validateProjectDraft,
  type ContentProject,
  type ProjectDraft,
  type ProjectFieldErrors,
} from "@/lib/projects";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

export function ProjectList({
  projects,
  pillars,
  brandPlatforms,
  loadError,
}: {
  projects: ContentProject[];
  pillars: ContentPillar[];
  brandPlatforms: Platform[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProjectDraft>(emptyProjectDraft(brandPlatforms));
  const [errors, setErrors] = useState<ProjectFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onCreate() {
    const fieldErrors = validateProjectDraft(draft);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const result = await createStudioProject(draft);
      if (!result.ok) {
        if (isExpiredSessionMessage(result.message)) {
          router.push("/login?next=/studio/projects");
          return;
        }
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      router.push(`/studio/projects/${result.id}`);
      router.refresh();
    } catch {
      setMessage("Could not save that project.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      {loadError ? (
        <p className="text-sm text-accent" role="alert">
          {loadError} Apply the content_projects migration to create projects. Nothing is published from here.
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-accent" role="alert">
          {message}
        </p>
      ) : null}

      <Card>
        <h2 className="font-serif text-2xl">New content project</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          A brief for a launch, series, or campaign. Dates are planning targets only — not a posting
          schedule. {projects.length} of {MAX_PROJECTS} saved.
        </p>
        {!canAddProject(projects.length) ? (
          <p className="mt-3 text-sm text-ink/70">Delete a project to add another.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={draft.name}
                aria-invalid={Boolean(errors.name)}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              {errors.name ? (
                <p className="mt-1.5 text-sm text-accent" role="alert">
                  {errors.name}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="project-objective">Objective</Label>
              <Textarea
                id="project-objective"
                rows={3}
                value={draft.objective}
                onChange={(event) => setDraft({ ...draft, objective: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="project-audience">Audience (optional)</Label>
              <Input
                id="project-audience"
                value={draft.audience}
                onChange={(event) => setDraft({ ...draft, audience: event.target.value })}
              />
            </div>
            <Button type="button" onClick={onCreate} disabled={pending}>
              {pending ? "Saving…" : "Create project"}
            </Button>
          </div>
        )}
      </Card>

      <section>
        <h2 className="font-serif text-2xl">Your projects</h2>
        {projects.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-ink/70">
            None yet. Create a brief, generate ideas, then save drafts into it. This is not a
            publishing calendar.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id}>
                <article className="rounded-2xl border border-ink/10 bg-paper-raised p-5">
                  <h3 className="font-serif text-xl">{project.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/70">
                    {project.objective || "No objective yet."}
                  </p>
                  {project.plan_start || project.plan_end ? (
                    <p className="mt-2 text-xs text-ink/55">
                      Planning {project.plan_start || "open"} – {project.plan_end || "open"} (not a
                      publish window)
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <ButtonLink href={`/studio/projects/${project.id}`} variant="ghost">
                      Open project
                    </ButtonLink>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
      {pillars.length === 0 ? (
        <p className="text-sm text-ink/60">You can attach a content pillar after you add one in Brand settings.</p>
      ) : null}
    </div>
  );
}
