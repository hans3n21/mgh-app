'use client';

import { useMemo } from 'react';

// Lightweight sanitizer for basic HTML
function sanitizeBasic(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const scripts = template.content.querySelectorAll('script, iframe, object, embed');
  scripts.forEach((el) => el.remove());
  const anchors = template.content.querySelectorAll('a');
  anchors.forEach((a) => {
    a.setAttribute('rel', 'noopener noreferrer nofollow');
    a.setAttribute('target', '_blank');
  });
  return template.innerHTML;
}

export default function MailContent({ html, text }: { html: string | null; text: string }) {
  const safeHtml = useMemo(() => {
    if (html) {
      try {
        return sanitizeBasic(html);
      } catch {
        return '';
      }
    }
    return '';
  }, [html]);

  if (safeHtml) {
    return (
      <div 
        className="text-sm leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-sky-400 [&_a]:hover:text-sky-300"
        dangerouslySetInnerHTML={{ __html: safeHtml }} 
      />
    );
  }

  return (
    <pre className="whitespace-pre-wrap text-sm">{text}</pre>
  );
}
