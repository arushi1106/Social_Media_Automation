"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createStudioPillar,
  deleteStudioPillar,
  updateStudioPillar,
} from "@/app/studio/brand/pillars-actions";
import { isExpiredSessionMessage } from "@/lib/api-auth";
import {
  MAX_PILLARS,
  canAddPillar,
  emptyPillarDraft,
  emptyPillarsCopy,
  validatePillarDraft,
  type ContentPillar,
  type PillarDraft,
  type PillarFieldErrors,
} from "@/lib/pillars";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

export function ContentPillarsManager({ pillars }: { pillars: ContentPillar[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<PillarDraft>(emptyPillarDraft());
  const [errors, setErrors] = useState<PillarFieldErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PillarDraft>(emptyPillarDraft());
  const [editErrors, setEditErrors] = useState<PillarFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const atLimit = !canAddPillar(pillars.length);

  function handleExpired(text: string) {
    if (isExpiredSessionMessage(text)) {
      router.push("/login?next=/studio/brand");
      router.refresh();
      return true;
    }
    return false;
  }

  async function onCreate() {
    const fieldErrors = validatePillarDraft(draft, pillars);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setPending("create");
    setMessage(null);
    setErrors({});
    try {
      const result = await createStudioPillar(draft);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      setDraft(emptyPillarDraft());
      setMessage("Pillar saved. It does not publish or generate posts.");
      router.refresh();
    } catch {
      setMessage("Could not save that pillar.");
    } finally {
      setPending(null);
    }
  }

  async function onUpdate(id: string) {
    const fieldErrors = validatePillarDraft(editDraft, pillars, { editingId: id });
    if (Object.keys(fieldErrors).length) {
      setEditErrors(fieldErrors);
      return;
    }
    setPending(`edit-${id}`);
    setMessage(null);
    setEditErrors({});
    try {
      const result = await updateStudioPillar(id, editDraft);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setEditErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      setEditingId(null);
      setMessage("Pillar updated.");
      router.refresh();
    } catch {
      setMessage("Could not update that pillar.");
    } finally {
      setPending(null);
    }
  }

  async function onDelete(id: string) {
    setPending(`delete-${id}`);
    setMessage(null);
    try {
      const result = await deleteStudioPillar(id);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      if (editingId === id) setEditingId(null);
      setMessage("Pillar deleted.");
      router.refresh();
    } catch {
      setMessage("Could not delete that pillar.");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div id="content-pillars" className="scroll-mt-8">
    <Card>
      <h2 className="font-serif text-2xl">Content pillars</h2>
      <p className="mt-2 text-sm leading-6 text-ink/70">
        Recurring themes for this brand, separate from optional topic keywords. You can keep up to{" "}
        {MAX_PILLARS}. Changing pillars does not generate or publish posts.
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-ink/50">{emptyPillarsCopy(pillars.length)}</p>

      {message ? (
        <p className="mt-3 text-sm text-ink/70" role="status">
          {message}
        </p>
      ) : null}

      {pillars.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-ink/65">
          Start with a few themes you return to often, such as education, behind-the-scenes, or offers.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {pillars.map((pillar) => (
            <li key={pillar.id} className="rounded-xl border border-ink/10 p-4">
              {editingId === pillar.id ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor={`edit-name-${pillar.id}`}>Name</Label>
                    <Input
                      id={`edit-name-${pillar.id}`}
                      value={editDraft.name}
                      onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                    />
                    {editErrors.name ? (
                      <p className="mt-1.5 text-sm text-accent" role="alert">
                        {editErrors.name}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor={`edit-desc-${pillar.id}`}>Description</Label>
                    <Textarea
                      id={`edit-desc-${pillar.id}`}
                      rows={3}
                      value={editDraft.description}
                      onChange={(event) =>
                        setEditDraft({ ...editDraft, description: event.target.value })
                      }
                    />
                    {editErrors.description ? (
                      <p className="mt-1.5 text-sm text-accent" role="alert">
                        {editErrors.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => onUpdate(pillar.id)} disabled={busy}>
                      {pending === `edit-${pillar.id}` ? "Saving…" : "Save pillar"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditingId(null)} disabled={busy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="font-medium">{pillar.name}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink/75">{pillar.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(pillar.id);
                        setEditDraft({ name: pillar.name, description: pillar.description });
                        setEditErrors({});
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onDelete(pillar.id)}
                    >
                      {pending === `delete-${pillar.id}` ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t border-ink/10 pt-5">
        <h3 className="font-serif text-xl">Add a pillar</h3>
        {atLimit ? (
          <p className="mt-2 text-sm text-ink/70">Maximum of {MAX_PILLARS} reached. Delete one to add another.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="pillar-name">Name</Label>
              <Input
                id="pillar-name"
                value={draft.name}
                onChange={(event) => {
                  setDraft({ ...draft, name: event.target.value });
                  setErrors((current) => ({ ...current, name: undefined }));
                }}
                placeholder="e.g. Practical education"
              />
              {errors.name ? (
                <p className="mt-1.5 text-sm text-accent" role="alert">
                  {errors.name}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="pillar-description">What this covers</Label>
              <Textarea
                id="pillar-description"
                rows={3}
                value={draft.description}
                onChange={(event) => {
                  setDraft({ ...draft, description: event.target.value });
                  setErrors((current) => ({ ...current, description: undefined }));
                }}
                placeholder="Short description of the theme, audience need, or angle."
              />
              {errors.description ? (
                <p className="mt-1.5 text-sm text-accent" role="alert">
                  {errors.description}
                </p>
              ) : null}
            </div>
            {errors.form ? (
              <p className="text-sm text-accent" role="alert">
                {errors.form}
              </p>
            ) : null}
            <Button type="button" onClick={onCreate} disabled={busy}>
              {pending === "create" ? "Saving…" : "Save pillar"}
            </Button>
          </div>
        )}
      </div>
    </Card>
    </div>
  );
}
