import { esc } from "./email";

const STYLE = `body{font-family:-apple-system,Segoe UI,Arial,sans-serif;margin:0;padding:24px 16px;background:#F3F5F4;color:#16211F}
main{max-width:460px;margin:8vh auto 0;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;margin:0 0 12px;font-size:15px}
.note{white-space:pre-wrap;background:#F3F5F4;border-radius:8px;padding:10px 12px;font-size:14px}
input[type=text]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #B8C4C0;border-radius:6px;font-size:16px;margin:4px 0 14px}
button,.btn{display:inline-block;background:#1F5E57;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-size:15px;cursor:pointer;text-decoration:none}
label{font-size:14px;color:#56635F}
@media(prefers-color-scheme:dark){body{background:#101716;color:#E6ECEA}main{background:#18211F}.note{background:#222D2B}input[type=text]{background:#101716;color:#E6ECEA;border-color:#3A4A46}label{color:#9AA9A5}}`;

/** Small standalone HTML page for the email-link flows. Nothing here is cached or indexed. */
export function htmlPage(title: string, bodyHtml: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main><h1>${esc(title)}</h1>${bodyHtml}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    },
  });
}
