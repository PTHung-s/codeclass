/**
 * ZIP writer tối giản — CHỈ dùng `zlib` có sẵn của Node.
 *
 * LÝ DO TỰ VIẾT: server này đang chạy thật phục vụ lớp học. Thêm 1 dependency
 * (archiver/jszip) vào production chỉ để xuất file là rủi ro không cần thiết.
 * Định dạng ZIP store/deflate rất đơn giản và đã được kiểm chứng bằng `unzip -t`.
 *
 * Hỗ trợ: nén deflate, tên file UTF-8 (cho tên học sinh tiếng Việt), CRC32.
 * Không hỗ trợ: ZIP64 (>4GB) — không cần vì file code rất nhỏ.
 */
import { deflateRawSync } from 'node:zlib';

/** Bảng CRC32 (IEEE 802.3) — bắt buộc để file ZIP hợp lệ. */
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Đường dẫn trong file zip, dùng '/' — VD "An/bai-1.py" */
  name: string;
  data: Buffer | string;
}

export function createZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const comp = deflateRawSync(data);
    const crc = crc32(data);

    // ── Local file header (30 byte) ──
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);   // signature
    lh.writeUInt16LE(20, 4);           // version needed
    lh.writeUInt16LE(0x0800, 6);       // flags: tên UTF-8
    lh.writeUInt16LE(8, 8);            // method: deflate
    lh.writeUInt16LE(0, 10);           // mod time
    lh.writeUInt16LE(0x21, 12);        // mod date (1980-01-01)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);           // extra length
    locals.push(lh, name, comp);

    // ── Central directory header (46 byte) ──
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);           // version made by
    ch.writeUInt16LE(20, 6);           // version needed
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);           // extra
    ch.writeUInt16LE(0, 32);           // comment
    ch.writeUInt16LE(0, 34);           // disk number
    ch.writeUInt16LE(0, 36);           // internal attrs
    ch.writeUInt32LE(0, 38);           // external attrs
    ch.writeUInt32LE(offset, 42);      // offset of local header
    centrals.push(ch, name);

    offset += lh.length + name.length + comp.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, cd, eocd]);
}

/** Đổi tên thành chuỗi an toàn để làm tên file/thư mục. */
export function safeFileName(name: string): string {
  return (
    (name || 'hoc-sinh')
      .normalize('NFC')
      .replace(/[\\/:*?"<>|]/g, '-')   // ký tự cấm trong tên file
      .replace(/\.\.+/g, '.')          // chặn path traversal
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'hoc-sinh'
  );
}

/** Đuôi file theo ngôn ngữ. */
export function extForLanguage(lang?: { name?: string } | null): string {
  const n = (lang?.name || 'python').toLowerCase();
  if (n.includes('javascript') || n === 'js') return 'js';
  if (n.includes('typescript') || n === 'ts') return 'ts';
  if (n.includes('csharp') || n === 'c#') return 'cs';
  if (n.includes('rust')) return 'rs';
  if (n.includes('java')) return 'java';
  if (n.includes('c++') || n === 'cpp') return 'cpp';
  if (n === 'c') return 'c';
  if (n.includes('ruby')) return 'rb';
  if (n.includes('go')) return 'go';
  if (n.includes('php')) return 'php';
  return 'py';
}
