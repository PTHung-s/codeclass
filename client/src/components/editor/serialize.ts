import { Block, BlockType, createBlock, genId } from "./types";

// ========== BLOCKS → HTML ==========

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading": {
          const lvl = b.meta?.level || "h2";
          return `<${lvl}>${b.content}</${lvl}>`;
        }
        case "paragraph":
          return `<p>${b.content}</p>`;
        case "code": {
          const code = escapeHtml(b.content);
          if (b.meta?.runner === "true") {
            return `<!--PYTHON_RUN-->\n<pre><code>${code}</code></pre>\n<!--/PYTHON_RUN-->`;
          }
          return `<pre><code>${code}</code></pre>`;
        }
        case "challenge": {
          const expected = b.meta?.expected || "";
          const code = escapeHtml(b.content);
          return `<!--CHALLENGE {"expected":"${expected.replace(/"/g, '\\"')}"}-->\n<pre><code>${code}</code></pre>\n<!--/CHALLENGE-->`;
        }
        case "fact-card": {
          const color = b.meta?.color || "#3b82f6";
          return `<div class="fact-card" style="border-left-color:${color}">${b.content}</div>`;
        }
        case "warning": {
          return `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:0.5rem;padding:0.75rem;margin:1rem 0">${b.content}</div>`;
        }
        case "tip": {
          const color = b.meta?.color || "#0066cc";
          return `<div style="background:#f5f3ff;border:1px solid ${color};border-radius:0.5rem;padding:0.75rem;margin:1rem 0">${b.content}</div>`;
        }
        case "quiz": {
          const options: string[] = JSON.parse(b.meta?.options || '["A","B","C","D"]');
          const answer = parseInt(b.meta?.answer || "0");
          const opts = options
            .map(
              (opt, i) =>
                `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.7rem;border:1px solid #e2e8f0;border-radius:0.4rem;cursor:pointer;background:white;margin-bottom:0.3rem"><input type="radio" name="quiz_${b.id}" value="${i}" style="accent-color:#3b82f6"> ${String.fromCharCode(65 + i)}. ${opt}</label>`
            )
            .join("");
          return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1rem;margin:1rem 0">
<p><strong>${b.content}</strong></p>
<div style="margin-top:0.5rem">${opts}</div>
<button onclick="var s=document.querySelector('input[name=quiz_${b.id}]:checked');var r=document.getElementById('quizR_${b.id}');if(!s){r.innerHTML='⚠️ Chọn đáp án!';r.style.color='#d97706'}else if(s.value==='${answer}'){r.innerHTML='✅ Đúng!';r.style.color='#059669'}else{r.innerHTML='❌ Sai';r.style.color='#dc2626'}" style="margin-top:0.5rem;padding:0.4rem 1rem;background:#2563eb;color:white;border:none;border-radius:0.4rem;cursor:pointer;font-size:0.85rem">Kiểm tra</button>
<p id="quizR_${b.id}" style="margin-top:0.5rem;font-weight:600"></p>
</div>`;
        }
        case "divider":
          return "<hr>";
        case "html":
          return b.content;
        default:
          return b.content;
      }
    })
    .join("\n\n");
}

// ========== HTML → BLOCKS (best-effort parsing) ==========

function cleanHtml(html: string): string {
  return html.trim();
}

export function htmlToBlocks(html: string): Block[] {
  if (!html || !html.trim()) return [createBlock("paragraph")];

  const blocks: Block[] = [];
  const cleaned = cleanHtml(html);

  // Try to parse markers first
  const markerRegex = /<!--(PYTHON_RUN|CHALLENGE)\s*({[^}]*})?\s*-->([\s\S]*?)<!--\/\1-->/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(cleaned)) !== null) {
    // Parse content before marker
    if (match.index > lastIdx) {
      const before = cleaned.slice(lastIdx, match.index).trim();
      if (before) blocks.push(...parseSimpleHtml(before));
    }

    const markerType = match[1];
    const configJson = match[2];
    const inner = match[3];
    const codeMatch = inner.match(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/i);
    const code = codeMatch
      ? codeMatch[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim()
      : inner.trim();

    if (markerType === "CHALLENGE" && configJson) {
      try {
        const config = JSON.parse(configJson);
        blocks.push(createBlock("challenge", { content: code, meta: { expected: config.expected || "", language: "python" } }));
      } catch {
        blocks.push(createBlock("code", { content: code, meta: { runner: "true", language: "python" } }));
      }
    } else {
      blocks.push(createBlock("code", { content: code, meta: { runner: "true", language: "python" } }));
    }

    lastIdx = markerRegex.lastIndex;
  }

  // Parse remaining HTML
  if (lastIdx < cleaned.length) {
    const after = cleaned.slice(lastIdx).trim();
    if (after) blocks.push(...parseSimpleHtml(after));
  }

  return blocks.length > 0 ? blocks : [createBlock("paragraph")];
}

function parseSimpleHtml(html: string): Block[] {
  const blocks: Block[] = [];

  // Split by top-level block elements
  const parts = html.split(/(<(?:h[23]|p|pre|div|hr|ul|ol|table)[^>]*>[\s\S]*?<\/\1>)/gi);

  for (const part of parts) {
    if (!part.trim()) continue;

    // Heading
    const hMatch = part.match(/^<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h[23]>\s*$/i);
    if (hMatch) {
      blocks.push(createBlock("heading", { content: hMatch[2].trim(), meta: { level: `h${hMatch[1]}` } }));
      continue;
    }

    // HR
    if (/^<hr\s*\/?>\s*$/i.test(part)) {
      blocks.push(createBlock("divider"));
      continue;
    }

    // Pre/code (without markers)
    const preMatch = part.match(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/i);
    if (preMatch) {
      const code = preMatch[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
      blocks.push(createBlock("code", { content: code, meta: { language: "python" } }));
      continue;
    }

    // Paragraph
    const pMatch = part.match(/^<p(?:\s[^>]*)?>([\s\S]*?)<\/p>\s*$/i);
    if (pMatch) {
      blocks.push(createBlock("paragraph", { content: pMatch[1].trim() }));
      continue;
    }

    // Fact card
    if (/class="fact-card"/i.test(part)) {
      const colorMatch = part.match(/border-left-color:\s*([#\w]+)/i);
      const innerMatch = part.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
      blocks.push(createBlock("fact-card", {
        content: innerMatch ? innerMatch[1].trim() : part,
        meta: { color: colorMatch ? colorMatch[1] : "#3b82f6" },
      }));
      continue;
    }

    // Everything else → html block
    blocks.push(createBlock("html", { content: part.trim() }));
  }

  return blocks;
}
