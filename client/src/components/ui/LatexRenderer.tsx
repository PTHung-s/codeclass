import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import katex from "katex";
import "katex/dist/katex.min.css";

interface LatexRendererProps {
  text: string;
  className?: string;
}

const GENUINE_HTML_RE =
  /<\/?(?:p|div|br|hr|ul|ol|li|table|thead|tbody|tr|td|th|h[1-6]|strong|em|b|i|u|blockquote|pre|img|a|span|sub|sup)\b[^>]*>/i;

export function looksLikeHtml(text: string): boolean {
  if (!text) return false;
  const stripped = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]+?\$/g, "");
  return GENUINE_HTML_RE.test(stripped);
}

export default function LatexRenderer({ text, className = "" }: LatexRendererProps) {
  if (!text) return null;
  const hasHtml = looksLikeHtml(text);
  const normalizedMarkdown = hasHtml ? text : normalizeMarkdown(text);

  return (
    <div className={`md-body ${className}`}>
      {hasHtml ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} />
      ) : (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {normalizedMarkdown}
        </ReactMarkdown>
      )}
    </div>
  );
}

function normalizeMarkdown(text: string) {
  // Che các khối toán $...$ / $$...$$ bằng placeholder thuần ký tự in được,
  // để các phép biến đổi dòng (đặc biệt regex chèn newline trước " - "/" * ")
  // KHÔNG xé nát công thức toán.
  const stash: string[] = [];
  const shield = (m: string) => {
    stash.push(m);
    return "@@DSHM" + (stash.length - 1) + "@@";
  };
  const shielded = text
    .replace(/\$\$[\s\S]+?\$\$/g, shield)
    .replace(/\$[^$\n]+?\$/g, shield);

  const normalized = shielded
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+(#{1,6}\s+)/g, "\n\n$1")
    .replace(/([^\n])([ \t]+[-*]\s+)/g, "$1\n$2")
    .replace(/[ \t]+(\|[^\n]*\|)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.replace(/@@DSHM(\d+)@@/g, (_, i) => stash[Number(i)]);
}

const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4",
  "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "span", "strong",
  "sub", "sup", "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
]);

const GLOBAL_ATTRS = new Set(["class", "colspan", "rowspan"]);

function isSafeUrl(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("http://")
    || trimmed.startsWith("https://")
    || trimmed.startsWith("/")
    || trimmed.startsWith("#")
    || trimmed.startsWith("data:image/");
}

export function sanitizeHtml(html: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const sanitizeNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      const allowed = GLOBAL_ATTRS.has(name)
        || (tag === "a" && ["href", "title", "target", "rel"].includes(name))
        || (tag === "img" && ["src", "alt", "title"].includes(name));

      if (!allowed || name.startsWith("on")) {
        element.removeAttribute(attr.name);
        continue;
      }

      if ((name === "href" || name === "src") && !isSafeUrl(value)) {
        element.removeAttribute(name);
      }
    }

    if (tag === "a") {
      element.setAttribute("rel", "noopener noreferrer");
    }

    for (const child of Array.from(element.childNodes)) {
      sanitizeNode(child);
    }
  };

  for (const child of Array.from(root.childNodes)) {
    sanitizeNode(child);
  }

  return root.innerHTML;
}

function renderMixed(text: string): string {
  let result = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return `$$${math}$$`;
    }
  });

  result = result.replace(/\$([^$]+?)\$/g, (_, math) => {
    if (math.includes("\n")) return `$${math}$`;
    try {
      return katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return `$${math}$`;
    }
  });

  result = result.replace(/~([^~]+?)~/g, (_, math) => {
    if (math.includes("\n")) return `$$${math}$$`;
    try {
      return katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return `$$${math}$`;
    }
  });

  result = result.replace(/\n\n/g, "<br/><br/>");
  result = result.replace(/\n/g, "<br/>");

  return result;
}

export function renderLatex(text: string): string {
  if (!text) return "";
  return renderMixed(text);
}
