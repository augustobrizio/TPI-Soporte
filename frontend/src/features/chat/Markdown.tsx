"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renderiza el Markdown que devuelve el asistente: negritas, viñetas, links,
 * TABLAS (horarios, fechas), blockquotes (avisos destacados) y títulos.
 *
 * remark-gfm habilita tablas y autolinks. react-markdown NO interpreta HTML
 * crudo por defecto, así que es seguro contra inyección. Estilamos cada
 * elemento con los tokens del diseño para mantener el control.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-medium text-on-surface">{children}</strong>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-surface-container-lowest px-1 py-0.5 text-xs">
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h2 className="mb-2 mt-1 font-headline text-base font-bold text-on-surface">
            {children}
          </h2>
        ),
        h2: ({ children }) => (
          <h3 className="mb-2 mt-1 font-headline text-base font-bold text-on-surface">
            {children}
          </h3>
        ),
        h3: ({ children }) => (
          <h4 className="mb-1 mt-1 font-headline text-sm font-medium text-on-surface">
            {children}
          </h4>
        ),
        hr: () => <hr className="my-3 border-0 border-t border-outline-variant/20" />,
        blockquote: ({ children }) => (
          <blockquote className="my-2 rounded-r-lg border-l-2 border-primary/50 bg-primary/5 py-2 pl-3 pr-2 text-on-surface-variant">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-outline-variant/30">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1.5 font-medium text-on-surface">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border-b border-outline-variant/10 px-2 py-1.5 align-top text-on-surface-variant">
            {children}
          </td>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
