/* ============================================================
   BANKRISK Intelligence — Bộ dữ liệu DEMO 2014–2024
   Dựng lại theo cấu trúc báo cáo NCKH gốc: danh mục 23 NHTMCP
   (Phụ lục 1 của PDF). TẤT CẢ số liệu là [DỮ LIỆU DEMO] —
   không phải số liệu thật đầy đủ 11 năm × 23 ngân hàng.
   Ca "Nghiêm trọng" điển hình: NVB (NPL 18,29% 2022 → 30,34% 2023,
   ROA −4,78% & DPRR 85% năm 2023, NIIR −21,03% năm 2024).
   Sinh dữ liệu tất định (seed cố định) — tái lập được.
   Đơn vị: triệu VND (FR-DATA-01).
   ============================================================ */
(function (global) {
  'use strict';
  const DEMO = global.BRDEMO = {};

  // Danh mục 23 ngân hàng theo Phụ lục 1 của PDF nghiên cứu
  const BANKS = [
    ['ABB', 'NHTMCP An Bình', 'Upcom', 'private', 320000],
    ['ACB', 'NHTMCP Á Châu', 'HOSE', 'private', 700000],
    ['BAB', 'NHTMCP Bắc Á', 'HNX', 'private', 170000],
    ['BID', 'NHTMCP Đầu tư và Phát triển VN (BIDV)', 'HOSE', 'state', 2730000],
    ['BVB', 'NHTMCP Bản Việt', 'Upcom', 'private', 150000],
    ['CTG', 'NHTMCP Công Thương VN (VietinBank)', 'HOSE', 'state', 2240000],
    ['EIB', 'NHTMCP Xuất Nhập khẩu VN (Eximbank)', 'HOSE', 'private', 400000],
    ['HDB', 'NHTMCP Phát triển TP.HCM', 'HOSE', 'private', 690000],
    ['KLB', 'NHTMCP Kiên Long', 'Upcom', 'private', 130000],
    ['LPB', 'NHTMCP Lộc Phát VN', 'HOSE', 'private', 160000],
    ['MBB', 'NHTMCP Quân đội', 'HOSE', 'private', 900000],
    ['MSB', 'NHTMCP Hàng Hải VN', 'HOSE', 'private', 370000],
    ['NAB', 'NHTMCP Nam Á', 'HOSE', 'private', 260000],
    ['NVB', 'NHTMCP Quốc Dân (NCB)', 'HNX', 'private', 145000],
    ['OCB', 'NHTMCP Phương Đông', 'HOSE', 'private', 440000],
    ['PGB', 'NHTMCP Thịnh vượng và Phát triển', 'Upcom', 'private', 190000],
    ['SHB', 'NHTMCP Sài Gòn - Hà Nội', 'HOSE', 'private', 590000],
    ['STB', 'NHTMCP Sài Gòn Thương Tín', 'HOSE', 'private', 560000],
    ['TCB', 'NHTMCP Kỹ Thương VN (Techcombank)', 'HOSE', 'private', 740000],
    ['TPB', 'NHTMCP Tiên Phong', 'HOSE', 'private', 610000],
    ['VCB', 'NHTMCP Ngoại thương VN (Vietcombank)', 'HOSE', 'state', 1930000],
    ['VIB', 'NHTMCP Quốc tế Việt Nam', 'HOSE', 'private', 550000],
    ['VPB', 'NHTMCP Việt Nam Thịnh Vượng', 'HOSE', 'private', 870000]
  ];

  const YEARS = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
  // CPI trung bình năm — nguồn GSO (theo báo cáo gốc, Phụ lục 4)
  const CPI = { 2014: 4.09, 2015: 0.63, 2016: 2.66, 2017: 3.53, 2018: 3.54, 2019: 2.79, 2020: 3.23, 2021: 1.84, 2022: 3.15, 2023: 3.25, 2024: 3.63 };

  // Hồ sơ ngân hàng: [assets2024, carMid, nplMid, roaMid, cirMid, niirMid, dprrMid]
  const PROFILES = {
    ABB: [0.105, 0.014, 0.42, 0.22, 0.10], ACB: [0.110, 0.012, 0.44, 0.28, 0.06],
    BAB: [0.098, 0.018, 0.48, 0.20, 0.12], BID: [0.093, 0.010, 0.46, 0.30, 0.08],
    BVB: [0.084, 0.026, 0.50, 0.18, 0.14], CTG: [0.100, 0.011, 0.45, 0.29, 0.07],
    EIB: [0.108, 0.013, 0.46, 0.27, 0.09], HDB: [0.112, 0.012, 0.42, 0.26, 0.07],
    KLB: [0.090, 0.024, 0.52, 0.19, 0.13], LPB: [0.085, 0.025, 0.53, 0.18, 0.15],
    MBB: [0.112, 0.009, 0.42, 0.27, 0.06], MSB: [0.095, 0.020, 0.50, 0.21, 0.11],
    NAB: [0.097, 0.016, 0.47, 0.22, 0.10], NVB: [0.072, 0.020, 0.55, 0.16, 0.20],
    OCB: [0.106, 0.013, 0.45, 0.26, 0.08], PGB: [0.094, 0.017, 0.51, 0.20, 0.12],
    SHB: [0.096, 0.017, 0.49, 0.24, 0.10], STB: [0.099, 0.015, 0.47, 0.25, 0.09],
    TCB: [0.115, 0.008, 0.40, 0.30, 0.05], TPB: [0.108, 0.011, 0.43, 0.27, 0.07],
    VCB: [0.120, 0.007, 0.38, 0.32, 0.05], VIB: [0.110, 0.012, 0.44, 0.26, 0.07],
    VPB: [0.104, 0.014, 0.43, 0.25, 0.08]
  };

  // Chuỗi NVB theo đúng ca nghiêm trọng của PDF (0.2, 0.2b)
  const NVB_SERIES = {
    npl: { 2014: 0.045, 2015: 0.048, 2016: 0.052, 2017: 0.060, 2018: 0.075, 2019: 0.090, 2020: 0.120, 2021: 0.150, 2022: 0.1829, 2023: 0.3034, 2024: 0.2400 },
    car: { 2014: 0.094, 2015: 0.092, 2016: 0.091, 2017: 0.090, 2018: 0.092, 2019: 0.090, 2020: 0.088, 2021: 0.082, 2022: 0.075, 2023: 0.065, 2024: 0.072 },
    roa: { 2014: 0.005, 2015: 0.005, 2016: 0.004, 2017: 0.005, 2018: 0.004, 2019: 0.004, 2020: 0.003, 2021: 0.002, 2022: -0.008, 2023: -0.0478, 2024: -0.0150 },
    dprr: { 2014: 0.16, 2015: 0.17, 2016: 0.18, 2017: 0.20, 2018: 0.22, 2019: 0.25, 2020: 0.30, 2021: 0.38, 2022: 0.45, 2023: 0.85, 2024: 0.55 },
    niir: { 2014: 0.20, 2015: 0.21, 2016: 0.19, 2017: 0.20, 2018: 0.21, 2019: 0.20, 2020: 0.18, 2021: 0.15, 2022: 0.10, 2023: 0.05, 2024: -0.2103 },
    cir: { 2014: 0.48, 2015: 0.49, 2016: 0.50, 2017: 0.50, 2018: 0.52, 2019: 0.53, 2020: 0.58, 2021: 0.62, 2022: 0.66, 2023: 0.75, 2024: 0.68 }
  };
  // BVB / LPB / KLB: nhóm "Theo dõi" — CAR trong dải 8–9% hoặc NPL 2–3%
  const WATCH_OVERRIDES = {
    BVB: { car: [0.086, 0.084, 0.083, 0.085, 0.083, 0.082, 0.084, 0.081, 0.083, 0.082, 0.084], npl: [0.024, 0.025, 0.023, 0.026, 0.025, 0.024, 0.026, 0.027, 0.025, 0.027, 0.026] },
    LPB: { car: [0.088, 0.086, 0.087, 0.084, 0.085, 0.083, 0.086, 0.084, 0.085, 0.083, 0.086] },
    KLB: { npl: [0.021, 0.022, 0.024, 0.023, 0.025, 0.024, 0.026, 0.025, 0.027, 0.026, 0.025] }
  };

  // PRNG tất định (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  DEMO.banks = BANKS.map(b => ({ bank_code: b[0], bank_name: b[1], listing_code: b[2], ownership_group: b[3] }));

  DEMO.years = YEARS.slice();
  DEMO.cpi = Object.assign({}, CPI);
  DEMO.nDeclaredInSource = 300;   // số quan sát in trong mọi bảng kết quả của PDF (PRD 0.2)
  DEMO.nComputedFromBankList = BANKS.length * YEARS.length; // 253

  DEMO.rows = function () {
    const rows = [];
    for (const [code, name, listing, ownership, assets2024] of BANKS) {
      const prof = PROFILES[code];
      const r = rng(seedOf(code));
      let prevTa = null;
      for (let yi = 0; yi < YEARS.length; yi++) {
        const year = YEARS[yi];
        const t = yi / (YEARS.length - 1); // 0..1
        const noise = () => (r() - 0.5) * 2; // −1..1

        // Tổng tài sản: tăng trưởng kép lùi từ 2024, dao động nhẹ
        const cagr = 0.095 + (r() - 0.5) * 0.02;
        const totalAssets = Math.round(assets2024 / Math.pow(1 + cagr, YEARS.length - 1 - yi) * (1 + noise() * 0.01) / 1000) * 1000;
        const growth = prevTa ? (totalAssets / prevTa - 1) : 0.12;
        prevTa = totalAssets;

        // Chỉ tiêu mục tiêu
        let car = prof[0] + noise() * 0.006;
        let npl = Math.max(0.004, prof[1] + noise() * 0.003);
        let roa = prof[2] * (0.85 + 0.3 * r()) * 0.2; // ~0.8–1.6%/2 ... hiệu chỉnh bên dưới
        roa = Math.max(0.003, prof[2] * (0.16 + 0.06 * Math.sin(t * 3 + r() * 2)));
        let cir = prof[3] + noise() * 0.02;
        let niir = Math.max(0.05, prof[4] + noise() * 0.03);
        let dprr = Math.max(0.02, npl * (9 + r() * 4) * (npl > 0.02 ? 1.1 : 1));

        if (code === 'NVB') {
          car = NVB_SERIES.car[year]; npl = NVB_SERIES.npl[year]; roa = NVB_SERIES.roa[year];
          dprr = NVB_SERIES.dprr[year]; niir = NVB_SERIES.niir[year]; cir = NVB_SERIES.cir[year];
        }
        const ov = WATCH_OVERRIDES[code];
        if (ov) {
          if (ov.car) car = ov.car[yi];
          if (ov.npl) npl = ov.npl[yi];
        }

        // Cấu trúc bảng cân đối / KQKD nhất quán nội bộ (triệu VND)
        const grossLoans = Math.round(totalAssets * (0.55 + r() * 0.08) / 1000) * 1000;
        const rwa = Math.round(totalAssets * (0.68 + r() * 0.06) / 1000) * 1000;
        const regCap = Math.round(car * rwa / 1000) * 1000;
        const totalDeposits = Math.round(grossLoans / (0.72 + r() * 0.1) / 1000) * 1000;
        const earningAssets = Math.round(totalAssets * (0.82 + r() * 0.06) / 1000) * 1000;
        const equity = Math.round(totalAssets * (0.055 + r() * 0.02) / 1000) * 1000;

        const toi = Math.round(totalAssets * (0.038 + r() * 0.008) / 1000) * 1000;
        const nii = Math.round(toi * (1 - niir) / 1000) * 1000;
        const provisions = Math.round(dprr * toi / 1000) * 1000;
        const opex = Math.round(cir * toi / 1000) * 1000;
        const pat = Math.round(roa * ((totalAssets + (prevTa || totalAssets)) / 2) / 1000) * 1000;

        const g3 = Math.round(grossLoans * npl * (0.55 + r() * 0.1) / 1000) * 1000;
        const g4 = Math.round(grossLoans * npl * (0.20 + r() * 0.05) / 1000) * 1000;
        const g5 = Math.max(0, grossLoans * npl - g3 - g4);

        rows.push({
          bank_code: code, bank_name: name, year,
          total_assets: totalAssets, risk_weighted_assets: rwa, regulatory_capital: regCap,
          profit_after_tax: pat, total_operating_income: toi, net_interest_income: nii,
          gross_loans: grossLoans, group_3_loans: g3, group_4_loans: g4, group_5_loans: Math.round(g5),
          credit_risk_provision_expense: provisions, operating_expenses: opex,
          inflation: CPI[year],
          car_reported: null, total_deposits: totalDeposits, earning_assets: earningAssets,
          equity, ownership_group: ownership,
          source_url: yi % 11 === 3 && r() < 0.5 ? null : 'https://demo.bankrisk.vn/bctc/' + code + '_' + year + '.pdf',
          report_date: (year + 1) + '-03-31', audited_status: 'audited', notes: '[DỮ LIỆU DEMO] dựng lại theo cấu trúc báo cáo NCKH gốc'
        });
      }
    }
    return rows;
  };
})(typeof self !== 'undefined' ? self : this);
