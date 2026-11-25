import type { ExamJsonCauHoi, ExamJsonDocument } from "./examTypes";
import { SUPPORTED_EXAM_JSON_VERSIONS, asStringArray } from "./examTypes";

export class ExamImportError extends Error {
  details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "ExamImportError";
    this.details = details;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function reqString(obj: Record<string, unknown>, key: string, path: string, errors: string[]): string {
  const v = obj[key];
  if (typeof v !== "string" || !v.trim()) {
    errors.push(`${path}.${key} phải là chuỗi không rỗng`);
    return "";
  }
  return v.trim();
}

function reqNumber(obj: Record<string, unknown>, key: string, path: string, errors: string[]): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    errors.push(`${path}.${key} phải là số`);
    return NaN;
  }
  return v;
}

/** Validate and normalize teacher-uploaded exam JSON (Vietnamese keys). */
export function parseAndValidateExamJson(raw: unknown): ExamJsonDocument {
  const errors: string[] = [];
  if (!isObject(raw)) throw new ExamImportError("JSON gốc phải là object", ["root"]);

  const phien = String(raw.phien_ban ?? "");
  if (!SUPPORTED_EXAM_JSON_VERSIONS.has(phien)) {
    errors.push(`phien_ban không hỗ trợ: ${phien || "(trống)"} — dùng "1.0"`);
  }

  if (!isObject(raw.de_thi)) {
    errors.push("de_thi bắt buộc");
    throw new ExamImportError("JSON đề thi không hợp lệ", errors);
  }
  const de = raw.de_thi;
  const tieu_de = reqString(de, "tieu_de", "de_thi", errors);
  const thoi_gian_phut = reqNumber(de, "thoi_gian_phut", "de_thi", errors);
  if (Number.isFinite(thoi_gian_phut) && (thoi_gian_phut < 1 || thoi_gian_phut > 24 * 60)) {
    errors.push("de_thi.thoi_gian_phut phải trong khoảng 1–1440");
  }

  let thang_diem = 100;
  if (de.thang_diem !== undefined) {
    thang_diem = reqNumber(de, "thang_diem", "de_thi", errors);
    if (Number.isFinite(thang_diem) && thang_diem <= 0) errors.push("de_thi.thang_diem phải > 0");
  }

  const che = de.che_do_chat === undefined ? "nghiem" : String(de.che_do_chat);
  if (che !== "nghiem" && che !== "ghi_log") errors.push('de_thi.che_do_chat phải là "nghiem" | "ghi_log"');

  const ngon_ngu_code = de.ngon_ngu_code === undefined
    ? (["python", "cpp"] as const)
    : asStringArray(de.ngon_ngu_code).map((x) => x.toLowerCase());
  for (const lang of ngon_ngu_code) {
    if (lang !== "python" && lang !== "cpp") errors.push(`de_thi.ngon_ngu_code không hợp lệ: ${lang}`);
  }

  if (!Array.isArray(raw.cau_hoi) || raw.cau_hoi.length === 0) {
    errors.push("cau_hoi phải là mảng có ít nhất 1 câu");
  }

  const codes = new Set<string>();
  const cau_hoi: ExamJsonCauHoi[] = [];
  const list = Array.isArray(raw.cau_hoi) ? raw.cau_hoi : [];

  list.forEach((item, idx) => {
    const path = `cau_hoi[${idx}]`;
    if (!isObject(item)) {
      errors.push(`${path} phải là object`);
      return;
    }
    const ma_cau = reqString(item, "ma_cau", path, errors);
    if (ma_cau) {
      if (codes.has(ma_cau)) errors.push(`${path}.ma_cau trùng: ${ma_cau}`);
      codes.add(ma_cau);
    }
    const loai = String(item.loai ?? "");
    if (!["trac_nghiem", "tra_loi_ngan", "thuc_hanh"].includes(loai)) {
      errors.push(`${path}.loai không hợp lệ`);
    }
    const do_kho = reqNumber(item, "do_kho", path, errors);
    if (Number.isFinite(do_kho) && (do_kho < 1 || do_kho > 5 || !Number.isInteger(do_kho))) {
      errors.push(`${path}.do_kho phải là số nguyên 1–5`);
    }
    const diem = reqNumber(item, "diem", path, errors);
    if (Number.isFinite(diem) && diem <= 0) errors.push(`${path}.diem phải > 0`);
    const stem = reqString(item, "stem", path, errors);

    const base: ExamJsonCauHoi = {
      ma_cau,
      loai: loai as ExamJsonCauHoi["loai"],
      do_kho,
      diem,
      stem,
      ky_nang: asStringArray(item.ky_nang),
      tags: asStringArray(item.tags),
    };

    if (loai === "trac_nghiem") {
      const lua_chon = asStringArray(item.lua_chon);
      if (lua_chon.length < 2 || lua_chon.length > 6) {
        errors.push(`${path}.lua_chon cần 2–6 lựa chọn`);
      }
      const dap_an_index = reqNumber(item, "dap_an_index", path, errors);
      if (Number.isFinite(dap_an_index)) {
        if (!Number.isInteger(dap_an_index) || dap_an_index < 0 || dap_an_index >= lua_chon.length) {
          errors.push(`${path}.dap_an_index ngoài phạm vi lua_chon`);
        }
      }
      base.lua_chon = lua_chon;
      base.dap_an_index = dap_an_index;
      if (typeof item.giai_thich === "string") base.giai_thich = item.giai_thich;
    } else if (loai === "tra_loi_ngan") {
      const dap_an = asStringArray(item.dap_an);
      if (dap_an.length < 1) errors.push(`${path}.dap_an cần ít nhất 1 đáp án tham chiếu`);
      base.dap_an = dap_an;
      if (typeof item.huong_dan_cham === "string") base.huong_dan_cham = item.huong_dan_cham;
    } else if (loai === "thuc_hanh") {
      const ngon_ngu = String(item.ngon_ngu ?? "").toLowerCase();
      if (ngon_ngu !== "python" && ngon_ngu !== "cpp") {
        errors.push(`${path}.ngon_ngu phải là python | cpp`);
      }
      const code_dap_an = typeof item.code_dap_an === "string" ? item.code_dap_an : "";
      if (!code_dap_an.trim()) errors.push(`${path}.code_dap_an bắt buộc`);
      const samples = Array.isArray(item.testcase_mau) ? item.testcase_mau : [];
      if (samples.length < 1) errors.push(`${path}.testcase_mau cần ≥ 1 sample`);
      const testcase_mau = samples.map((s, j) => {
        if (!isObject(s)) {
          errors.push(`${path}.testcase_mau[${j}] không hợp lệ`);
          return { input: "", output: "" };
        }
        if (typeof s.input !== "string" || typeof s.output !== "string") {
          errors.push(`${path}.testcase_mau[${j}] cần input/output string`);
        }
        return {
          input: String(s.input ?? ""),
          output: String(s.output ?? ""),
          mo_ta: typeof s.mo_ta === "string" ? s.mo_ta : undefined,
        };
      });
      base.ngon_ngu = ngon_ngu as "python" | "cpp";
      base.code_dap_an = code_dap_an;
      base.testcase_mau = testcase_mau;
      if (typeof item.mo_ta_de === "string") base.mo_ta_de = item.mo_ta_de;
      if (typeof item.rang_buoc === "string") base.rang_buoc = item.rang_buoc;
      if (isObject(item.goi_y_io)) {
        base.goi_y_io = {
          dinh_dang_input: typeof item.goi_y_io.dinh_dang_input === "string" ? item.goi_y_io.dinh_dang_input : undefined,
          dinh_dang_output: typeof item.goi_y_io.dinh_dang_output === "string" ? item.goi_y_io.dinh_dang_output : undefined,
        };
      }
      if (isObject(item.sinh_testcase)) {
        const st = item.sinh_testcase;
        base.sinh_testcase = {
          so_luong: typeof st.so_luong === "number" ? st.so_luong : 10,
          chien_luoc: typeof st.chien_luoc === "string" ? st.chien_luoc : "de_den_max_constraints",
          ghi_chu_cho_llm: typeof st.ghi_chu_cho_llm === "string" ? st.ghi_chu_cho_llm : undefined,
        };
      }
    }

    cau_hoi.push(base);
  });

  if (errors.length) throw new ExamImportError("JSON đề thi không hợp lệ", errors);

  return {
    phien_ban: phien,
    de_thi: {
      tieu_de,
      mo_ta: typeof de.mo_ta === "string" ? de.mo_ta : undefined,
      mon: typeof de.mon === "string" ? de.mon : undefined,
      thoi_gian_phut,
      thang_diem,
      che_do_chat: che as "nghiem" | "ghi_log",
      cho_xem_ket_qua: Boolean(de.cho_xem_ket_qua),
      ngon_ngu_code: ngon_ngu_code as ("python" | "cpp")[],
      ghi_chu_giao_vien: typeof de.ghi_chu_giao_vien === "string" ? de.ghi_chu_giao_vien : undefined,
    },
    cau_hoi,
  };
}
