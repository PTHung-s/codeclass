export type BuilderQuestion =
  | {
      uid: string;
      loai: "trac_nghiem";
      ma_cau: string;
      diem: number;
      do_kho: number;
      stem: string;
      lua_chon: string[];
      dap_an_index: number;
      giai_thich?: string;
      ky_nang?: string[];
    }
  | {
      uid: string;
      loai: "tra_loi_ngan";
      ma_cau: string;
      diem: number;
      do_kho: number;
      stem: string;
      dap_an_text: string;
      huong_dan_cham?: string;
      ky_nang?: string[];
    }
  | {
      uid: string;
      loai: "thuc_hanh";
      ma_cau: string;
      diem: number;
      do_kho: number;
      stem: string;
      ngon_ngu: "python" | "cpp";
      code_dap_an: string;
      sample_input: string;
      sample_output: string;
      rang_buoc?: string;
      ky_nang?: string[];
    };

export type BuilderQuestionInput =
  | Omit<Extract<BuilderQuestion, { loai: "trac_nghiem" }>, "uid" | "ma_cau">
  | Omit<Extract<BuilderQuestion, { loai: "tra_loi_ngan" }>, "uid" | "ma_cau">
  | Omit<Extract<BuilderQuestion, { loai: "thuc_hanh" }>, "uid" | "ma_cau">;

let uidCounter = 1;
export const nextUid = () => `q-${Date.now()}-${uidCounter++}`;
