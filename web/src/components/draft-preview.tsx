import { formatPlatform } from "@/lib/brand";
import { formatLabel, type GeneratedContent } from "@/lib/content";
import { Card } from "@/components/ui/card";

export function DraftPreview({ content }: { content: GeneratedContent }) {
  return (
    <Card className="bg-paper">
      <p className="text-xs uppercase tracking-[0.14em] text-ink/50">
        {formatPlatform(content.platform)} · {formatLabel(content.format)} preview
      </p>
      <p className="mt-1 text-xs text-ink/45">
        Approximate layout for review. Not a live {formatPlatform(content.platform)} post.
      </p>
      <h2 className="mt-4 font-serif text-2xl">{content.title}</h2>
      {content.format === "carousel" ? (
        <ol className="mt-4 space-y-3">
          {content.slides.map((slide, index) => (
            <li key={`${slide.title}-${index}`} className="rounded-xl border border-ink/10 bg-paper-raised p-4">
              <p className="text-xs text-ink/50">Slide {index + 1}</p>
              {slide.title ? <p className="mt-1 font-medium">{slide.title}</p> : null}
              <p className="mt-1 text-sm leading-6 text-ink/80">{slide.text}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {content.format === "script" && content.script ? (
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Hook</dt>
            <dd className="mt-1 leading-6">{content.script.hook}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Body</dt>
            <dd className="mt-1 leading-6">{content.script.body}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink/50">Call to action</dt>
            <dd className="mt-1 leading-6">{content.script.cta}</dd>
          </div>
        </dl>
      ) : null}
      {content.format === "text_post" || content.format === "caption" ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-ink/85">{content.body}</p>
      ) : null}
      {content.hashtags.length ? (
        <p className="mt-4 text-sm text-accent">{content.hashtags.join(" ")}</p>
      ) : null}
    </Card>
  );
}
