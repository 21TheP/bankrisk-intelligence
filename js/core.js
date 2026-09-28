/* ============================================================
   BANKRISK Intelligence — Lõi tính toán (core engine)
   Chạy được cả trên main thread lẫn trong Web Worker.
   Ghi chú nguồn quy tắc: [PRD Mục 7, 9, 10] trong BANKRISK PRD v1.1
   ============================================================ */
(function (global) {
  'use strict';
  const BR = global.BRCORE = {};

  /* ---------------- Hằng số & từ điển ---------------- */

  // 16 trường bắt buộc (PRD Mục 6.2)
  BR.REQUIRED_COLS = [
    'bank_code', 'bank_name', 'year', 'total_assets', 'risk_weighted_assets',
    'regulatory_capital', 'profit_after_tax', 'total_operating_income',
    'net_interest_income', 'gross_loans', 'group_3_loans', 'group_4_loans',
    'group_5_loans', 'credit_risk_provision_expense', 'operating_expenses', 'inflation'
  ];
  // Trường tuỳ chọn kiểm toán/truy vết (PRD Mục 6.3)
  BR.AUDIT_COLS = ['source_url', 'report_date', 'audited_status', 'notes'];
  // Trường mở rộng tuỳ chọn (PRD Phụ lục A)
  BR.EXTENSION_COLS = ['car_reported', 'total_deposits', 'earning_assets', 'equity', 'ownership_group'];

  // Bảng ánh xạ tự động tên cột thô (tiếng Việt có/không dấu / viết tắt tài chính BCTC)
  BR.normalizeHeader = function (rawCol) {
    if (!rawCol) return '';
    const s = String(rawCol).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_').replace(/^_|_$/g, '');
    const ALIASES = {
      bank_code: ['ma_ngan_hang', 'ma_nh', 'ma_ck', 'ma', 'ticker', 'symbol', 'code', 'bank', 'bank_code', 'id'],
      bank_name: ['ten_ngan_hang', 'ten_nh', 'ten', 'bank_name', 'name', 'ngan_hang'],
      year: ['nam', 'nam_tai_chinh', 'year', 'fiscal_year', 'ky', 'ky_bctc'],
      total_assets: ['tong_tai_san', 'tts', 'total_assets', 'assets', 'tai_san', 'asset', 'asset1', 'asset2'],
      risk_weighted_assets: ['tai_san_rui_ro', 'tsrr', 'rwa', 'risk_weighted_assets'],
      regulatory_capital: ['von_tu_co', 'vtc', 'regulatory_capital', 'tier1_tier2', 'capital'],
      profit_after_tax: ['loi_nhuan_sau_thue', 'lnst', 'profit_after_tax', 'pat', 'net_profit', 'netprofit'],
      total_operating_income: ['tong_thu_nhap_hoat_dong', 'toi', 'total_operating_income', 'thu_nhap_hoat_dong', 'totalincome'],
      net_interest_income: ['thu_nhap_lai_thuan', 'nii', 'net_interest_income', 'lai_thuan', 'interest'],
      gross_loans: ['du_no_cho_vay', 'du_no', 'cho_vay_khach_hang', 'gross_loans', 'loans', 'cho_vay', 'loan'],
      group_3_loans: ['no_nhom_3', 'nhom_3', 'group_3_loans', 'group_3', 'substandard_loans'],
      group_4_loans: ['no_nhom_4', 'nhom_4', 'group_4_loans', 'group_4', 'doubtful_loans'],
      group_5_loans: ['no_nhom_5', 'nhom_5', 'group_5_loans', 'group_5', 'loss_loans'],
      credit_risk_provision_expense: ['chi_phi_du_phong_rui_ro', 'chi_phi_du_phong', 'credit_risk_provision_expense', 'provision', 'du_phong', 'provisionloss'],
      operating_expenses: ['chi_phi_hoat_dong', 'operating_expenses', 'opex', 'cphd', 'totalexpense', 'expense'],
      inflation: ['lam_phat', 'inflation', 'cpi', 'inf', 'infl'],
      car_reported: ['car_cong_bo', 'car_reported', 'car'],
      total_deposits: ['tien_gui_khach_hang', 'tien_gui', 'total_deposits', 'deposits', 'deposit'],
      earning_assets: ['tai_san_sinh_loi', 'earning_assets'],
      equity: ['von_chu_so_huu', 'vcsh', 'equity'],
      ownership_group: ['nhom_so_huu', 'ownership_group', 'stateprivate'],
      bad_debts: ['no_xau', 'bad_debts', 'nonperforming']
    };
    for (const [target, aliasList] of Object.entries(ALIASES)) {
      if (aliasList.includes(s) || aliasList.includes(String(rawCol).trim().toLowerCase())) return target;
    }
    return s;
  };

  // Tra cứu lạm phát Việt Nam (GSO) theo năm hỗ trợ tự điền dữ liệu thô
  BR.GSO_INFLATION = {
    2014: 4.09, 2015: 0.63, 2016: 2.67, 2017: 3.53, 2018: 3.54,
    2019: 2.79, 2020: 3.23, 2021: 1.84, 2022: 3.15, 2023: 3.25, 2024: 3.63
  };

  // Cột không được âm (V-09)
  BR.NON_NEGATIVE_COLS = ['total_assets', 'risk_weighted_assets', 'regulatory_capital',
    'gross_loans', 'group_3_loans', 'group_4_loans', 'group_5_loans',
    'credit_risk_provision_expense', 'operating_expenses'];
  // Cột số bắt buộc (V-07)
  BR.REQUIRED_NUMERIC = BR.REQUIRED_COLS.filter(c => !['bank_code', 'bank_name'].includes(c));

  // Thông tin chỉ tiêu: nhãn, công thức, hướng "tốt hơn", ngưỡng
  BR.INDICATORS = {
    size: { key: 'size', label: 'SIZE', vi: 'Quy mô (ln tổng tài sản)', formula: 'SIZE = ln(total_assets)', dir: 1, isPct: false, decimals: 3 },
    car: { key: 'car', label: 'CAR', vi: 'An toàn vốn', formula: 'CAR = regulatory_capital / risk_weighted_assets', dir: 1, isPct: true, threshold: 0.08, decimals: 2 },
    roa: { key: 'roa', label: 'ROA', vi: 'Sinh lời trên tài sản', formula: 'ROA = profit_after_tax / average_total_assets', dir: 1, isPct: true, decimals: 2 },
    niir: { key: 'niir', label: 'NIIR', vi: 'Tỷ trọng thu nhập ngoài lãi', formula: 'NIIR = (total_operating_income − net_interest_income) / total_operating_income', dir: 1, isPct: true, decimals: 2 },
    npl: { key: 'npl', label: 'NPL', vi: 'Tỷ lệ nợ xấu', formula: 'NPL = (group_3_loans + group_4_loans + group_5_loans) / gross_loans', dir: -1, isPct: true, threshold: 0.03, decimals: 2 },
    dprr: { key: 'dprr', label: 'DPRR', vi: 'Tỷ lệ trích lập dự phòng', formula: 'DPRR = credit_risk_provision_expense / total_operating_income', dir: -1, isPct: true, decimals: 2 },
    cir: { key: 'cir', label: 'CIR', vi: 'Chi phí trên thu nhập', formula: 'CIR = operating_expenses / total_operating_income', dir: -1, isPct: true, decimals: 2 },
    inf: { key: 'inf', label: 'INF', vi: 'Lạm phát', formula: 'INF = lạm phát trung bình năm (GSO)', dir: -1, isPct: true, decimals: 2 }
  };

  // Ngưỡng phân loại [GIẢ ĐỊNH HỌC THUẬT – CẤU HÌNH ĐƯỢC] (PRD Mục 9.1)
  BR.THRESHOLDS = {
    riskNpl: 0.03, riskCar: 0.08,          // quy tắc RISK của nghiên cứu (nguyên tắc, không đổi)
    carWatchHigh: 0.09, nplWatchHigh: 0.02, // dải "Theo dõi"
    carCritical: 0.06,                      // CAR < 6% → nghiêm trọng
    cirHigh: 0.60, cirVeryHigh: 0.70,
    dprrHigh: 0.30, dprrVeryHigh: 0.45,
    niirLow: 0.10,
    severityCritical: 75, severityHigh: 50, severityWatch: 25,
    hysteresisPp: 0.1                       // dải trễ ±0,1 điểm % (PRD 9.5)
  };

  // Trọng số Financial Health Score mặc định (PRD Mục 9.2) [GIẢ ĐỊNH]
  BR.FHS_WEIGHTS_DEFAULT = { car: 25, npl: 25, roa: 15, cir: 10, dprr: 10, niir: 10, size: 5 };

  // Hệ số Logit công bố trong báo cáo gốc — Bảng 4.3 (PRD Phụ lục B) [huy hiệu A]
  BR.LOGIT_COEFS = {
    intercept: 5.820, SIZE: -0.452, CAR: -0.620, ROA: -8.450,
    NIIR: -2.340, NPL: 12.670, DPRR: 3.450, CIR: 1.230
  };

  BR.SEVERITY_RAW_MAX = 120; // 30+30+15+10+10+5+20 (PRD 9.4)

  /* ---------------- Tiện ích chung ---------------- */

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  BR.clamp = clamp;
  BR.sigmoid = x => 1 / (1 + Math.exp(-x));

  BR.median = function (arr) { return BR.quantile(arr, 0.5); };
  BR.quantile = function (arr, q) {
    const v = arr.filter(x => x !== null && x !== undefined && Number.isFinite(x)).slice().sort((a, b) => a - b);
    if (!v.length) return null;
    const pos = (v.length - 1) * q, base = Math.floor(pos), rest = pos - base;
    return v[base + 1] !== undefined ? v[base] + rest * (v[base + 1] - v[base]) : v[base];
  };
  BR.mean = arr => {
    const v = arr.filter(Number.isFinite);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  BR.sd = function (arr) {
    const v = arr.filter(Number.isFinite);
    if (v.length < 2) return null;
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1));
  };
  // Phân vị trong mẫu (percentile rank) — dùng cho FHS (PRD 9.2)
  BR.percentileRank = function (value, pool, dir) {
    const v = pool.filter(Number.isFinite);
    if (!v.length || value === null || !Number.isFinite(value)) return null;
    const below = v.filter(x => x < value).length;
    const equal = v.filter(x => x === value).length;
    let pct = v.length === 1 ? 100 : ((below + equal * 0.5) / v.length) * 100;
    if (dir === -1) pct = 100 - pct;
    return pct;
  };

  // Định dạng kiểu Việt Nam: 11,95% / 1.105.000
  BR.fmtPct = function (x, dec) {
    if (x === null || x === undefined || !Number.isFinite(x)) return 'N/A';
    return (x * 100).toLocaleString('vi-VN', { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec }) + '%';
  };
  BR.fmtNum = function (x, dec) {
    if (x === null || x === undefined || !Number.isFinite(x)) return 'N/A';
    return x.toLocaleString('vi-VN', { minimumFractionDigits: dec === undefined ? 0 : dec, maximumFractionDigits: dec === undefined ? 0 : dec });
  };
  BR.fmtMoney = function (x) {
    if (x === null || x === undefined || !Number.isFinite(x)) return 'N/A';
    const abs = Math.abs(x);
    if (abs >= 1e6) return (x / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' nghìn tỷ';
    if (abs >= 1e3) return (x / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' tỷ';
    return BR.fmtNum(x);
  };
  // Escape HTML (SEC-15: chống XSS từ dữ liệu người dùng)
  BR.esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---------------- Phân tích số thô (C-03) ---------------- */
  // Chấp nhận "1.105.000", "1,105,000", "1234.5", "12,5" → số
  BR.parseNumeric = function (raw) {
    if (raw === null || raw === undefined) return { ok: false, value: null, raw };
    if (typeof raw === 'number') return Number.isFinite(raw) ? { ok: true, value: raw, raw } : { ok: false, value: null, raw };
    let s = String(raw).trim();
    if (!s) return { ok: false, value: null, raw };
    s = s.replace(/[₫$€\s]|[vV][nN][dD]/g, '');
    const hasDot = s.includes('.'), hasComma = s.includes(',');
    if (hasDot && hasComma) {
      // dấu xuất hiện sau cùng là dấu thập phân
      if (s.lastIndexOf('.') > s.lastIndexOf(',')) s = s.replace(/,/g, '');
      else s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
      // 1,105,000 (nhóm 3 chữ số) → hàng nghìn; 12,5 → thập phân
      if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
      else s = s.replace(',', '.');
    } else if (hasDot) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
    }
    const v = Number(s);
    return Number.isFinite(v) ? { ok: true, value: v, raw } : { ok: false, value: null, raw };
  };

  /* ---------------- Làm sạch (PRD Mục 7.2) ---------------- */
  // C-01..C-05, C-08: chuẩn hoá, giữ giá trị gốc, gắn cờ thay vì tự sửa
  BR.cleanRows = function (rawRows, opts) {
    opts = opts || {};
    const out = [];
    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i] || {};
      const row = { _rowIdx: i, _raw: {} };
      row.bank_code = String(r.bank_code === undefined || r.bank_code === null ? '' : r.bank_code).trim().toUpperCase().replace(/\s+/g, ''); // C-01
      row.bank_name = r.bank_name === undefined || r.bank_name === null || String(r.bank_name).trim() === '' ? row.bank_code : String(r.bank_name).trim();
      const yRaw = r.year;
      const yParsed = BR.parseNumeric(yRaw);
      row.year = yParsed.ok ? Math.trunc(yParsed.value) : null;
      for (const c of BR.REQUIRED_NUMERIC) {
        row._raw[c] = r[c];
        const p = BR.parseNumeric(r[c]);
        row[c] = p.ok ? p.value : null;
        if (p.ok && p.value !== p.raw && typeof p.raw === 'string') row._raw[c] = p.raw; // C-05 giữ nguyên văn
      }
      // ponytail: GSO inflation fallback cho dữ liệu thô thiếu chỉ số vĩ mô
      if (row.inflation === null && row.year && BR.GSO_INFLATION[row.year] !== undefined) {
        row.inflation = BR.GSO_INFLATION[row.year];
      }
      // ponytail: nếu chỉ có tổng nợ xấu (bad_debts/no_xau) → gán nhóm 5, nhóm 3+4=0 để NPL chính xác
      if (row.group_5_loans === null && (r.no_xau !== undefined || r.bad_debts !== undefined)) {
        const bd = BR.parseNumeric(r.no_xau !== undefined ? r.no_xau : r.bad_debts);
        if (bd.ok) {
          row.group_5_loans = bd.value;
          row.group_3_loans = row.group_3_loans || 0;
          row.group_4_loans = row.group_4_loans || 0;
        }
      }
      for (const c of BR.AUDIT_COLS.concat(BR.EXTENSION_COLS)) {
        row[c] = r[c] === undefined ? null : (typeof r[c] === 'string' ? r[c].trim() : r[c]);
        if (c === 'car_reported' || c === 'total_deposits' || c === 'earning_assets' || c === 'equity') {
          const p = BR.parseNumeric(r[c]);
          row[c] = p.ok ? p.value : null;
        }
      }
      out.push(row);
    }
    out.sort((a, b) => a.bank_code.localeCompare(b.bank_code) || (a.year - b.year)); // C-04
    return out;
  };

  /* ---------------- Kiểm tra dữ liệu (PRD Mục 7.1, V-01..V-14) ---------------- */
  // V-01 (định dạng tệp) và V-02 (dung lượng) kiểm ở bước upload phía UI.
  BR.validate = function (rows, opts) {
    opts = opts || {};
    const currentYear = new Date().getFullYear();
    const issues = [];
    const push = (level, rule, rowIdx, col, value, message, suggestion) =>
      issues.push({ level, rule, row: rowIdx, col, value, message, suggestion });

    // V-03: đủ cột bắt buộc
    if (opts.columns) {
      const missing = BR.REQUIRED_COLS.filter(c => !opts.columns.includes(c));
      if (missing.length) {
        push('block', 'V-03', null, missing.join(', '), null,
          'Thiếu ' + missing.length + ' cột bắt buộc: ' + missing.join(', '),
          'Bổ sung các cột theo mẫu bankrisk_template_v1.xlsx');
      }
    }

    // V-04: trùng bank_code + year
    const seen = new Map();
    rows.forEach((r, i) => {
      const k = r.bank_code + '|' + r.year;
      if (seen.has(k)) push('block', 'V-04', i, 'bank_code + year', k,
        'Trùng bản ghi với dòng ' + (seen.get(k) + 1),
        'Giữ một dòng duy nhất; xác nhận dòng nào là bản hợp nhất đã kiểm toán');
      else seen.set(k, i);
    });

    rows.forEach((r, i) => {
      // V-05: bank_code
      if (!r.bank_code) push('block', 'V-05', i, 'bank_code', r._raw ? r._raw.bank_code : '', 'Mã ngân hàng rỗng', 'Điền mã ngân hàng (VD: VCB)');
      else if (!/^[A-Z0-9]{2,10}$/.test(r.bank_code)) push('block', 'V-05', i, 'bank_code', r.bank_code, 'Mã ngân hàng chứa ký tự không hợp lệ', 'Chỉ dùng chữ cái viết hoa và số (2–10 ký tự)');
      if (!r.bank_name) push('block', 'V-05', i, 'bank_name', r.bank_name, 'Tên ngân hàng rỗng', 'Điền tên đầy đủ của ngân hàng');

      // V-06: year
      if (r.year === null || !Number.isFinite(r.year)) push('block', 'V-06', i, 'year', r._raw ? r._raw.year : '', 'Năm tài chính không phải số', 'Sửa thành năm dạng số (VD: 2023)');
      else if (r.year < 1990 || r.year > currentYear) push('block', 'V-06', i, 'year', r.year, 'Năm ngoài khoảng cho phép (1990–' + currentYear + ')', 'Kiểm tra lại năm tài chính');

      // V-07: thiếu giá trị bắt buộc
      for (const c of BR.REQUIRED_NUMERIC) {
        if (r[c] === null) push('block', 'V-07', i, c, r._raw ? r._raw[c] : '', 'Giá trị bắt buộc bị thiếu', 'Bổ sung từ BCTC/Công bố an toàn vốn; chỉ tiêu liên quan sẽ hiển thị N/A');
      }

      // V-09: giá trị âm không hợp lệ
      for (const c of BR.NON_NEGATIVE_COLS) {
        if (r[c] !== null && r[c] < 0) push('block', 'V-09', i, c, r[c], 'Giá trị âm không hợp lệ', c + ' phải ≥ 0; kiểm tra dấu của số liệu');
      }

      // V-10: nguy cơ chia cho 0
      if (r.total_operating_income === 0) push('block', 'V-10', i, 'total_operating_income', 0, 'Tổng thu nhập hoạt động = 0 → NIIR, DPRR, CIR không tính được', 'Kiểm tra lại báo cáo KQKD');
      if (r.gross_loans === 0) push('block', 'V-10', i, 'gross_loans', 0, 'Dư nợ = 0 → NPL không tính được', 'Kiểm tra lại bảng cân đối kế toán');
      if (r.risk_weighted_assets === 0) push('block', 'V-10', i, 'risk_weighted_assets', 0, 'RWA = 0 → CAR không tính được', 'Kiểm tra lại công bố an toàn vốn');

      // V-12: tổng nợ nhóm 3–5 > dư nợ
      if ([r.group_3_loans, r.group_4_loans, r.group_5_loans, r.gross_loans].every(x => x !== null)) {
        if (r.group_3_loans + r.group_4_loans + r.group_5_loans > r.gross_loans)
          push('block', 'V-12', i, 'group_3_loans', r.group_3_loans + r.group_4_loans + r.group_5_loans, 'Tổng nợ nhóm 3+4+5 lớn hơn dư nợ — vô lý về kế toán', 'Kiểm tra lại thuyết minh chất lượng nợ');
      }

      // V-13: NII > TOI (cảnh báo — có thể đúng nếu mảng phi lãi lỗ)
      if (r.net_interest_income !== null && r.total_operating_income !== null && r.net_interest_income > r.total_operating_income)
        push('warn', 'V-13', i, 'net_interest_income', r.net_interest_income, 'Thu nhập lãi thuần lớn hơn tổng thu nhập hoạt động', 'Có thể đúng nếu thu nhập phi lãi bị lỗ — vui lòng xác nhận');

      // Cảnh báo hợp lý: RWA > 1.5 × total_assets
      if (r.risk_weighted_assets !== null && r.total_assets !== null && r.total_assets > 0 && r.risk_weighted_assets > r.total_assets * 1.5)
        push('warn', 'V-16', i, 'risk_weighted_assets', r.risk_weighted_assets, 'RWA lớn hơn 1,5 × tổng tài sản — bất thường', 'Kiểm tra lại công bố an toàn vốn');
    });

    // V-08: inflation không nhất quán trong cùng năm
    const byYear = new Map();
    rows.forEach(r => {
      if (r.year === null || r.inflation === null) return;
      if (!byYear.has(r.year)) byYear.set(r.year, new Map());
      const m = byYear.get(r.year);
      if (!m.has(r.inflation)) m.set(r.inflation, []);
      m.get(r.inflation).push(r);
    });
    byYear.forEach((m, year) => {
      if (m.size > 1) {
        const values = [...m.keys()];
        rows.forEach((r, i) => {
          if (r.year === year && r.inflation !== null)
            push('warn', 'V-08', i, 'inflation', r.inflation, 'Lạm phát không nhất quán trong năm ' + year + ' (' + values.map(v => BR.fmtPct(v / 100)).join(' vs ') + ')', 'Gợi ý: dùng một nguồn chung cho cả năm (GSO/World Bank)');
        });
      }
    });

    // V-14: chuỗi năm đứt quãng
    const banksWithGaps = new Set();
    const byBank = new Map();
    rows.forEach(r => {
      if (!r.bank_code || r.year === null) return;
      if (!byBank.has(r.bank_code)) byBank.set(r.bank_code, new Set());
      byBank.get(r.bank_code).add(r.year);
    });
    byBank.forEach((years, code) => {
      const ys = [...years].sort((a, b) => a - b);
      for (let k = 1; k < ys.length; k++) if (ys[k] - ys[k - 1] > 1) banksWithGaps.add(code);
    });

    const blocks = issues.filter(x => x.level === 'block');
    const warns = issues.filter(x => x.level === 'warn');
    const dq = BR.dqScore(rows, warns, banksWithGaps);
    return { issues, blocks, warns, banksWithGaps: [...banksWithGaps], dq };
  };

  // Điểm chất lượng dữ liệu (PRD Mục 7.2.1) [GIẢ ĐỊNH HỌC THUẬT]
  BR.dqScore = function (rows, warns, banksWithGaps) {
    const n = rows.length || 1;
    let missingCells = 0;
    let missingAudit = 0;
    rows.forEach(r => {
      for (const c of BR.REQUIRED_NUMERIC) if (r[c] === null) missingCells++;
      if (!r.source_url) missingAudit++;
      if (!r.audited_status) missingAudit++;
    });
    const warnRows = new Set(warns.map(w => w.row)).size;
    const gapCount = banksWithGaps ? (banksWithGaps.size !== undefined ? banksWithGaps.size : (banksWithGaps.length || 0)) : 0;
    const dq = 100
      - 2.0 * (missingCells / (n * BR.REQUIRED_NUMERIC.length) * 100)
      - 1.5 * (warnRows / n * 100)
      - 1.0 * ((gapCount / Math.max(1, new Set(rows.map(r => r.bank_code)).size)) * 100)
      - 0.5 * (missingAudit / (n * 2) * 100);
    const score = clamp(Math.round(dq), 0, 100);
    const label = score >= 90 ? 'Tốt' : score >= 70 ? 'Khá' : score >= 50 ? 'Cần xem lại' : 'Kém';
    return { score, label, missingCells, warnRows, banksWithGaps: gapCount };
  };

  /* ---------------- Tính chỉ tiêu (PRD Mục 7.3, F-01..F-06) ---------------- */
  // opts.carMode: 'computed' (mặc định) | 'reported' (dùng car_reported khi thiếu RWA) | 'derive' (suy ra RWA)
  BR.computeIndicators = function (rows, opts) {
    opts = opts || {};
    const calcVersion = '1.0';
    const list = rows.map(r => {
      const ind = {
        bank_code: r.bank_code, bank_name: r.bank_name, year: r.year, _rowIdx: r._rowIdx,
        size: null, car: null, car_source: null, roa: null, roa_flag: null,
        niir: null, npl: null, dprr: null, cir: null,
        equity_to_assets: null, ldr: null, nim: null,
        risk_label: null, risk_partial: false,
        naReasons: {}
      };
      // SIZE (F-06)
      ind._total_assets = r.total_assets;
      if (r.total_assets !== null && r.total_assets > 0) ind.size = Math.log(r.total_assets);
      else if (r.total_assets !== null) ind.naReasons.size = 'total_assets ≤ 0';

      // CAR (7.3.3): computed | reported | derived
      if (r.risk_weighted_assets !== null && r.risk_weighted_assets > 0 && r.regulatory_capital !== null) {
        ind.car = r.regulatory_capital / r.risk_weighted_assets;
        ind.car_source = 'computed';
      } else if (r.car_reported !== null && r.car_reported > 0) {
        const cr = r.car_reported > 1 ? r.car_reported / 100 : r.car_reported; // % hoặc thập phân
        ind.car = cr;
        ind.car_source = 'reported';
        if (opts.carMode === 'derive' && r.regulatory_capital !== null) {
          ind.car = r.regulatory_capital / (r.regulatory_capital / cr); // RWA suy ra → CAR = reported (giữ nguyên giá trị)
          ind.car_source = 'reported';
        }
      } else {
        ind.naReasons.car = 'thiếu risk_weighted_assets' + (r.regulatory_capital !== null ? ' (vốn tự có có sẵn — xem cơ chế 7.3.3)' : '');
      }

      // NPL
      if (r.gross_loans !== null && r.gross_loans > 0 &&
        r.group_3_loans !== null && r.group_4_loans !== null && r.group_5_loans !== null) {
        ind.npl = (r.group_3_loans + r.group_4_loans + r.group_5_loans) / r.gross_loans;
      } else if (r.gross_loans !== null && r.gross_loans > 0) ind.naReasons.npl = 'thiếu dữ liệu nợ nhóm 3–5';

      // ROA (F-01): trung bình tài sản — ghép sau bằng map theo bank
      ind._pa = r.profit_after_tax; ind._ta = r.total_assets;

      // NIIR / DPRR / CIR (F-04: mẫu số 0/thiếu → null)
      if (r.total_operating_income !== null && r.total_operating_income !== 0) {
        if (r.net_interest_income !== null) ind.niir = (r.total_operating_income - r.net_interest_income) / r.total_operating_income;
        if (r.credit_risk_provision_expense !== null) ind.dprr = r.credit_risk_provision_expense / r.total_operating_income;
        if (r.operating_expenses !== null) ind.cir = r.operating_expenses / r.total_operating_income;
      } else if (r.total_operating_income === 0) {
        ind.naReasons.niir = ind.naReasons.dprr = ind.naReasons.cir = 'total_operating_income = 0';
      }

      // Các chỉ tiêu mở rộng
      if (r.equity !== null && r.total_assets > 0) ind.equity_to_assets = r.equity / r.total_assets;
      if (r.total_deposits !== null && r.total_deposits > 0 && r.gross_loans !== null) ind.ldr = r.gross_loans / r.total_deposits;
      ind._ea = r.earning_assets; // NIM cần trung bình → ghép sau

      ind.inflation = r.inflation === null ? null : r.inflation / 100; // lưu thập phân (F-02)
      return ind;
    });

    // Ghép ROA (trung bình 2 năm) và NIM
    const map = new Map(list.map(x => [x.bank_code + '|' + x.year, x]));
    list.forEach(ind => {
      const prev = map.get(ind.bank_code + '|' + (ind.year - 1));
      if (ind._pa !== null && ind._ta !== null && ind._ta > 0) {
        if (prev && prev._ta !== null && prev._ta > 0) ind.roa = ind._pa / ((ind._ta + prev._ta) / 2);
        else { ind.roa = ind._pa / ind._ta; ind.roa_flag = 'roa_end_of_period'; } // F-01
      }
      if (ind._ea !== null && ind._ea > 0 && ind.netInterestBase !== 0) {
        const row = rows[ind._rowIdx];
        if (row && row.net_interest_income !== null) {
          if (prev && prev._ea !== null && prev._ea > 0) ind.nim = row.net_interest_income / ((ind._ea + prev._ea) / 2);
          else { ind.nim = row.net_interest_income / ind._ea; }
        }
      }
    });
    list.forEach(ind => {
      delete ind._pa; delete ind._ta; delete ind._ea;
    });

    // Nhãn RISK (F-03: so sánh nghiêm ngặt, F-02: thập phân)
    list.forEach(ind => {
      const nplBad = ind.npl !== null && ind.npl > BR.THRESHOLDS.riskNpl;
      const carBad = ind.car !== null && ind.car < BR.THRESHOLDS.riskCar;
      if (ind.npl === null && ind.car === null) { ind.risk_label = null; }
      else {
        ind.risk_label = (nplBad || carBad) ? 1 : 0;
        ind.risk_partial = ind.npl === null || ind.car === null; // đánh giá một phần (Phụ lục B)
      }
    });

    // Metadata tính toán (M-07)
    const meta = { calc_version: calcVersion, car_mode: opts.carMode || 'computed', computed_at: new Date().toISOString(), winsorized: false };
    return { indicators: list, meta };
  };

  // C-09: Winsorization tuỳ chọn (mặc định TẮT) trên các biến tỷ lệ
  BR.winsorizeIndicators = function (indicators, cols) {
    cols = cols || ['car', 'roa', 'niir', 'npl', 'dprr', 'cir'];
    for (const c of cols) {
      const vals = indicators.map(i => i[c]).filter(Number.isFinite).sort((a, b) => a - b);
      if (vals.length < 20) continue;
      const lo = BR.quantile(vals, 0.01), hi = BR.quantile(vals, 0.99);
      indicators.forEach(i => {
        if (Number.isFinite(i[c])) { if (i[c] < lo) i[c] = lo; if (i[c] > hi) i[c] = hi; }
      });
    }
    return indicators;
  };

  // Z-score (PRD Phụ lục B): (ROA + equity/total_assets) / sd(ROA), cửa sổ ≥ 3 năm của chính ngân hàng
  BR.computeZScores = function (indicators) {
    const byBank = new Map();
    indicators.forEach(i => {
      if (!byBank.has(i.bank_code)) byBank.set(i.bank_code, []);
      byBank.get(i.bank_code).push(i);
    });
    byBank.forEach(arr => {
      arr.sort((a, b) => a.year - b.year);
      const sdRoa = BR.sd(arr.map(x => x.roa));
      arr.forEach(i => {
        i.zscore = (sdRoa !== null && sdRoa > 0 && i.roa !== null && i.equity_to_assets !== null && arr.length >= 3)
          ? (i.roa + i.equity_to_assets) / sdRoa : null;
        i.zscore_n = arr.length;
      });
    });
    return indicators;
  };

  /* ---------------- Phân loại rủi ro (PRD Mục 9) ---------------- */

  // Điểm nghiêm trọng (PRD 9.4) — mọi quy tắc liệt kê minh bạch
  BR.severityScore = function (ind, prevRoa, modelProb) {
    const T = BR.THRESHOLDS, rules = [];
    let raw = 0;
    if (ind.car !== null && ind.car < T.riskCar) {
      const steps = Math.floor((T.riskCar - ind.car) / 0.005 + 1e-9);
      const pts = Math.min(30, steps * 5);
      if (pts > 0) { raw += pts; rules.push({ var: 'CAR', msg: 'CAR dưới ngưỡng 8%: mỗi 0,5 điểm % thiếu cộng 5 điểm', value: ind.car, threshold: T.riskCar, points: pts }); }
    }
    if (ind.npl !== null && ind.npl > T.riskNpl) {
      const steps = Math.floor((ind.npl - T.riskNpl) / 0.005 + 1e-9);
      const pts = Math.min(30, steps * 5);
      if (pts > 0) { raw += pts; rules.push({ var: 'NPL', msg: 'NPL trên ngưỡng 3%: mỗi 0,5 điểm % vượt cộng 5 điểm', value: ind.npl, threshold: T.riskNpl, points: pts }); }
    }
    if (ind.roa !== null && ind.roa < 0) {
      raw += 10; rules.push({ var: 'ROA', msg: 'ROA âm', value: ind.roa, threshold: 0, points: 10 });
      if (prevRoa !== null && prevRoa !== undefined && ind.roa < prevRoa) {
        // "ROA giảm 2 năm liên tiếp" — cần chuỗi; caller truyền prevRoa đã kiểm tra chuỗi 2 năm
      }
    }
    if (ind.cir !== null && ind.cir > T.cirVeryHigh) { raw += 10; rules.push({ var: 'CIR', msg: 'CIR > 70%', value: ind.cir, threshold: T.cirVeryHigh, points: 10 }); }
    else if (ind.cir !== null && ind.cir > T.cirHigh) { raw += 5; rules.push({ var: 'CIR', msg: 'CIR > 60%', value: ind.cir, threshold: T.cirHigh, points: 5 }); }
    if (ind.dprr !== null && ind.dprr > T.dprrVeryHigh) { raw += 10; rules.push({ var: 'DPRR', msg: 'DPRR > 45%', value: ind.dprr, threshold: T.dprrVeryHigh, points: 10 }); }
    else if (ind.dprr !== null && ind.dprr > T.dprrHigh) { raw += 5; rules.push({ var: 'DPRR', msg: 'DPRR > 30%', value: ind.dprr, threshold: T.dprrHigh, points: 5 }); }
    if (ind.niir !== null && ind.niir < T.niirLow) { raw += 3; rules.push({ var: 'NIIR', msg: 'NIIR < 10% (phụ thuộc thu nhập lãi)', value: ind.niir, threshold: T.niirLow, points: 3 }); }
    if (modelProb !== null && modelProb !== undefined) {
      if (modelProb >= 0.75) { raw += 20; rules.push({ var: 'Model', msg: 'Xác suất mô hình ≥ 0,75', value: modelProb, threshold: 0.75, points: 20 }); }
      else if (modelProb >= 0.5) { raw += 10; rules.push({ var: 'Model', msg: 'Xác suất mô hình ≥ 0,50', value: modelProb, threshold: 0.5, points: 10 }); }
    }
    return { raw, score100: Math.round(raw / BR.SEVERITY_RAW_MAX * 100), rules };
  };

  // Phân loại 4 nhóm (PRD 9.1) — ưu tiên từ trên xuống + dải trễ (9.5)
  BR.classify = function (ind, prevInd, prevGroup, modelProb) {
    const T = BR.THRESHOLDS;
    const sev = BR.severityScore(ind, prevInd ? prevInd.roa : null, modelProb);
    const s = sev.score100;
    let group, reasons = [];
    const carOk = ind.car !== null, nplOk = ind.npl !== null;
    const carLow = carOk && ind.car < T.riskCar, nplHigh = nplOk && ind.npl > T.riskNpl;

    if ((carLow && nplHigh) || (carOk && ind.car < T.carCritical) || s >= T.severityCritical) {
      group = 'critical';
    } else if (carLow || nplHigh || s >= T.severityHigh) {
      group = 'high';
    } else if ((carOk && ind.car >= T.riskCar && ind.car <= T.carWatchHigh) ||
      (nplOk && ind.npl >= T.nplWatchHigh && ind.npl <= T.riskNpl) ||
      (ind.roa !== null && ind.roa < 0) || s >= T.severityWatch) {
      group = 'watch';
    } else {
      group = 'stable';
    }

    // Dải trễ ±0,1 điểm %: nếu giá trị sát ngưỡng và có nhóm kỳ trước → giữ nhóm cũ (9.5)
    const db = T.hysteresisPp / 100;
    let hysteresisApplied = false;
    if (prevGroup && prevGroup !== group) {
      const nearBoundary = (carOk && Math.abs(ind.car - T.riskCar) <= db) ||
        (carOk && Math.abs(ind.car - T.carWatchHigh) <= db) ||
        (nplOk && Math.abs(ind.npl - T.riskNpl) <= db) ||
        (nplOk && Math.abs(ind.npl - T.nplWatchHigh) <= db);
      if (nearBoundary) { group = prevGroup; hysteresisApplied = true; }
    }

    // Danh sách quy tắc đã kích hoạt (AC-8.3-1: không có cảnh báo hộp đen)
    if (carLow) reasons.push({ rule: 'CAR < 8%', value: ind.car, threshold: T.riskCar });
    if (nplHigh) reasons.push({ rule: 'NPL > 3%', value: ind.npl, threshold: T.riskNpl });
    if (carOk && ind.car < T.carCritical) reasons.push({ rule: 'CAR < 6%', value: ind.car, threshold: T.carCritical });
    if (carOk && !carLow && ind.car <= T.carWatchHigh) reasons.push({ rule: 'CAR trong dải 8–9%', value: ind.car, threshold: T.carWatchHigh });
    if (nplOk && !nplHigh && ind.npl >= T.nplWatchHigh) reasons.push({ rule: 'NPL trong dải 2–3%', value: ind.npl, threshold: T.nplWatchHigh });
    if (ind.roa !== null && ind.roa < 0) reasons.push({ rule: 'ROA < 0', value: ind.roa, threshold: 0 });
    if (s >= T.severityWatch) reasons.push({ rule: 'Điểm nghiêm trọng ≥ ' + T.severityWatch, value: s, threshold: T.severityWatch });

    return { group, severity: sev, reasons, hysteresisApplied };
  };

  // Financial Health Score 0–100 (PRD 9.2) — percentile trong năm, trọng số chỉnh được
  BR.fhs = function (indicators, year, weights) {
    const w = Object.assign({}, BR.FHS_WEIGHTS_DEFAULT, weights || {});
    const inYear = indicators.filter(i => i.year === year);
    const pools = {};
    for (const k of ['car', 'npl', 'roa', 'cir', 'dprr', 'niir', 'size']) {
      pools[k] = inYear.map(i => i[k]).filter(Number.isFinite);
    }
    const comps = [];
    let wSum = 0, acc = 0;
    for (const k of Object.keys(w)) {
      const meta = BR.INDICATORS[k === 'size' ? 'size' : k];
      const dir = k === 'size' ? 1 : meta.dir;
      const pool = pools[k];
      if (!pool.length) continue;
      const target = inYear.find(i => false); // tính theo từng ngân hàng bên dưới
      comps.push({ key: k, weight: w[k], dir, pool });
      wSum += w[k];
    }
    // tính từng ngân hàng
    const scores = new Map();
    inYear.forEach(ind => {
      let a = 0, ws = 0;
      comps.forEach(c => {
        const v = ind[c.key];
        if (v === null || v === undefined || !Number.isFinite(v)) return; // null không tính vào trung bình
        const pr = BR.percentileRank(v, c.pool, c.dir);
        a += pr * c.weight; ws += c.weight;
      });
      scores.set(ind.bank_code, ws > 0 ? Math.round(a / ws) : null);
    });
    return { scores, wSum };
  };

  // Systemic Risk Index (PRD 9.3) [GIẢ ĐỊNH HỌC THUẬT]
  BR.sri = function (indicators, year) {
    const T = BR.THRESHOLDS;
    const inYear = indicators.filter(i => i.year === year);
    const assets = new Map(); // bank -> max(total_assets) trong năm (từ raw ta không có ở đây; dùng proxy qua size không được)
    // Caller truyền assetsByBank; ở đây nhận dạng qua trường mở rộng _assets
    let totalAsset = 0, badAsset = 0, riskCount = 0, count = 0;
    inYear.forEach(i => {
      const a = i._total_assets;
      if (a === null || a === undefined) return;
      totalAsset += a; count++;
      if (i.group === 'high' || i.group === 'critical') badAsset += a;
      if (i.risk_label === 1) riskCount++;
    });
    if (!count) return null;
    const medianNpl = BR.median(inYear.map(i => i.npl));
    const medianCar = BR.median(inYear.map(i => i.car));
    const nplGap = medianNpl === null ? 0 : clamp((medianNpl - T.riskNpl) / 0.05, 0, 1);
    const carGap = medianCar === null ? 0 : clamp((T.riskCar - medianCar) / 0.04, 0, 1);
    const value = 100 * (0.40 * (totalAsset ? badAsset / totalAsset : 0)
      + 0.30 * (riskCount / count)
      + 0.20 * nplGap
      + 0.10 * carGap);
    return {
      value: Math.round(value * 10) / 10,
      components: {
        assetShareBad: totalAsset ? badAsset / totalAsset : 0,
        riskShare: riskCount / count,
        nplGap, carGap, medianNpl, medianCar
      },
      nBanks: count,
      lowReliability: count < 5
    };
  };

  /* ---------------- Mô hình (PRD Mục 10) ---------------- */

  // Logistic Regression — hệ số công bố của báo cáo gốc (Bảng 4.3), dùng cho minh hoạ
  BR.logitProb = function (ind) {
    const c = BR.LOGIT_COEFS;
    if ([ind.size, ind.car, ind.roa, ind.niir, ind.npl, ind.dprr, ind.cir].some(v => v === null || !Number.isFinite(v))) return null;
    const z = c.intercept + c.SIZE * ind.size + c.CAR * ind.car + c.ROA * ind.roa +
      c.NIIR * ind.niir + c.NPL * ind.npl + c.DPRR * ind.dprr + c.CIR * ind.cir;
    return BR.sigmoid(z);
  };

  // Bộ duyệt cây XGBoost JSON (PRD 11.6 — phương án 1 ưu tiên cho MVP)
  BR.evalXgb = function (artifact, ind) {
    if (!artifact || !ind) return null;
    const feats = {};
    for (const f of artifact.input_schema) {
      const lower = f.toLowerCase();
      let v = ind[f];
      if (v === undefined) v = ind[lower];
      if (v === undefined && f === 'INF') v = ind.inflation;
      feats[f] = v;
    }
    if (Object.values(feats).some(v => v === null || v === undefined || !Number.isFinite(v))) return null;
    let sum = artifact.base_score || 0;
    for (const tree of artifact.trees) {
      let node = tree;
      while (typeof node === 'object' && node !== null) {
        const v = feats[node.s];
        node = v <= node.t ? node.l : node.r;
      }
      sum += node;
    }
    return BR.sigmoid(sum);
  };

  // FR-MODEL-03: kiểm chứng artefact bằng test_vectors (dung sai 1e-6)
  BR.verifyArtifact = function (artifact) {
    const results = [];
    let ok = true;
    for (const tv of (artifact.test_vectors || [])) {
      const p = BR.evalXgb(artifact, tv.input);
      const pass = p !== null && Math.abs(p - tv.expected) <= (tv.tol || 1e-6);
      if (!pass) ok = false;
      results.push({ input: tv.input, expected: tv.expected, got: p, pass });
    }
    return { ok, results };
  };

  // Ensemble — trung bình có trọng số, trọng số công khai + chỉnh được (PRD 10.1)
  BR.ensembleProb = function (logitP, xgbP, wLogit, wXgb) {
    if (logitP === null && xgbP === null) return null;
    if (logitP === null) return xgbP;
    if (xgbP === null) return logitP;
    const wl0 = wLogit !== undefined ? wLogit : 0.3;
    const wx0 = wXgb !== undefined ? wXgb : 0.7;
    const wl = wl0 / (wl0 + wx0), wx = wx0 / (wl0 + wx0);
    return wl * logitP + wx * xgbP;
  };

  /* ---------------- Dự báo (PRD Mục 8.6, FR-FCST-01) ---------------- */
  // OLS tuyến tính + dải dự đoán 80%; phương án thay thế: trung bình trượt 3 kỳ
  BR.forecastOls = function (years, values, horizon) {
    const pts = years.map((y, i) => [y, values[i]]).filter(p => p[1] !== null && Number.isFinite(p[1]));
    const n = pts.length;
    if (n < 5) return { error: 'Cần tối thiểu 5 năm dữ liệu liên tục. Hiện có ' + n + ' năm.', n };
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    let sxx = 0, sxy = 0, sse = 0, sst = 0;
    for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) * (xs[i] - mx); sxy += (xs[i] - mx) * (ys[i] - my); }
    const slope = sxx === 0 ? 0 : sxy / sxx, intercept = my - slope * mx;
    for (let i = 0; i < n; i++) {
      const fitted = intercept + slope * xs[i];
      sse += (ys[i] - fitted) * (ys[i] - fitted);
      sst += (ys[i] - my) * (ys[i] - my);
    }
    const se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
    const r2 = sst > 0 ? 1 - sse / sst : null;
    const lastYear = xs[n - 1], lastVal = ys[n - 1];
    const out = [];
    for (let h = 1; h <= horizon; h++) {
      const xh = lastYear + h;
      const yhat = intercept + slope * xh;
      const band = 1.2816 * se * Math.sqrt(1 + 1 / n + Math.pow(xh - mx, 2) / (sxx || 1));
      out.push({ year: xh, point: yhat, lo: yhat - band, hi: yhat + band, h });
    }
    return { method: 'ols', slope, intercept, se, r2, n, history: pts, forecast: out, lastYear, lastVal };
  };
  BR.forecastMa = function (years, values, horizon, window) {
    window = window || 3;
    const pts = years.map((y, i) => [y, values[i]]).filter(p => p[1] !== null && Number.isFinite(p[1]));
    const n = pts.length;
    if (n < Math.max(5, window + 2)) return { error: 'Cần tối thiểu ' + Math.max(5, window + 2) + ' năm dữ liệu cho trung bình trượt. Hiện có ' + n + ' năm.', n };
    // phần dư một bước của MA(window) trên lịch sử
    const residuals = [];
    for (let i = window; i < n; i++) {
      const ma = pts.slice(i - window, i).reduce((s, p) => s + p[1], 0) / window;
      residuals.push(pts[i][1] - ma);
    }
    const se = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
    const base = pts.slice(-window).reduce((s, p) => s + p[1], 0) / window;
    const lastYear = pts[n - 1][0];
    const out = [];
    for (let h = 1; h <= horizon; h++) {
      const band = 1.2816 * se * Math.sqrt(h); // dải mở rộng theo kỳ dự báo (AC-8.6-1)
      out.push({ year: lastYear + h, point: base, lo: base - band, hi: base + band, h });
    }
    return { method: 'ma', window, se, n, history: pts, forecast: out, lastYear, lastVal: pts[n - 1][1] };
  };
  // Chặn miền hợp lý (AC-8.6-2): NPL ≥ 0; CAR ≥ 0
  BR.clampForecast = function (fc, indicatorKey) {
    if (!fc || !fc.forecast) return fc;
    if (indicatorKey === 'npl' || indicatorKey === 'car') {
      fc.clamped = false;
      fc.forecast.forEach(f => {
        if (f.point < 0) { f.point = 0; f.lo = Math.max(0, f.lo); f.hi = Math.max(0, f.hi); fc.clamped = true; }
        if (f.lo < 0) f.lo = 0;
      });
    }
    return fc;
  };

  /* ---------------- Stress test (PRD Mục 8.5, FR-STRESS-01) ---------------- */
  // Toàn bộ hệ số truyền dẫn là [GIẢ ĐỊNH HỌC THUẬT – CẤU HÌNH ĐƯỢC], hiển thị công khai
  BR.STRESS_ASSUMPTIONS_DEFAULT = {
    lgd: 0.45,            // LGD giả định
    rwaExpansion: 1.10,   // hệ số nở RWA
    coefRate: 0.15,       // mỗi +1 điểm % lãi suất → +0,15 điểm % NPL
    coefFx: 0.10,         // mỗi +1% tỷ giá → +0,10 điểm % NPL
    coefGdp: 0.12,        // mỗi −1 điểm % GDP → +0,12 điểm % NPL
    coefInfl: 0.05,       // mỗi +1 điểm % lạm phát → +0,05 điểm % NPL
    cirRate: 0.30         // mỗi +1 điểm % lãi suất → CIR +0,3 điểm %
  };
  // Trả về chỉ tiêu căng thẳng cho 1 quan sát; rawRow cần gross_loans, regulatory_capital, risk_weighted_assets, total_operating_income
  BR.stressApply = function (ind, rawRow, avgAssets, params, assumptions) {
    const A = Object.assign({}, BR.STRESS_ASSUMPTIONS_DEFAULT, assumptions || {});
    const P = Object.assign({ dGdp: 0, dInfl: 0, dRate: 0, dNpl: 0, dCredit: 0, dFx: 0 }, params || {});
    const pp = x => x / 100; // điểm % → thập phân
    const macroAdd = Math.max(0, A.coefRate * P.dRate) + Math.max(0, A.coefFx * P.dFx) +
      Math.max(0, A.coefGdp * (-P.dGdp)) + Math.max(0, A.coefInfl * P.dInfl); // điểm %
    const dNplTotalPp = P.dNpl + macroAdd;
    const dNpl = pp(dNplTotalPp);
    const grossLoans = rawRow ? rawRow.gross_loans : null;
    const regCap = rawRow ? rawRow.regulatory_capital : null;
    const rwa = rawRow ? rawRow.risk_weighted_assets : null;
    const toi = rawRow ? rawRow.total_operating_income : null;

    const out = { npl: ind.npl + dNpl, _macroAddPp: macroAdd, _dNplPp: dNplTotalPp };
    let creditLoss = null;
    if (grossLoans !== null && grossLoans > 0) creditLoss = dNpl * grossLoans * A.lgd;
    out._creditLoss = creditLoss;

    if (rwa !== null && rwa > 0 && regCap !== null) {
      const rwaStress = rwa * (1 + Math.max(0, pp(P.dCredit))) * (P.dCredit !== 0 ? A.rwaExpansion : 1);
      out._rwaStress = rwaStress;
      out.car = Math.max(0, (regCap - (creditLoss || 0)) / rwaStress);
    } else out.car = ind.car;

    if (ind.roa !== null && avgAssets && avgAssets > 0) out.roa = ind.roa - (creditLoss || 0) / avgAssets;
    else out.roa = ind.roa;

    if (ind.dprr !== null && toi !== null && toi !== 0) out.dprr = ind.dprr + (creditLoss || 0) / toi;
    else out.dprr = ind.dprr;

    out.cir = (ind.cir !== null && P.dRate) ? ind.cir + A.cirRate * P.dRate / 100 : ind.cir;
    out.niir = ind.niir;
    out.size = ind.size;
    out.inf = ind.inflation;
    return out;
  };

  /* ---------------- Xuất CSV (SEC-16) ---------------- */
  BR.toCSV = function (matrix) {
    const esc = (cell) => {
      let s = cell === null || cell === undefined ? '' : String(cell);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // chống công thức độc hại
      if (/[",;\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    return '\uFEFF' + matrix.map(r => r.map(esc).join(',')).join('\r\n');
  };

  /* ---------------- Hash dữ liệu (M-05: dataset_version) ---------------- */
  BR.hashText = async function (text) {
    try {
      if (global.crypto && global.crypto.subtle) {
        const buf = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return 'sha256:' + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* rơi xuống hash dự phòng */ }
    // Hash dự phòng FNV-1a 64-bit (chỉ dùng khi crypto.subtle không khả dụng)
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (Math.imul(h2 ^ text.charCodeAt(i), 2246822519) >>> 0);
    }
    return 'fnv1a:' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  };

})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
