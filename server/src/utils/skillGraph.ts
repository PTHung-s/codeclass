/**
 * Skill Graph — seed data for the Skill Assessment system.
 * Ported from hackathon/Vietnam-AI-Innovation/data/seed/skill-graph.json
 *
 * Defines topics → skills for Python cơ bản (SGK Tin học 10).
 * Seed runs on server start if the Skill table is empty.
 */

export interface SkillSeed {
  skillId: string;
  topicId: string;
  topicName: string;
  name: string;
  description: string;
  orderIndex: number;
  prerequisites?: string[];
}

export interface TopicInfo {
  topicId: string;
  topicName: string;
  sequenceNo: number;
  skillIds: string[];
}

export const SKILL_SEEDS: SkillSeed[] = [
  // ── Topic: Làm quen với Python ──
  {
    skillId: "py.intro",
    topicId: "t0_intro",
    topicName: "Làm quen với Python",
    name: "Làm quen với Python — chương trình đầu tiên, print, đọc lỗi",
    description:
      "Hiểu Python là ngôn ngữ lập trình; viết lệnh print(); hiểu máy chạy code từ trên xuống; nhận biết SyntaxError cơ bản.",
    orderIndex: 0,
  },
  // ── Topic: Biến & vào/ra (tách thành 4 sub-skills) ──
  {
    skillId: "py.var_basic",
    topicId: "t1_basics",
    topicName: "Biến và vào/ra",
    name: "Biến và lệnh gán",
    description: "Khai báo biến, lệnh gán, quy tắc đặt tên biến.",
    orderIndex: 1,
  },
  {
    skillId: "py.var_types",
    topicId: "t1_basics",
    topicName: "Biến và vào/ra",
    name: "Kiểu dữ liệu cơ bản",
    description: "Phân biệt int, float, str, bool; chọn đúng kiểu cho bài toán.",
    orderIndex: 2,
  },
  {
    skillId: "py.var_cast",
    topicId: "t1_basics",
    topicName: "Biến và vào/ra",
    name: "Ép kiểu và chuyển đổi dữ liệu",
    description: "Dùng int(), float(), str() để chuyển đổi kiểu; đọc dữ liệu và ép kiểu.",
    orderIndex: 3,
  },
  {
    skillId: "py.io",
    topicId: "t1_basics",
    topicName: "Biến và vào/ra",
    name: "Vào/ra và định dạng output",
    description:
      "Dùng input() và print(); định dạng kết quả in (f-string, format); xử lý xuống dòng.",
    orderIndex: 4,
  },
  // ── Topic: Toán tử và biểu thức ──
  {
    skillId: "py.operators",
    topicId: "t1b_operators",
    topicName: "Toán tử và biểu thức",
    name: "Toán tử và biểu thức số học",
    description:
      "Các phép toán +, -, *, /, //, %, **; thứ tự ưu tiên; áp dụng công thức toán vào code.",
    orderIndex: 5,
  },
  // ── Topic: Rẽ nhánh ──
  {
    skillId: "py.branching",
    topicId: "t2_branching",
    topicName: "Rẽ nhánh",
    name: "Câu lệnh rẽ nhánh if/elif/else",
    description:
      "Dùng if/elif/else để điều khiển luồng chương trình; viết điều kiện lôgic; lồng điều kiện.",
    orderIndex: 6,
  },
  // ── Topic: Vòng lặp (tách for thành 2 sub-skills) ──
  {
    skillId: "py.for_range",
    topicId: "t3_loops",
    topicName: "Vòng lặp",
    name: "Vòng lặp for với range()",
    description: "Dùng for i in range(...) để lặp N lần; range với 1, 2, 3 tham số; break/continue.",
    orderIndex: 7,
  },
  {
    skillId: "py.for_iter",
    topicId: "t3_loops",
    topicName: "Vòng lặp",
    name: "Duyệt dữ liệu với for",
    description: "Dùng for để duyệt chuỗi, list, tuple; vòng lặp lồng nhau cơ bản.",
    orderIndex: 8,
  },
  {
    skillId: "py.loop_while",
    topicId: "t3_loops",
    topicName: "Vòng lặp",
    name: "Vòng lặp while",
    description:
      "Dùng while với điều kiện; tránh vòng lặp vô hạn; kết hợp while với biến đếm.",
    orderIndex: 9,
  },
  // ── Topic: Xử lý số (tách thành 2 sub-skills) ──
  {
    skillId: "py.num_calc",
    topicId: "t3b_number_ops",
    topicName: "Xử lý số bằng vòng lặp",
    name: "Tính toán với vòng lặp",
    description: "Tính tổng/tích/tìm max/min qua vòng lặp; đếm số thoả điều kiện; tính trung bình.",
    orderIndex: 10,
  },
  {
    skillId: "py.num_digit",
    topicId: "t3b_number_ops",
    topicName: "Xử lý số bằng vòng lặp",
    name: "Xử lý chữ số của số nguyên",
    description: "Tách chữ số; đếm chữ số; đảo số; kiểm tra số đối xứng; tìm chữ số lớn nhất.",
    orderIndex: 11,
  },
  // ── Topic: Danh sách & xâu kí tự ──
  {
    skillId: "py.string",
    topicId: "t4_collections",
    topicName: "Danh sách và xâu kí tự",
    name: "Xâu kí tự và các phương thức xử lý chuỗi",
    description:
      "Indexing/slicing chuỗi; các phương thức: len(), upper(), split(), find(), replace(); duyệt ký tự.",
    orderIndex: 12,
  },
  {
    skillId: "py.list",
    topicId: "t4_collections",
    topicName: "Danh sách và xâu kí tự",
    name: "Danh sách (list) và các thao tác",
    description:
      "Tạo list, truy cập phần tử; append/insert/remove/pop; duyệt list; list comprehension cơ bản.",
    orderIndex: 13,
  },
  // ── Topic: Hàm ──
  {
    skillId: "py.function",
    topicId: "t5_functions",
    topicName: "Hàm",
    name: "Hàm: định nghĩa, tham số, giá trị trả về",
    description:
      "Viết hàm với def; tham số và đối số; return; phạm vi biến (local/global); hàm có sẵn.",
    orderIndex: 14,
  },
  // ── Topic: Debug ──
  {
    skillId: "py.debug",
    topicId: "t6_debug",
    topicName: "Debug và tư duy giải bài",
    name: "Debug và tư duy giải bài toán",
    description:
      "Đọc thông báo lỗi; kiểm tra logic; chia bài toán thành các bước nhỏ; kiểm thử với input mẫu.",
    orderIndex: 15,
  },

  // ══ C++ cơ bản ══
  // ── Topic: Bắt đầu với C++ ──
  {
    skillId: "cpp.intro",
    topicId: "t7_cpp_intro",
    topicName: "C++: Bắt đầu với C++",
    name: "Cấu trúc chương trình C++",
    description:
      "#include <iostream>, hàm main(), return 0, dấu chấm phẩy, khối {}, namespace std.",
    orderIndex: 16,
  },
  // ── Topic: Kiểu dữ liệu và biến ──
  {
    skillId: "cpp.var_basic",
    topicId: "t8_cpp_types",
    topicName: "C++: Kiểu dữ liệu và biến",
    name: "Khai báo biến và lệnh gán",
    description:
      "Khai báo có kiểu tường minh, khởi tạo, quy tắc đặt tên, biến chưa khởi tạo, const.",
    orderIndex: 17,
  },
  {
    skillId: "cpp.type_num",
    topicId: "t8_cpp_types",
    topicName: "C++: Kiểu dữ liệu và biến",
    name: "Kiểu số nguyên và số thực",
    description:
      "int, long long, float, double; tràn số; chia nguyên vs chia thực; sai số dấu phẩy động; ép kiểu số.",
    orderIndex: 18,
  },
  {
    skillId: "cpp.type_char",
    topicId: "t8_cpp_types",
    topicName: "C++: Kiểu dữ liệu và biến",
    name: "Kiểu ký tự char",
    description:
      "char và mã ASCII; phân biệt 'A' với \"A\" và với 65; char cộng số nguyên.",
    orderIndex: 19,
  },
  {
    skillId: "cpp.type_bool",
    topicId: "t8_cpp_types",
    topicName: "C++: Kiểu dữ liệu và biến",
    name: "Kiểu bool và giá trị logic",
    description:
      "bool true/false; in bool ra 1/0; boolalpha; số khác 0 được coi là true.",
    orderIndex: 20,
  },
  // ── Topic: Nhập xuất ──
  {
    skillId: "cpp.io_out",
    topicId: "t9_cpp_io",
    topicName: "C++: Nhập xuất",
    name: "Xuất dữ liệu với cout và định dạng",
    description:
      "cout << và chuỗi nối; endl vs \\n; setprecision/fixed/setw để định dạng số và bảng.",
    orderIndex: 21,
  },
  {
    skillId: "cpp.io_in",
    topicId: "t9_cpp_io",
    topicName: "C++: Nhập xuất",
    name: "Nhập dữ liệu với cin và xử lý lỗi nhập",
    description:
      "cin >> và chiều mũi nhọn; cin bỏ qua khoảng trắng; cin.fail(), clear(), ignore(); getline sau cin >>.",
    orderIndex: 22,
  },
  // ── Topic: Toán tử ──
  {
    skillId: "cpp.op_arith",
    topicId: "t10_cpp_operators",
    topicName: "C++: Toán tử",
    name: "Toán tử số học và phép chia lấy dư",
    description:
      "+, -, *, /, %; chia hai số nguyên bị cắt phần thập phân; % chỉ dùng cho số nguyên; chia cho 0.",
    orderIndex: 23,
  },
  {
    skillId: "cpp.op_assign",
    topicId: "t10_cpp_operators",
    topicName: "C++: Toán tử",
    name: "Toán tử gán và tăng giảm",
    description:
      "=, +=, -=, *=, /=, %=; ++/-- dạng tiền tố và hậu tố; thứ tự cập nhật giá trị.",
    orderIndex: 24,
  },
  {
    skillId: "cpp.op_compare",
    topicId: "t10_cpp_operators",
    topicName: "C++: Toán tử",
    name: "Toán tử so sánh",
    description:
      "==, !=, <, >, <=, >=; lỗi kinh điển dùng = thay cho ==; so sánh số thực bằng ==.",
    orderIndex: 25,
  },
  {
    skillId: "cpp.op_logic",
    topicId: "t10_cpp_operators",
    topicName: "C++: Toán tử",
    name: "Toán tử logic và short-circuit",
    description:
      "&&, ||, !; bảng chân lý; đánh giá tắt (short-circuit); gộp điều kiện đúng cách thay vì 0 < x < 10.",
    orderIndex: 26,
  },
  {
    skillId: "cpp.op_precedence",
    topicId: "t10_cpp_operators",
    topicName: "C++: Toán tử",
    name: "Thứ tự ưu tiên toán tử",
    description:
      "Thứ tự ưu tiên và tính kết hợp; dùng ngoặc để làm rõ; ưu tiên của ! so với && và ||.",
    orderIndex: 27,
  },
  // ── Topic: Câu lệnh điều kiện ──
  {
    skillId: "cpp.if_basic",
    topicId: "t11_cpp_branching",
    topicName: "C++: Câu lệnh điều kiện",
    name: "Câu lệnh if và if-else",
    description:
      "Cú pháp if/else; khối {} và bẫy dấu ; sau if; else gắn với if gần nhất.",
    orderIndex: 28,
  },
  {
    skillId: "cpp.if_chain",
    topicId: "t11_cpp_branching",
    topicName: "C++: Câu lệnh điều kiện",
    name: "Chuỗi else-if và if lồng nhau",
    description:
      "else if nhiều nhánh loại trừ nhau; thứ tự điều kiện xếp hạng; if lồng và cách làm phẳng bằng &&.",
    orderIndex: 29,
  },
  {
    skillId: "cpp.switch",
    topicId: "t11_cpp_branching",
    topicName: "C++: Câu lệnh điều kiện",
    name: "switch-case, break và fall-through",
    description:
      "switch với giá trị rời rạc; vai trò của break và default; fall-through cố ý và do quên break.",
    orderIndex: 30,
  },
  // ── Topic: Vòng lặp ──
  {
    skillId: "cpp.loop_while",
    topicId: "t12_cpp_loops",
    topicName: "C++: Vòng lặp",
    name: "Vòng lặp while và do-while",
    description:
      "while kiểm tra trước, do-while chạy trước ít nhất một lần; biến đếm; tránh lặp vô hạn.",
    orderIndex: 31,
  },
  {
    skillId: "cpp.loop_control",
    topicId: "t12_cpp_loops",
    topicName: "C++: Vòng lặp",
    name: "break và continue trong vòng lặp",
    description:
      "break thoát vòng lặp, continue bỏ qua lượt; continue trong while dễ gây lặp vô hạn; chỉ thoát một cấp.",
    orderIndex: 32,
  },
  {
    skillId: "cpp.loop_for",
    topicId: "t12_cpp_loops",
    topicName: "C++: Vòng lặp",
    name: "Vòng lặp for và range-based for",
    description:
      "Ba phần của for; đếm số lần lặp; off-by-one với <= ; for (int x : arr) và biến tham chiếu.",
    orderIndex: 33,
  },
  {
    skillId: "cpp.loop_nested",
    topicId: "t12_cpp_loops",
    topicName: "C++: Vòng lặp",
    name: "Vòng lặp lồng nhau",
    description:
      "for trong for; tổng số lần lặp; in bảng và tam giác; lỗi dùng lại tên biến đếm.",
    orderIndex: 34,
  },
  // ── Topic: Mảng ──
  {
    skillId: "cpp.array_basic",
    topicId: "t13_cpp_arrays",
    topicName: "C++: Mảng",
    name: "Mảng một chiều và truy cập phần tử",
    description:
      "Khai báo mảng kích thước hằng; chỉ số từ 0 đến n-1; truy cập ngoài biên; duyệt mảng bằng for.",
    orderIndex: 35,
  },
  {
    skillId: "cpp.array_algo",
    topicId: "t13_cpp_arrays",
    topicName: "C++: Mảng",
    name: "Tìm kiếm và sắp xếp trên mảng",
    description:
      "Tìm tuần tự, tìm nhị phân; tìm max/min; đổi chỗ; nổi bọt và chọn trực tiếp; đếm theo điều kiện.",
    orderIndex: 36,
  },
  {
    skillId: "cpp.array_2d",
    topicId: "t13_cpp_arrays",
    topicName: "C++: Mảng",
    name: "Mảng hai chiều",
    description:
      "Khai báo [hàng][cột]; duyệt bằng hai vòng for; tổng theo hàng/cột; đường chéo.",
    orderIndex: 37,
  },
  // ── Topic: Hàm ──
  {
    skillId: "cpp.func_basic",
    topicId: "t14_cpp_functions",
    topicName: "C++: Hàm",
    name: "Hàm: khai báo, tham số và return",
    description:
      "Kiểu trả về, tham số, thứ tự khai báo/prototype; void so với có return; thiếu return.",
    orderIndex: 38,
  },
  {
    skillId: "cpp.func_ref",
    topicId: "t14_cpp_functions",
    topicName: "C++: Hàm",
    name: "Truyền tham trị và tham chiếu",
    description:
      "Truyền theo giá trị tạo bản sao; tham chiếu & sửa được biến gốc; hoán đổi hai biến; mảng truyền như tham chiếu.",
    orderIndex: 39,
  },
  {
    skillId: "cpp.scope",
    topicId: "t14_cpp_functions",
    topicName: "C++: Hàm",
    name: "Phạm vi và tuổi thọ của biến",
    description:
      "Biến cục bộ trong khối và trong hàm; biến toàn cục; che tên (shadowing); biến trong vòng lặp.",
    orderIndex: 40,
  },
  {
    skillId: "cpp.overload",
    topicId: "t14_cpp_functions",
    topicName: "C++: Hàm",
    name: "Nạp chồng hàm và tham số mặc định",
    description:
      "Cùng tên khác danh sách tham số; chọn phiên bản phù hợp; nhập nhằng khi nạp chồng; tham số mặc định.",
    orderIndex: 41,
  },
  // ── Topic: Chuỗi ký tự ──
  {
    skillId: "cpp.string_basic",
    topicId: "t15_cpp_string",
    topicName: "C++: Chuỗi ký tự",
    name: "std::string và các phương thức cơ bản",
    description:
      "Khai báo string, length()/size(), truy cập theo chỉ số, nối chuỗi, substr, find, duyệt từng ký tự.",
    orderIndex: 42,
  },
  {
    skillId: "cpp.string_ops",
    topicId: "t15_cpp_string",
    topicName: "C++: Chuỗi ký tự",
    name: "So sánh và nhập chuỗi",
    description:
      "So sánh string bằng ==, <, compare(); thứ tự từ điển và chữ hoa/thường; cin >> so với getline.",
    orderIndex: 43,
  },

  // ══ Tư duy thuật toán cơ bản ══
  // ── Topic: Kỹ năng giải bài ──
  {
    skillId: "algo.problem_analysis",
    topicId: "t16_algo_solving",
    topicName: "Thuật toán: Kỹ năng giải bài",
    name: "Đọc đề, phân tích input/output và tìm pattern",
    description:
      "Đọc hiểu đề; xác định rõ input/output; nhận diện dạng bài và pattern quen thuộc.",
    orderIndex: 44,
  },
  {
    skillId: "algo.pseudocode_planning",
    topicId: "t16_algo_solving",
    topicName: "Thuật toán: Kỹ năng giải bài",
    name: "Viết thuật toán trước khi code",
    description:
      "Mô tả các bước giải bằng lời/xuất pseudocode trước khi chuyển thành code.",
    orderIndex: 45,
  },
  {
    skillId: "algo.complexity_estimate",
    topicId: "t16_algo_solving",
    topicName: "Thuật toán: Kỹ năng giải bài",
    name: "Ước lượng độ phức tạp",
    description:
      "Đếm số bước của thuật toán; ước lượng O(n), O(n²); đối chiếu với giới hạn đề bài.",
    orderIndex: 46,
  },
  {
    skillId: "algo.small_test_debug",
    topicId: "t16_algo_solving",
    topicName: "Thuật toán: Kỹ năng giải bài",
    name: "Kiểm thử bằng test nhỏ",
    description:
      "Tự tạo test case nhỏ; chạy tay từng bước để tìm lỗi logic trước khi nộp.",
    orderIndex: 47,
  },
  // ── Topic: Số học cơ bản ──
  {
    skillId: "algo.divisors_multiples",
    topicId: "t17_algo_number_theory",
    topicName: "Thuật toán: Số học cơ bản",
    name: "Ước và bội của số nguyên",
    description:
      "Tìm ước bằng duyệt đến √n; kiểm tra chia hết; đếm ước; tính tổng ước.",
    orderIndex: 48,
  },
  {
    skillId: "algo.prime_check",
    topicId: "t17_algo_number_theory",
    topicName: "Thuật toán: Số học cơ bản",
    name: "Kiểm tra số nguyên tố",
    description:
      "Định nghĩa nguyên tố; kiểm tra duyệt thường; tối ưu chỉ duyệt đến căn bậc hai.",
    orderIndex: 49,
  },
  {
    skillId: "algo.prime_factorization",
    topicId: "t17_algo_number_theory",
    topicName: "Thuật toán: Số học cơ bản",
    name: "Phân tích thừa số nguyên tố",
    description:
      "Tách số thành tích các thừa số nguyên tố; đếm số mũ; dùng trong bài ước/bội.",
    orderIndex: 50,
  },
  {
    skillId: "algo.gcd_lcm",
    topicId: "t17_algo_number_theory",
    topicName: "Thuật toán: Số học cơ bản",
    name: "GCD/LCM và ứng dụng",
    description:
      "Thuật toán Euclid; rút gọn phân số; LCM qua GCD; bài toán đồng quy chu kỳ.",
    orderIndex: 51,
  },
  {
    skillId: "algo.special_numbers",
    topicId: "t17_algo_number_theory",
    topicName: "Thuật toán: Số học cơ bản",
    name: "Số chính phương, hoàn hảo và số đặc biệt",
    description:
      "Nhận diện số chính phương; tổng ước = n (hoàn hảo); các định nghĩa số đặc biệt khác.",
    orderIndex: 52,
  },
  // ── Topic: Sàng và tiền xử lý ──
  {
    skillId: "algo.sieve_eratosthenes",
    topicId: "t18_algo_sieve",
    topicName: "Thuật toán: Sàng và tiền xử lý",
    name: "Sàng Eratosthenes",
    description:
      "Ý tưởng tiền xử lý; sàng nguyên tố đến N; đếm nguyên tố trong đoạn; độ phức tạp.",
    orderIndex: 53,
  },
  {
    skillId: "algo.marking_arrays",
    topicId: "t18_algo_sieve",
    topicName: "Thuật toán: Sàng và tiền xử lý",
    name: "Mảng đánh dấu và mảng tần suất",
    description:
      "Dùng mảng boolean đánh dấu giá trị đã gặp; mảng tần suất theo miền giá trị nhỏ.",
    orderIndex: 54,
  },
  // ── Topic: Kỹ thuật với dãy số ──
  {
    skillId: "algo.array_scan",
    topicId: "t19_algo_sequences",
    topicName: "Thuật toán: Kỹ thuật với dãy số",
    name: "Duyệt dãy: max/min, đếm và tổng theo điều kiện",
    description:
      "Một lượt duyệt tìm max/min có điều kiện; đếm phần tử thoả; cộng dồn theo điều kiện.",
    orderIndex: 55,
  },
  {
    skillId: "algo.prefix_sum",
    topicId: "t19_algo_sequences",
    topicName: "Thuật toán: Kỹ thuật với dãy số",
    name: "Mảng cộng dồn và truy vấn tổng đoạn",
    description:
      "Xây prefix sum; truy vấn tổng đoạn [l, r] trong O(1); hiệu hai prefix; bài truy vấn nhiều lần.",
    orderIndex: 56,
  },
  // ── Topic: Xử lý chuỗi nâng cao ──
  {
    skillId: "algo.char_frequency",
    topicId: "t20_algo_strings",
    topicName: "Thuật toán: Xử lý chuỗi nâng cao",
    name: "Đếm tần suất ký tự trong chuỗi",
    description:
      "Đếm mỗi ký tự xuất hiện bao nhiêu lần; so sánh hai chuỗi qua bảng tần suất.",
    orderIndex: 57,
  },
  {
    skillId: "algo.string_processing",
    topicId: "t20_algo_strings",
    topicName: "Thuật toán: Xử lý chuỗi nâng cao",
    name: "Chuẩn hóa, so sánh, đối xứng, tách từ và mã hóa",
    description:
      "Chuẩn hóa khoảng trắng/chữ hoa; chuỗi đối xứng; tách từ; mã hóa dịch vòng đơn giản.",
    orderIndex: 58,
  },
  // ── Topic: Dictionary và Set ──
  {
    skillId: "algo.dict_basics",
    topicId: "t21_algo_dict_set",
    topicName: "Thuật toán: Dictionary và Set",
    name: "Dictionary: tạo, truy cập và cập nhật",
    description:
      "Khóa–giá trị; tạo/thêm/sửa/xóa; khi nào dict thay list; duyệt keys/values/items.",
    orderIndex: 59,
  },
  {
    skillId: "algo.frequency_grouping",
    topicId: "t21_algo_dict_set",
    topicName: "Thuật toán: Dictionary và Set",
    name: "Đếm tần suất và gom nhóm dữ liệu bằng dict",
    description:
      "Đếm số lần xuất hiện; tìm phần tử phổ biến nhất; gom nhóm phần tử theo khóa chung.",
    orderIndex: 60,
  },
  {
    skillId: "algo.set_basics",
    topicId: "t21_algo_dict_set",
    topicName: "Thuật toán: Dictionary và Set",
    name: "Set: loại trùng và kiểm tra thuộc",
    description:
      "Tạo set từ list để loại trùng; kiểm tra membership O(1); giao, hợp, hiệu.",
    orderIndex: 61,
  },
  // ── Topic: Tìm kiếm và sắp xếp ──
  {
    skillId: "algo.linear_search",
    topicId: "t22_algo_search_sort",
    topicName: "Thuật toán: Tìm kiếm và sắp xếp",
    name: "Tìm kiếm tuần tự",
    description:
      "Duyệt từng phần tử tìm giá trị/điều kiện đầu tiên; trả về vị trí hoặc -1.",
    orderIndex: 62,
  },
  {
    skillId: "algo.binary_search",
    topicId: "t22_algo_search_sort",
    topicName: "Thuật toán: Tìm kiếm và sắp xếp",
    name: "Tìm kiếm nhị phân",
    description:
      "Ý tưởng chia đôi trên dữ liệu đã sắp xếp; điều kiện áp dụng; lỗi vô hạn lặp biên.",
    orderIndex: 63,
  },
  {
    skillId: "algo.sorting_basics",
    topicId: "t22_algo_search_sort",
    topicName: "Thuật toán: Tìm kiếm và sắp xếp",
    name: "Sắp xếp tăng/giảm và sort với key",
    description:
      "Sort sẵn của ngôn ngữ; sắp theo tiêu chí (key); sort nhiều tiêu chí; ổn định.",
    orderIndex: 64,
  },
  {
    skillId: "algo.top_k_selection",
    topicId: "t22_algo_search_sort",
    topicName: "Thuật toán: Tìm kiếm và sắp xếp",
    name: "Bài toán chọn Top-K",
    description:
      "Tìm K phần tử lớn nhất/nhỏ nhất; sort rồi cắt; cách làm bằng duyệt giữ k phần tử tốt nhất.",
    orderIndex: 65,
  },
  // ── Topic: Hai con trỏ và cửa sổ trượt ──
  {
    skillId: "algo.two_pointers",
    topicId: "t23_algo_two_pointers",
    topicName: "Thuật toán: Hai con trỏ và cửa sổ trượt",
    name: "Hai con trỏ",
    description:
      "Hai chỉ số di chuyển có kiểm soát; tìm cặp có tổng bằng k; đếm cặp trên dãy đã sắp.",
    orderIndex: 66,
  },
  {
    skillId: "algo.sliding_window",
    topicId: "t23_algo_two_pointers",
    topicName: "Thuật toán: Hai con trỏ và cửa sổ trượt",
    name: "Cửa sổ trượt cố định và biến đổi",
    description:
      "Cửa sổ kích thước cố định cập nhật trượt từng bước; cửa sổ mở rộng/thu hẹp theo điều kiện.",
    orderIndex: 67,
  },
  // ── Topic: Đệ quy cơ bản ──
  {
    skillId: "algo.recursion_basics",
    topicId: "t24_algo_recursion",
    topicName: "Thuật toán: Đệ quy cơ bản",
    name: "Đệ quy: khái niệm và điều kiện dừng",
    description:
      "Hàm tự gọi mình; base case và recursive case; nguy cơ stack overflow khi thiếu điểm dừng.",
    orderIndex: 68,
  },
  {
    skillId: "algo.recursion_classic",
    topicId: "t24_algo_recursion",
    topicName: "Thuật toán: Đệ quy cơ bản",
    name: "Đệ quy kinh điển: giai thừa, Fibonacci, tổng chữ số, sinh dãy",
    description:
      "Các mẫu đệ quy quen thuộc; đệ quy nhị phân của Fibonacci; sinh cấu hình bằng đệ quy.",
    orderIndex: 69,
  },
  // ── Topic: Luyện đề và chiến thuật thi ──
  {
    skillId: "algo.contest_strategy",
    topicId: "t25_algo_contest",
    topicName: "Thuật toán: Luyện đề và chiến thuật thi",
    name: "Chiến lược làm bài thi lập trình",
    description:
      "Phân loại bài theo dạng; ăn điểm nhanh trước; khi nào brute force đủ dùng; tự tạo test và chữa đề mẫu.",
    orderIndex: 70,
  },
  // ══ Lập trình thi đấu (Tầng 2–3: Tham lam, CTDL, Quay lui, DP, Đồ thị) ══
  // ── Topic: Tham lam và Chia để trị ──
  {
    skillId: "algo.greedy_basics",
    topicId: "t26_algo_greedy",
    topicName: "Thuật toán: Tham lam và Chia để trị",
    name: "Tham lam cơ bản và chứng minh trao đổi",
    description:
      "Chọn phương án cục bộ tối ưu; sắp xếp theo tiêu chí thích hợp; chứng minh đúng bằng lập luận trao đổi (exchange argument).",
    orderIndex: 71,
  },
  {
    skillId: "algo.greedy_scheduling",
    topicId: "t26_algo_greedy",
    topicName: "Thuật toán: Tham lam và Chia để trị",
    name: "Lập lịch, khoảng thời gian và tối ưu bước nhảy",
    description:
      "Chọn nhiều khoảng không giao nhau, số phòng tối thiểu, lập lịch có hạn chót và nhảy xa ít bước nhất.",
    orderIndex: 72,
  },
  {
    skillId: "algo.binary_search_answer",
    topicId: "t26_algo_greedy",
    topicName: "Thuật toán: Tham lam và Chia để trị",
    name: "Tìm kiếm nhị phân trên đáp án",
    description:
      "Nhận diện tính đơn điệu của hàm kiểm tra; tìm giá trị lớn nhất/nhỏ nhất thỏa điều kiện (min-max / max-min).",
    orderIndex: 73,
  },
  {
    skillId: "algo.divide_conquer_mod",
    topicId: "t26_algo_greedy",
    topicName: "Thuật toán: Tham lam và Chia để trị",
    name: "Chia để trị, lũy thừa nhị phân và số học Modulo",
    description:
      "Lũy thừa nhanh O(log n), định lý Fermat nhỏ, nghịch đảo modulo, đếm nghịch thế bằng Merge Sort.",
    orderIndex: 74,
  },
  // ── Topic: Stack, Queue và Heap ──
  {
    skillId: "algo.stack_queue",
    topicId: "t27_algo_ds_linear",
    topicName: "Thuật toán: Stack, Queue và Heap",
    name: "Ngăn xếp, hàng đợi và biểu thức ngoặc",
    description:
      "Ứng dụng LIFO/FIFO; kiểm tra ngoặc hợp lệ, biểu thức hậu tố RPN, dãy ngoặc đúng dài nhất.",
    orderIndex: 75,
  },
  {
    skillId: "algo.monotonic_stack_deque",
    topicId: "t27_algo_ds_linear",
    topicName: "Thuật toán: Stack, Queue và Heap",
    name: "Ngăn xếp đơn điệu và Deque cửa sổ trượt",
    description:
      "Next Greater Element, sliding window max/min O(n), hình chữ nhật lớn nhất trong histogram.",
    orderIndex: 76,
  },
  {
    skillId: "algo.heap_priority_queue",
    topicId: "t27_algo_ds_linear",
    topicName: "Thuật toán: Stack, Queue và Heap",
    name: "Hàng đợi ưu tiên (Heap) và cực trị động",
    description:
      "Dùng min-heap/max-heap nối dây Huffman, duy trì trung vị động 2 heap, chọn dự án tối ưu vốn.",
    orderIndex: 77,
  },
  // ── Topic: Quay lui và Nhánh cận ──
  {
    skillId: "algo.backtracking_generation",
    topicId: "t28_algo_backtracking",
    topicName: "Thuật toán: Quay lui và Nhánh cận",
    name: "Quay lui sinh cấu hình (tổ hợp, hoán vị, tập con)",
    description:
      "Cây tìm kiếm quay lui; sinh xâu nhị phân, tổ hợp, dãy ngoặc hợp lệ và tổ hợp tổng bằng S.",
    orderIndex: 78,
  },
  {
    skillId: "algo.backtracking_pruning",
    topicId: "t28_algo_backtracking",
    topicName: "Thuật toán: Quay lui và Nhánh cận",
    name: "Quay lui cắt nhánh và Meet-in-the-Middle",
    description:
      "Cắt nhánh sớm (pruning), N-Queens, Sudoku, chia K tập bằng nhau và chia đôi tập Meet-in-the-Middle.",
    orderIndex: 79,
  },
  // ── Topic: Quy hoạch động (DP) ──
  {
    skillId: "algo.dp_linear",
    topicId: "t29_algo_dp",
    topicName: "Thuật toán: Quy hoạch động (DP)",
    name: "Quy hoạch động tuyến tính 1 chiều",
    description:
      "Xác định trạng thái, công thức chuyển và bài toán cơ sở trên dãy 1D (cầu thang, Kadane, House Robber).",
    orderIndex: 80,
  },
  {
    skillId: "algo.dp_knapsack",
    topicId: "t29_algo_dp",
    topicName: "Thuật toán: Quy hoạch động (DP)",
    name: "Quy hoạch động Ba lô và Đổi tiền",
    description:
      "Knapsack 0/1, Knapsack không giới hạn, đếm số cách và số đồng xu ít nhất, tối ưu bộ nhớ 1 chiều.",
    orderIndex: 81,
  },
  {
    skillId: "algo.dp_lis_lcs",
    topicId: "t29_algo_dp",
    topicName: "Thuật toán: Quy hoạch động (DP)",
    name: "Dãy con tăng dài nhất (LIS) và Xâu con chung (LCS)",
    description:
      "LIS O(n log n) kết hợp tìm kiếm nhị phân; LCS và Edit Distance trên hai xâu.",
    orderIndex: 82,
  },
  {
    skillId: "algo.dp_grid",
    topicId: "t29_algo_dp",
    topicName: "Thuật toán: Quy hoạch động (DP)",
    name: "Quy hoạch động trên lưới 2 chiều",
    description:
      "Đường đi tối ưu và đếm số đường đi trên ma trận có vật cản hoặc trọng số ô.",
    orderIndex: 83,
  },
  {
    skillId: "algo.dp_interval_bitmask",
    topicId: "t29_algo_dp",
    topicName: "Thuật toán: Quy hoạch động (DP)",
    name: "DP trên đoạn, DP Bitmask và DP trên cây",
    description:
      "Interval DP gộp đoạn, Bitmask DP trạng thái tập con (TSP), và Tree DP tổng hợp từ cây con.",
    orderIndex: 84,
  },
  // ── Topic: Đồ thị và Cây ──
  {
    skillId: "algo.graph_traversal",
    topicId: "t30_algo_graph",
    topicName: "Thuật toán: Đồ thị và Cây",
    name: "Biểu diễn đồ thị, BFS/DFS và duyệt cây",
    description:
      "Danh sách kề; đếm thành phần liên thông, khoảng cách BFS không trọng số và đường kính cây.",
    orderIndex: 85,
  },
  {
    skillId: "algo.graph_grid_bipartite",
    topicId: "t30_algo_graph",
    topicName: "Thuật toán: Đồ thị và Cây",
    name: "BFS/DFS trên lưới và đồ thị hai phía",
    description:
      "Tìm đường ngắn nhất trong mê cung lưới, loang BFS/DFS nhiều nguồn và tô màu kiểm tra đồ thị 2 phía.",
    orderIndex: 86,
  },
  {
    skillId: "algo.graph_topo_dag",
    topicId: "t30_algo_graph",
    topicName: "Thuật toán: Đồ thị và Cây",
    name: "Sắp xếp Topo và DP trên đồ thị DAG",
    description:
      "Thuật toán Kahn, phát hiện chu trình đồ thị có hướng và tìm đường đi dài nhất trên DAG.",
    orderIndex: 87,
  },
  {
    skillId: "algo.graph_shortest_path",
    topicId: "t30_algo_graph",
    topicName: "Thuật toán: Đồ thị và Cây",
    name: "Đường đi ngắn nhất (Dijkstra & đồ thị trạng thái)",
    description:
      "Thuật toán Dijkstra với Priority Queue, Floyd-Warshall và mở rộng trạng thái (Layered Graph).",
    orderIndex: 88,
  },
  {
    skillId: "algo.graph_dsu_mst",
    topicId: "t30_algo_graph",
    topicName: "Thuật toán: Đồ thị và Cây",
    name: "DSU (Disjoint Set Union) và Cây khung nhỏ nhất (MST)",
    description:
      "DSU nén đường + gộp theo hạng, thuật toán Kruskal tìm MST và xử lý truy vấn offline đảo ngược.",
    orderIndex: 89,
  },
  // ══ Lập trình thi đấu nâng cao (Tầng 4: Bit/Ad-hoc, Tổ hợp, BIT/SegTree, Cây/Xâu nâng cao, Hình học/Game) ══
  // ── Topic: Bitmask và Tư duy Ad-hoc ──
  {
    skillId: "algo.bit_manipulation",
    topicId: "t31_algo_bit_adhoc",
    topicName: "Thuật toán: Bitmask và Tư duy Ad-hoc",
    name: "Thao tác bit, XOR và tập con bitmask",
    description:
      "Phép toán AND/OR/XOR/Shift, đếm bit 1, tính chất tự triệt tiêu của XOR và duyệt tập con bitmask.",
    orderIndex: 90,
  },
  {
    skillId: "algo.adhoc_invariant",
    topicId: "t31_algo_bit_adhoc",
    topicName: "Thuật toán: Bitmask và Tư duy Ad-hoc",
    name: "Tư duy Ad-hoc, bất biến (Invariant) và chẵn lẻ",
    description:
      "Tìm đại lượng bất biến, phân tích tính chẵn lẻ, đối xứng, mô phỏng thực tế và xây dựng nghiệm (constructive).",
    orderIndex: 91,
  },
  // ── Topic: Tổ hợp và Ma trận ──
  {
    skillId: "algo.combinatorics_mod",
    topicId: "t32_algo_combinatorics",
    topicName: "Thuật toán: Tổ hợp và Ma trận",
    name: "Tổ hợp nCr Modulo, nghịch đảo và số Catalan",
    description:
      "Tiền xử lý giai thừa & nghịch đảo modulo nguyên tố, chia kẹo Euler (Stars & Bars), dãy Catalan và hoán vị mất thứ tự.",
    orderIndex: 92,
  },
  {
    skillId: "algo.inclusion_exclusion",
    topicId: "t32_algo_combinatorics",
    topicName: "Thuật toán: Tổ hợp và Ma trận",
    name: "Nguyên lý Bao hàm – Loại trừ và đếm nâng cao",
    description:
      "Đếm hợp nhiều tập hợp bằng bao hàm – loại trừ, số nguyên tố cùng nhau trong đoạn và tổng tổ hợp có ràng buộc.",
    orderIndex: 93,
  },
  {
    skillId: "algo.matrix_exponentiation",
    topicId: "t32_algo_combinatorics",
    topicName: "Thuật toán: Tổ hợp và Ma trận",
    name: "Nhân ma trận và truy hồi tuyến tính O(K³ log N)",
    description:
      "Chuyển công thức truy hồi sang dạng ma trận, tính lũy thừa ma trận nhị phân và đếm đường đi độ dài K trên đồ thị.",
    orderIndex: 94,
  },
  // ── Topic: Cấu trúc dữ liệu truy vấn đoạn ──
  {
    skillId: "algo.fenwick_bit",
    topicId: "t33_algo_range_queries",
    topicName: "Thuật toán: Cấu trúc dữ liệu truy vấn đoạn",
    name: "Fenwick Tree (BIT) và truy vấn cộng dồn động",
    description:
      "Cập nhật điểm và truy vấn tổng tiền tố O(log N), nén tọa độ kết hợp BIT, tìm phần tử thứ K trên BIT.",
    orderIndex: 95,
  },
  {
    skillId: "algo.sparse_table_rmq",
    topicId: "t33_algo_range_queries",
    topicName: "Thuật toán: Cấu trúc dữ liệu truy vấn đoạn",
    name: "Sparse Table và truy vấn RMQ tĩnh O(1)",
    description:
      "Tiền xử lý O(N log N) trả lời truy vấn Min/Max/GCD trên đoạn tĩnh trong O(1).",
    orderIndex: 96,
  },
  {
    skillId: "algo.segment_tree",
    topicId: "t33_algo_range_queries",
    topicName: "Thuật toán: Cấu trúc dữ liệu truy vấn đoạn",
    name: "Segment Tree: truy vấn đoạn và Lazy Propagation",
    description:
      "Cây phân đoạn cho Min/Max/Sum, tổng đoạn con lớn nhất trên đoạn, cập nhật đoạn với Lazy Propagation.",
    orderIndex: 97,
  },
  // ── Topic: Cây, Đồ thị, Xâu và DP nâng cao ──
  {
    skillId: "algo.tree_lca_euler",
    topicId: "t34_algo_tree_string_adv",
    topicName: "Thuật toán: Cây, Đồ thị và Xâu nâng cao",
    name: "Euler Tour, Binary Lifting, LCA và Rerooting DP",
    description:
      "Trải phẳng cây (Euler Tour + BIT), tổ tiên thứ K, LCA O(log N), khoảng cách hai đỉnh và đổi gốc Rerooting DP.",
    orderIndex: 98,
  },
  {
    skillId: "algo.graph_advanced",
    topicId: "t34_algo_tree_string_adv",
    topicName: "Thuật toán: Cây, Đồ thị và Xâu nâng cao",
    name: "Đồ thị nâng cao: 0-1 BFS, Floyd, Bellman-Ford, Khớp/Cầu & SCC",
    description:
      "0-1 BFS bằng Deque, BFS đa nguồn, Floyd-Warshall, Bellman-Ford phát hiện chu trình âm, Tarjan tìm khớp/cầu và SCC.",
    orderIndex: 99,
  },
  {
    skillId: "algo.string_trie_z",
    topicId: "t34_algo_tree_string_adv",
    topicName: "Thuật toán: Cây, Đồ thị và Xâu nâng cao",
    name: "Trie, Binary Trie Max-XOR, Z-Function và Manacher",
    description:
      "Cây tiền tố Trie, Binary Trie tìm cặp XOR lớn nhất, hàm Z tuyến tính và Manacher tìm xâu đối xứng O(N).",
    orderIndex: 100,
  },
  {
    skillId: "algo.dp_advanced",
    topicId: "t34_algo_tree_string_adv",
    topicName: "Thuật toán: Cây, Đồ thị và Xâu nâng cao",
    name: "DP nâng cao: Digit DP, Bounded Knapsack và DP tối ưu",
    description:
      "Quy hoạch động chữ số (Digit DP), ba lô hữu hạn tách nhị phân, DP tối ưu bằng prefix sum/deque và DP xác suất.",
    orderIndex: 101,
  },
  // ── Topic: Hình học tính toán và Lý thuyết trò chơi ──
  {
    skillId: "algo.geometry_basics",
    topicId: "t35_algo_geometry_game",
    topicName: "Thuật toán: Hình học và Lý thuyết trò chơi",
    name: "Hình học tính toán: Vector, tích có hướng CCW và giao đoạn thẳng",
    description:
      "Tích vô hướng, tích có hướng (CCW), kiểm tra thẳng hàng/quay trái phải, giao hai đoạn thẳng và diện tích đa giác.",
    orderIndex: 102,
  },
  {
    skillId: "algo.convex_hull",
    topicId: "t35_algo_geometry_game",
    topicName: "Thuật toán: Hình học và Lý thuyết trò chơi",
    name: "Bao lồi (Convex Hull) và bài toán đa giác",
    description:
      "Thuật toán Monotone Chain tìm bao lồi O(N log N), đếm điểm trên biên/bên trong (định lý Pick) và kiểm tra điểm trong đa giác.",
    orderIndex: 103,
  },
  {
    skillId: "algo.game_theory",
    topicId: "t35_algo_geometry_game",
    topicName: "Thuật toán: Hình học và Lý thuyết trò chơi",
    name: "Lý thuyết trò chơi: Nim, Sprague-Grundy và trạng thái thắng/thua",
    description:
      "Phân tích trạng thái P/N (thắng/thua), trò chơi bốc sỏi Nim (XOR-sum), định lý Sprague-Grundy và hàm mex.",
    orderIndex: 104,
  },
];

export const TOPICS: TopicInfo[] = [
  { topicId: "t0_intro", topicName: "Làm quen với Python", sequenceNo: 1, skillIds: ["py.intro"] },
  { topicId: "t1_basics", topicName: "Biến và vào/ra", sequenceNo: 2, skillIds: ["py.var_basic", "py.var_types", "py.var_cast", "py.io"] },
  { topicId: "t1b_operators", topicName: "Toán tử và biểu thức", sequenceNo: 3, skillIds: ["py.operators"] },
  { topicId: "t2_branching", topicName: "Rẽ nhánh", sequenceNo: 4, skillIds: ["py.branching"] },
  { topicId: "t3_loops", topicName: "Vòng lặp", sequenceNo: 5, skillIds: ["py.for_range", "py.for_iter", "py.loop_while"] },
  { topicId: "t3b_number_ops", topicName: "Xử lý số bằng vòng lặp", sequenceNo: 6, skillIds: ["py.num_calc", "py.num_digit"] },
  { topicId: "t4_collections", topicName: "Danh sách và xâu kí tự", sequenceNo: 7, skillIds: ["py.string", "py.list"] },
  { topicId: "t5_functions", topicName: "Hàm", sequenceNo: 8, skillIds: ["py.function"] },
  { topicId: "t6_debug", topicName: "Debug và tư duy giải bài", sequenceNo: 9, skillIds: ["py.debug"] },
  { topicId: "t7_cpp_intro", topicName: "C++: Bắt đầu với C++", sequenceNo: 10, skillIds: ["cpp.intro"] },
  { topicId: "t8_cpp_types", topicName: "C++: Kiểu dữ liệu và biến", sequenceNo: 11, skillIds: ["cpp.var_basic", "cpp.type_num", "cpp.type_char", "cpp.type_bool"] },
  { topicId: "t9_cpp_io", topicName: "C++: Nhập xuất", sequenceNo: 12, skillIds: ["cpp.io_out", "cpp.io_in"] },
  { topicId: "t10_cpp_operators", topicName: "C++: Toán tử", sequenceNo: 13, skillIds: ["cpp.op_arith", "cpp.op_assign", "cpp.op_compare", "cpp.op_logic", "cpp.op_precedence"] },
  { topicId: "t11_cpp_branching", topicName: "C++: Câu lệnh điều kiện", sequenceNo: 14, skillIds: ["cpp.if_basic", "cpp.if_chain", "cpp.switch"] },
  { topicId: "t12_cpp_loops", topicName: "C++: Vòng lặp", sequenceNo: 15, skillIds: ["cpp.loop_while", "cpp.loop_control", "cpp.loop_for", "cpp.loop_nested"] },
  { topicId: "t13_cpp_arrays", topicName: "C++: Mảng", sequenceNo: 16, skillIds: ["cpp.array_basic", "cpp.array_algo", "cpp.array_2d"] },
  { topicId: "t14_cpp_functions", topicName: "C++: Hàm", sequenceNo: 17, skillIds: ["cpp.func_basic", "cpp.func_ref", "cpp.scope", "cpp.overload"] },
  { topicId: "t15_cpp_string", topicName: "C++: Chuỗi ký tự", sequenceNo: 18, skillIds: ["cpp.string_basic", "cpp.string_ops"] },
  { topicId: "t16_algo_solving", topicName: "Thuật toán: Kỹ năng giải bài", sequenceNo: 19, skillIds: ["algo.problem_analysis", "algo.pseudocode_planning", "algo.complexity_estimate", "algo.small_test_debug"] },
  { topicId: "t17_algo_number_theory", topicName: "Thuật toán: Số học cơ bản", sequenceNo: 20, skillIds: ["algo.divisors_multiples", "algo.prime_check", "algo.prime_factorization", "algo.gcd_lcm", "algo.special_numbers"] },
  { topicId: "t18_algo_sieve", topicName: "Thuật toán: Sàng và tiền xử lý", sequenceNo: 21, skillIds: ["algo.sieve_eratosthenes", "algo.marking_arrays"] },
  { topicId: "t19_algo_sequences", topicName: "Thuật toán: Kỹ thuật với dãy số", sequenceNo: 22, skillIds: ["algo.array_scan", "algo.prefix_sum"] },
  { topicId: "t20_algo_strings", topicName: "Thuật toán: Xử lý chuỗi nâng cao", sequenceNo: 23, skillIds: ["algo.char_frequency", "algo.string_processing"] },
  { topicId: "t21_algo_dict_set", topicName: "Thuật toán: Dictionary và Set", sequenceNo: 24, skillIds: ["algo.dict_basics", "algo.frequency_grouping", "algo.set_basics"] },
  { topicId: "t22_algo_search_sort", topicName: "Thuật toán: Tìm kiếm và sắp xếp", sequenceNo: 25, skillIds: ["algo.linear_search", "algo.binary_search", "algo.sorting_basics", "algo.top_k_selection"] },
  { topicId: "t23_algo_two_pointers", topicName: "Thuật toán: Hai con trỏ và cửa sổ trượt", sequenceNo: 26, skillIds: ["algo.two_pointers", "algo.sliding_window"] },
  { topicId: "t24_algo_recursion", topicName: "Thuật toán: Đệ quy cơ bản", sequenceNo: 27, skillIds: ["algo.recursion_basics", "algo.recursion_classic"] },
  { topicId: "t25_algo_contest", topicName: "Thuật toán: Luyện đề và chiến thuật thi", sequenceNo: 28, skillIds: ["algo.contest_strategy"] },
  { topicId: "t26_algo_greedy", topicName: "Thuật toán: Tham lam và Chia để trị", sequenceNo: 29, skillIds: ["algo.greedy_basics", "algo.greedy_scheduling", "algo.binary_search_answer", "algo.divide_conquer_mod"] },
  { topicId: "t27_algo_ds_linear", topicName: "Thuật toán: Stack, Queue và Heap", sequenceNo: 30, skillIds: ["algo.stack_queue", "algo.monotonic_stack_deque", "algo.heap_priority_queue"] },
  { topicId: "t28_algo_backtracking", topicName: "Thuật toán: Quay lui và Nhánh cận", sequenceNo: 31, skillIds: ["algo.backtracking_generation", "algo.backtracking_pruning"] },
  { topicId: "t29_algo_dp", topicName: "Thuật toán: Quy hoạch động (DP)", sequenceNo: 32, skillIds: ["algo.dp_linear", "algo.dp_knapsack", "algo.dp_lis_lcs", "algo.dp_grid", "algo.dp_interval_bitmask"] },
  { topicId: "t30_algo_graph", topicName: "Thuật toán: Đồ thị và Cây", sequenceNo: 33, skillIds: ["algo.graph_traversal", "algo.graph_grid_bipartite", "algo.graph_topo_dag", "algo.graph_shortest_path", "algo.graph_dsu_mst"] },
  { topicId: "t31_algo_bit_adhoc", topicName: "Thuật toán: Bitmask và Tư duy Ad-hoc", sequenceNo: 34, skillIds: ["algo.bit_manipulation", "algo.adhoc_invariant"] },
  { topicId: "t32_algo_combinatorics", topicName: "Thuật toán: Tổ hợp và Ma trận", sequenceNo: 35, skillIds: ["algo.combinatorics_mod", "algo.inclusion_exclusion", "algo.matrix_exponentiation"] },
  { topicId: "t33_algo_range_queries", topicName: "Thuật toán: Cấu trúc dữ liệu truy vấn đoạn", sequenceNo: 36, skillIds: ["algo.fenwick_bit", "algo.sparse_table_rmq", "algo.segment_tree"] },
  { topicId: "t34_algo_tree_string_adv", topicName: "Thuật toán: Cây, Đồ thị và Xâu nâng cao", sequenceNo: 37, skillIds: ["algo.tree_lca_euler", "algo.graph_advanced", "algo.string_trie_z", "algo.dp_advanced"] },
  { topicId: "t35_algo_geometry_game", topicName: "Thuật toán: Hình học và Lý thuyết trò chơi", sequenceNo: 38, skillIds: ["algo.geometry_basics", "algo.convex_hull", "algo.game_theory"] },
];

/** Acyclic prerequisite DAG mapping skillId → direct prerequisite skillIds (strictly lower orderIndex). */
export const SKILL_PREREQUISITES: Record<string, string[]> = {
  // Python
  "py.intro": [],
  "py.var_basic": ["py.intro"],
  "py.var_types": ["py.var_basic"],
  "py.var_cast": ["py.var_types"],
  "py.io": ["py.var_basic", "py.var_cast"],
  "py.operators": ["py.var_types"],
  "py.branching": ["py.operators"],
  "py.for_range": ["py.branching"],
  "py.for_iter": ["py.for_range"],
  "py.loop_while": ["py.branching", "py.for_range"],
  "py.num_calc": ["py.for_range", "py.operators"],
  "py.num_digit": ["py.loop_while", "py.operators"],
  "py.string": ["py.for_iter"],
  "py.list": ["py.for_iter"],
  "py.function": ["py.branching", "py.for_range"],
  "py.debug": ["py.branching", "py.for_range", "py.function"],

  // C++
  "cpp.intro": [],
  "cpp.var_basic": ["cpp.intro"],
  "cpp.type_num": ["cpp.var_basic"],
  "cpp.type_char": ["cpp.var_basic"],
  "cpp.type_bool": ["cpp.var_basic"],
  "cpp.io_out": ["cpp.intro", "cpp.var_basic"],
  "cpp.io_in": ["cpp.io_out", "cpp.type_num"],
  "cpp.op_arith": ["cpp.type_num"],
  "cpp.op_assign": ["cpp.var_basic", "cpp.op_arith"],
  "cpp.op_compare": ["cpp.type_bool", "cpp.op_arith"],
  "cpp.op_logic": ["cpp.op_compare", "cpp.type_bool"],
  "cpp.op_precedence": ["cpp.op_arith", "cpp.op_logic"],
  "cpp.if_basic": ["cpp.op_compare"],
  "cpp.if_chain": ["cpp.if_basic", "cpp.op_logic"],
  "cpp.switch": ["cpp.if_basic"],
  "cpp.loop_while": ["cpp.if_basic", "cpp.op_assign"],
  "cpp.loop_control": ["cpp.loop_while"],
  "cpp.loop_for": ["cpp.loop_while"],
  "cpp.loop_nested": ["cpp.loop_for"],
  "cpp.array_basic": ["cpp.loop_for"],
  "cpp.array_algo": ["cpp.array_basic", "cpp.if_basic"],
  "cpp.array_2d": ["cpp.array_basic", "cpp.loop_nested"],
  "cpp.func_basic": ["cpp.if_basic", "cpp.loop_for"],
  "cpp.func_ref": ["cpp.func_basic"],
  "cpp.scope": ["cpp.func_basic"],
  "cpp.overload": ["cpp.func_basic"],
  "cpp.string_basic": ["cpp.type_char", "cpp.array_basic"],
  "cpp.string_ops": ["cpp.string_basic", "cpp.io_in"],

  // Algorithms
  "algo.problem_analysis": [],
  "algo.pseudocode_planning": ["algo.problem_analysis"],
  "algo.complexity_estimate": ["algo.pseudocode_planning"],
  "algo.small_test_debug": ["algo.problem_analysis"],
  "algo.divisors_multiples": ["algo.problem_analysis"],
  "algo.prime_check": ["algo.divisors_multiples"],
  "algo.prime_factorization": ["algo.prime_check"],
  "algo.gcd_lcm": ["algo.divisors_multiples"],
  "algo.special_numbers": ["algo.divisors_multiples"],
  "algo.sieve_eratosthenes": ["algo.prime_check", "algo.complexity_estimate"],
  "algo.marking_arrays": ["algo.complexity_estimate"],
  "algo.array_scan": ["algo.problem_analysis"],
  "algo.prefix_sum": ["algo.array_scan", "algo.complexity_estimate"],
  "algo.char_frequency": ["algo.marking_arrays"],
  "algo.string_processing": ["algo.char_frequency"],
  "algo.dict_basics": ["algo.marking_arrays"],
  "algo.frequency_grouping": ["algo.dict_basics", "algo.char_frequency"],
  "algo.set_basics": ["algo.dict_basics"],
  "algo.linear_search": ["algo.array_scan"],
  "algo.binary_search": ["algo.linear_search", "algo.complexity_estimate"],
  "algo.sorting_basics": ["algo.array_scan"],
  "algo.top_k_selection": ["algo.sorting_basics"],
  "algo.two_pointers": ["algo.sorting_basics", "algo.array_scan"],
  "algo.sliding_window": ["algo.two_pointers", "algo.prefix_sum"],
  "algo.recursion_basics": ["algo.pseudocode_planning"],
  "algo.recursion_classic": ["algo.recursion_basics"],
  "algo.contest_strategy": ["algo.complexity_estimate", "algo.small_test_debug"],
  "algo.greedy_basics": ["algo.sorting_basics", "algo.complexity_estimate"],
  "algo.greedy_scheduling": ["algo.greedy_basics"],
  "algo.binary_search_answer": ["algo.binary_search"],
  "algo.divide_conquer_mod": ["algo.recursion_classic", "algo.sorting_basics"],
  "algo.stack_queue": ["algo.array_scan"],
  "algo.monotonic_stack_deque": ["algo.stack_queue", "algo.sliding_window"],
  "algo.heap_priority_queue": ["algo.sorting_basics", "algo.top_k_selection"],
  "algo.backtracking_generation": ["algo.recursion_classic"],
  "algo.backtracking_pruning": ["algo.backtracking_generation", "algo.complexity_estimate"],
  "algo.dp_linear": ["algo.recursion_classic", "algo.prefix_sum"],
  "algo.dp_knapsack": ["algo.dp_linear"],
  "algo.dp_lis_lcs": ["algo.dp_linear", "algo.binary_search"],
  "algo.dp_grid": ["algo.dp_linear"],
  "algo.dp_interval_bitmask": ["algo.dp_knapsack", "algo.dp_grid"],
  "algo.graph_traversal": ["algo.stack_queue", "algo.recursion_basics"],
  "algo.graph_grid_bipartite": ["algo.graph_traversal"],
  "algo.graph_topo_dag": ["algo.graph_traversal", "algo.dp_linear"],
  "algo.graph_shortest_path": ["algo.graph_traversal", "algo.heap_priority_queue"],
  "algo.graph_dsu_mst": ["algo.graph_traversal", "algo.greedy_basics"],
  "algo.bit_manipulation": ["algo.marking_arrays", "algo.complexity_estimate"],
  "algo.adhoc_invariant": ["algo.problem_analysis", "algo.greedy_basics"],
  "algo.combinatorics_mod": ["algo.divide_conquer_mod"],
  "algo.inclusion_exclusion": ["algo.combinatorics_mod", "algo.bit_manipulation"],
  "algo.matrix_exponentiation": ["algo.divide_conquer_mod", "algo.dp_linear"],
  "algo.fenwick_bit": ["algo.prefix_sum", "algo.bit_manipulation"],
  "algo.sparse_table_rmq": ["algo.prefix_sum", "algo.bit_manipulation"],
  "algo.segment_tree": ["algo.fenwick_bit", "algo.divide_conquer_mod"],
  "algo.tree_lca_euler": ["algo.graph_traversal", "algo.dp_interval_bitmask"],
  "algo.graph_advanced": ["algo.graph_shortest_path", "algo.graph_topo_dag"],
  "algo.string_trie_z": ["algo.string_processing", "algo.bit_manipulation"],
  "algo.dp_advanced": ["algo.dp_knapsack", "algo.dp_lis_lcs"],
  "algo.geometry_basics": ["algo.problem_analysis", "algo.sorting_basics"],
  "algo.convex_hull": ["algo.geometry_basics"],
  "algo.game_theory": ["algo.bit_manipulation", "algo.dp_linear"],
};

/** Map of skillId → SkillSeed for fast lookup + reverse dependent adjacency */
const skillMap = new Map<string, SkillSeed>();
const dependentsMap = new Map<string, string[]>();

for (const s of SKILL_SEEDS) {
  const prereqs = SKILL_PREREQUISITES[s.skillId] ?? [];
  s.prerequisites = prereqs;
  skillMap.set(s.skillId, s);
  if (!dependentsMap.has(s.skillId)) dependentsMap.set(s.skillId, []);
  for (const p of prereqs) {
    if (!dependentsMap.has(p)) dependentsMap.set(p, []);
    dependentsMap.get(p)!.push(s.skillId);
  }
}

export function getSkillPrerequisites(skillId: string): string[] {
  return skillMap.get(skillId)?.prerequisites ?? SKILL_PREREQUISITES[skillId] ?? [];
}

export function getSkillDependents(skillId: string): string[] {
  return dependentsMap.get(skillId) ?? [];
}

/** BFS returning upstream prerequisite skillIds nearest-first up to `maxDepth`. */
export function getPrerequisiteAncestors(skillId: string, maxDepth = 3): string[] {
  const visited = new Set<string>([skillId]);
  const ordered: string[] = [];
  let frontier = [...getSkillPrerequisites(skillId)];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      ordered.push(id);
      for (const parent of getSkillPrerequisites(id)) {
        if (!visited.has(parent)) nextFrontier.push(parent);
      }
    }
    frontier = nextFrontier;
  }
  return ordered;
}

export function skillIdToName(skillId: string): string {
  return skillMap.get(skillId)?.name || skillId;
}

export function skillIdToTopic(skillId: string): string {
  return skillMap.get(skillId)?.topicId || "unknown";
}

/**
 * Title-based skill guessing was removed on purpose.
 *
 * The only trusted sources for a question's/lesson's skills are approved tags
 * (`skillTagStatus === "approved"` on QuizQuestion / Problem /
 * SkillTagMapping) or the skill snapshot stored on evidence rows. Guessing
 * from titles violated invariant #2 ("only an approved skill tag may affect
 * mastery") and produced noisy classifications.
 *
 * New content gets classified by the LLM tagging pipeline and must be
 * teacher-approved before it affects mastery or recommendations.
 */
