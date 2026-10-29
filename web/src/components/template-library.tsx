"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createStudioTemplate,
  deleteStudioTemplate,
  updateStudioTemplate,
} from "@/app/studio/templates/actions";
import { isExpiredSessionMessage } from "@/lib/api-auth";
import { formatPlatform, type Platform } from "@/lib/brand";
import { formatLabel } from "@/lib/content";
import {
  MAX_TEMPLATES,
  TEMPLATE_CATEGORIES,
  canAddTemplate,
  categoryLabel,
  emptyTemplateDraft,
  emptyTemplateStructure,
  validateTemplateDraft,
  type ContentTemplate,
  type TemplateDraft,
  type TemplateFieldErrors,
  type TemplateSection,
} from "@/lib/templates";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

function applyHref(template: ContentTemplate): string {
  if (template.source === "system") {
    const slug = template.id.replace(/^system:/, "");
    return `/studio/create?system=${encodeURIComponent(slug)}`;
  }
  return `/studio/create?template=${encodeURIComponent(template.id)}`;
}

function TemplateFormFields({
  draft,
  errors,
  onChange,
  idPrefix,
}: {
  draft: TemplateDraft;
  errors: TemplateFieldErrors;
  onChange: (next: TemplateDraft) => void;
  idPrefix: string;
}) {
  function setSection(index: number, patch: Partial<TemplateSection>) {
    const sections = draft.structure.sections.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    );
    onChange({ ...draft, structure: { ...draft.structure, sections } });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={draft.name}
          aria-invalid={Boolean(errors.name)}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
        {errors.name ? (
          <p className="mt-1.5 text-sm text-accent" role="alert">
            {errors.name}
          </p>
        ) : null}
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-description`}>When to use it</Label>
        <Textarea
          id={`${idPrefix}-description`}
          rows={3}
          value={draft.description}
          aria-invalid={Boolean(errors.description)}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
        />
        {errors.description ? (
          <p className="mt-1.5 text-sm text-accent" role="alert">
            {errors.description}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${idPrefix}-category`}>Category</Label>
          <select
            id={`${idPrefix}-category`}
            className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            value={draft.category}
            onChange={(event) => onChange({ ...draft, category: event.target.value as TemplateDraft["category"] })}
          >
            {TEMPLATE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-format`}>Format</Label>
          <select
            id={`${idPrefix}-format`}
            className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            value={draft.content_format}
            onChange={(event) =>
              onChange({ ...draft, content_format: event.target.value as TemplateDraft["content_format"] })
            }
          >
            <option value="text_post">Text post</option>
            <option value="caption">Caption</option>
            <option value="carousel">Carousel outline</option>
            <option value="script">Short-video script</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-platform`}>Platform (optional)</Label>
          <select
            id={`${idPrefix}-platform`}
            className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            value={draft.platform}
            onChange={(event) => onChange({ ...draft, platform: event.target.value as Platform | "" })}
          >
            <option value="">Any brand platform</option>
            <option value="linkedin">LinkedIn</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
      </div>
      {(draft.structure.sections.length ? draft.structure.sections : [{ title: "", instruction: "" }]).map(
        (section, index) => (
          <div key={`${idPrefix}-section-${index}`} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${idPrefix}-section-title-${index}`}>{`Section ${index + 1} title`}</Label>
              <Input
                id={`${idPrefix}-section-title-${index}`}
                value={section.title}
                onChange={(event) => {
                  const sections = [...draft.structure.sections];
                  if (!sections[index]) sections[index] = { title: "", instruction: "" };
                  setSection(index, { title: event.target.value });
                  if (!draft.structure.sections.length) {
                    onChange({
                      ...draft,
                      structure: {
                        ...draft.structure,
                        sections: [{ title: event.target.value, instruction: "" }],
                      },
                    });
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-section-body-${index}`}>Instruction</Label>
              <Input
                id={`${idPrefix}-section-body-${index}`}
                value={section.instruction}
                onChange={(event) => {
                  if (!draft.structure.sections.length) {
                    onChange({
                      ...draft,
                      structure: {
                        ...draft.structure,
                        sections: [{ title: "", instruction: event.target.value }],
                      },
                    });
                    return;
                  }
                  setSection(index, { instruction: event.target.value });
                }}
              />
            </div>
          </div>
        ),
      )}
      <div>
        <Label htmlFor={`${idPrefix}-hook`}>Hook guidance (optional)</Label>
        <Input
          id={`${idPrefix}-hook`}
          value={draft.structure.hook}
          onChange={(event) =>
            onChange({ ...draft, structure: { ...draft.structure, hook: event.target.value } })
          }
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-cta`}>CTA guidance (optional)</Label>
        <Input
          id={`${idPrefix}-cta`}
          value={draft.structure.cta}
          onChange={(event) =>
            onChange({ ...draft, structure: { ...draft.structure, cta: event.target.value } })
          }
        />
      </div>
      {errors.structure ? (
        <p className="text-sm text-accent" role="alert">
          {errors.structure}
        </p>
      ) : null}
      {errors.form ? (
        <p className="text-sm text-accent" role="alert">
          {errors.form}
        </p>
      ) : null}
    </div>
  );
}

function Preview({ template }: { template: ContentTemplate }) {
  return (
    <div className="mt-3 space-y-2 text-sm leading-6 text-ink/75">
      <p>{template.description}</p>
      <p>
        {formatLabel(template.content_format)}
        {template.platform ? ` · ${formatPlatform(template.platform)}` : " · any brand platform"}
        {template.structure.suggestedLength ? ` · ${template.structure.suggestedLength}` : ""}
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        {template.structure.sections.map((section) => (
          <li key={`${template.id}-${section.title}`}>
            <span className="font-medium">{section.title}.</span> {section.instruction}
          </li>
        ))}
      </ol>
      {template.structure.hook ? <p>Hook: {template.structure.hook}</p> : null}
      {template.structure.cta ? <p>CTA: {template.structure.cta}</p> : null}
    </div>
  );
}

export function TemplateLibrary({
  templates,
  loadError,
}: {
  templates: ContentTemplate[];
  loadError: string | null;
}) {
  const router = useRouter();
  const userTemplates = useMemo(() => templates.filter((item) => item.source === "user"), [templates]);
  const systemTemplates = useMemo(() => templates.filter((item) => item.source === "system"), [templates]);
  const [draft, setDraft] = useState<TemplateDraft>({
    ...emptyTemplateDraft(),
    structure: { ...emptyTemplateStructure(), sections: [{ title: "", instruction: "" }] },
  });
  const [errors, setErrors] = useState<TemplateFieldErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TemplateDraft>(emptyTemplateDraft());
  const [editErrors, setEditErrors] = useState<TemplateFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(systemTemplates[0]?.id ?? null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const atLimit = !canAddTemplate(userTemplates.length);

  function handleExpired(text: string) {
    if (isExpiredSessionMessage(text)) {
      router.push("/login?next=/studio/templates");
      router.refresh();
      return true;
    }
    return false;
  }

  async function onCreate() {
    const fieldErrors = validateTemplateDraft(draft, userTemplates);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setPending("create");
    setMessage(null);
    try {
      const result = await createStudioTemplate(draft);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      setDraft({
        ...emptyTemplateDraft(),
        structure: { ...emptyTemplateStructure(), sections: [{ title: "", instruction: "" }] },
      });
      setErrors({});
      setMessage("Template saved. Applying it opens a new draft; existing drafts are unchanged.");
      router.refresh();
    } catch {
      setMessage("Could not save that template.");
    } finally {
      setPending(null);
    }
  }

  async function onUpdate(id: string) {
    const fieldErrors = validateTemplateDraft(editDraft, userTemplates, { editingId: id });
    if (Object.keys(fieldErrors).length) {
      setEditErrors(fieldErrors);
      return;
    }
    setPending(`edit-${id}`);
    setMessage(null);
    try {
      const result = await updateStudioTemplate(id, editDraft);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setEditErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      setEditingId(null);
      setMessage("Template updated.");
      router.refresh();
    } catch {
      setMessage("Could not update that template.");
    } finally {
      setPending(null);
    }
  }

  async function onDelete(id: string) {
    setPending(`delete-${id}`);
    setMessage(null);
    try {
      const result = await deleteStudioTemplate(id);
      if (!result.ok) {
        if (handleExpired(result.message)) return;
        setMessage(result.message);
        return;
      }
      setConfirmDeleteId(null);
      setMessage("Template deleted. Saved drafts that used it are unchanged.");
      router.refresh();
    } catch {
      setMessage("Could not delete that template.");
    } finally {
      setPending(null);
    }
  }

  function startEdit(template: ContentTemplate) {
    setEditingId(template.id);
    setEditDraft({
      name: template.name,
      description: template.description,
      category: template.category,
      content_format: template.content_format,
      platform: template.platform,
      structure: {
        ...template.structure,
        sections: template.structure.sections.length
          ? template.structure.sections
          : [{ title: "", instruction: "" }],
      },
    });
    setEditErrors({});
  }

  const preview =
    templates.find((item) => item.id === previewId) ?? systemTemplates[0] ?? userTemplates[0] ?? null;

  return (
    <div className="space-y-8">
      {loadError ? (
        <p className="text-sm text-accent" role="alert">
          {loadError} Built-in templates are still available. Apply your own SQL migration to save custom ones.
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-ink/70" role="status">
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-serif text-2xl">Preview</h2>
          <p className="mt-2 text-sm text-ink/70">
            Applying a template fills writing instructions on a new draft. It does not overwrite a saved
            post or change your brand voice.
          </p>
          {preview ? (
            <>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-ink/50">
                {preview.source === "system" ? "Built-in" : "Your template"} · {categoryLabel(preview.category)}
              </p>
              <h3 className="mt-1 font-serif text-xl">{preview.name}</h3>
              <Preview template={preview} />
              <div className="mt-4">
                <ButtonLink href={applyHref(preview)}>Use on a new draft</ButtonLink>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-ink/70">No templates to preview yet.</p>
          )}
        </Card>

        <Card>
          <h2 className="font-serif text-2xl">Save your own</h2>
          <p className="mt-2 text-sm text-ink/70">
            {userTemplates.length} of {MAX_TEMPLATES} custom templates. Built-in structures stay available.
          </p>
          {atLimit ? (
            <p className="mt-3 text-sm text-ink/70">Delete one of yours to add another.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <TemplateFormFields idPrefix="create" draft={draft} errors={errors} onChange={setDraft} />
              <Button type="button" onClick={onCreate} disabled={pending === "create"}>
                {pending === "create" ? "Saving…" : "Save template"}
              </Button>
            </div>
          )}
        </Card>
      </div>

      <section>
        <h2 className="font-serif text-2xl">Built-in structures</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {systemTemplates.map((template) => (
            <li key={template.id}>
              <article className="rounded-2xl border border-ink/10 bg-paper-raised p-5">
                <p className="text-xs uppercase tracking-[0.14em] text-ink/50">{categoryLabel(template.category)}</p>
                <h3 className="mt-1 font-serif text-xl">{template.name}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/70">{template.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => setPreviewId(template.id)}>
                    Preview
                  </Button>
                  <ButtonLink href={applyHref(template)} variant="ghost">
                    Use on a new draft
                  </ButtonLink>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-2xl">Your templates</h2>
        {userTemplates.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-ink/70">
            None saved yet. Use a built-in structure or save one from a draft you like. Nothing is published.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {userTemplates.map((template) => (
              <li key={template.id} className="rounded-2xl border border-ink/10 p-5">
                {editingId === template.id ? (
                  <div className="space-y-4">
                    <TemplateFormFields
                      idPrefix={`edit-${template.id}`}
                      draft={editDraft}
                      errors={editErrors}
                      onChange={setEditDraft}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => onUpdate(template.id)}
                        disabled={pending === `edit-${template.id}`}
                      >
                        {pending === `edit-${template.id}` ? "Saving…" : "Save changes"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="font-serif text-xl">{template.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink/70">{template.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" onClick={() => setPreviewId(template.id)}>
                        Preview
                      </Button>
                      <ButtonLink href={applyHref(template)} variant="ghost">
                        Use on a new draft
                      </ButtonLink>
                      <Button type="button" variant="ghost" onClick={() => startEdit(template)}>
                        Edit
                      </Button>
                      {confirmDeleteId === template.id ? (
                        <>
                          <Button
                            type="button"
                            onClick={() => onDelete(template.id)}
                            disabled={pending === `delete-${template.id}`}
                          >
                            {pending === `delete-${template.id}` ? "Deleting…" : "Confirm delete"}
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                            Keep template
                          </Button>
                        </>
                      ) : (
                        <Button type="button" variant="ghost" onClick={() => setConfirmDeleteId(template.id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
