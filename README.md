# BANKRISK Intelligence

> **Nền tảng Cảnh báo Sớm Rủi ro Kiệt quệ Tài chính Ngân hàng Thương mại Việt Nam (2014–2024)**  
> *Sản phẩm học thuật phục vụ nghiên cứu và đào tạo — Không phải khuyến nghị đầu tư hay quyết định thanh tra giám sát chính thức.*

---

## 1. Giới thiệu tổng quan

**BANKRISK Intelligence** là hệ thống bảng điều khiển tương tác và cảnh báo sớm tài chính được xây dựng bám sát theo **Tài liệu Yêu cầu Sản phẩm (PRD v1.1)**. Ứng dụng triển khai toàn bộ các mô hình phân tích kinh tế lượng và học máy từ đề tài nghiên cứu về rủi ro kiệt quệ tài chính của các ngân hàng thương mại Việt Nam giai đoạn 2014–2024.

### Điểm nổi bật về kiến trúc
- **Chế độ Phân tích Riêng tư (Browser-First / Zero-Cloud Data Leak)**: Mọi thao tác đọc file CSV/XLSX, kiểm tra 14 quy tắc dữ liệu, làm sạch, tính toán 8 chỉ tiêu tài chính, chạy mô hình chấm điểm (Logit, XGBoost tree inference, Ensemble), kiểm định căng thẳng (Stress Testing), dự báo chuỗi thời gian, và xuất báo cáo (In/PDF/Word) đều diễn ra **100% trong bộ nhớ trình duyệt** (sử dụng Web Worker khi khả dụng). Không có bất kỳ dòng dữ liệu nhạy cảm nào được tải lên máy chủ ngoài sự cho phép rõ ràng của người dùng.
- **Hệ thống Huy hiệu Truy vết Dữ liệu (Data Provenance Badges)**:
  - **[A] Kết quả nghiên cứu gốc**: Số liệu nguyên văn từ báo cáo nghiên cứu gốc (Bảng 4.3 Logit, Bảng 4.4 so sánh mô hình, phát hiện SGMM).
  - **[B] Mô hình nội suy demo**: Mô hình XGBoost demo v1.0.0 chạy trực tiếp trong trình duyệt.
  - **[C] Dữ liệu tải lên**: Dữ liệu do người dùng tải lên và tính toán theo thời gian thực.
  - **[D] Bộ dữ liệu mẫu**: 23 ngân hàng thương mại Việt Nam giai đoạn 2014–2024 (253 quan sát), bao gồm trường hợp kiệt quệ thực tế của NVB (NCB).
- **Minh bạch Học thuật Tuyệt đối**:
  - Không che giấu chênh lệch số lượng mẫu giữa báo cáo gốc ($N = 300$) và dữ liệu thực tế ($23 \text{ ngân hàng} \times 11 \text{ năm} = 253$).
  - Nhãn `RISK = 1` được định nghĩa chính xác theo quy tắc nghiên cứu: $\text{NPL} > 3\% \lor \text{CAR} < 8\%$, đi kèm cảnh báo pháp lý và phân biệt rõ với trạng thái cảnh báo sớm.
  - Mỗi chỉ tiêu đều có panel minh bạch 5 phần: Công thức, Dữ liệu đầu vào, Các bước tính toán, Kết quả, và Nguồn gốc dữ liệu.

---

## 2. Các phân hệ chức năng (Dashboard Modules)

1. **Tổng quan Hệ thống (System Dashboard — PRD 8.1)**:
   - Thẻ chỉ số rủi ro hệ thống (SRI), phân bổ 4 nhóm rủi ro (Bình thường, Theo dõi, Rủi ro cao, Căng thẳng).
   - Biểu đồ xu hướng trung vị CAR, NPL, ROA với dải phân vị 25%–75% và đường ngưỡng đỏ 3% NPL.
   - Histogram phân bổ chỉ tiêu toàn hệ thống và Top 5 cảnh báo nghiêm trọng nhất.

2. **Hồ sơ Ngân hàng (Bank Profile — PRD 8.2)**:
   - Tìm kiếm nhanh, đồng bộ URL `?bank={code}&year={year}`.
   - Thẻ điểm sức khoẻ tài chính (Financial Health Score 0–100) với modal điều chỉnh trọng số.
   - Lưới 6 biểu đồ thu nhỏ (Small Multiples) đa kỳ 2014–2024.
   - Biểu đồ so sánh vị thế với nhóm đồng cấp (Peer Group) và phân tích đóng góp yếu tố Logit XAI.

3. **Trung tâm Cảnh báo Sớm (Early Warning Center — PRD 8.3)**:
   - Bảng xếp hạng mức độ nghiêm trọng (Severity Score 0–100) kèm mũi tên xu hướng 3 kỳ.
   - Modal giải trình chi tiết từng quy tắc bị kích hoạt, loại bỏ hoàn toàn hiện tượng cảnh báo "hộp đen".
   - Xuất dữ liệu CSV bảo toàn bộ lọc, tự động chống tấn công CSV Formula Injection (`'=`, `'+`, `'-`, `'@`).

4. **Phòng Thí nghiệm Mô hình (Model Comparison Lab — PRD 8.4)**:
   - Banner cảnh báo mẫu nhỏ và banner chênh lệch cỡ mẫu $N=300$ vs $253$.
   - Bảng 4.4 so sánh các mô hình: Z-score tĩnh, Logistic Regression, XGBoost, XGBoost + SMOTE (Huy hiệu [A]).
   - Bảng tham số Logit Bảng 4.3, ghi chú SGMM kiểm soát nội sinh, và bảng xếp hạng Z-score.
   - Bộ duyệt cây XGBoost JSON thuần JavaScript (`BRCORE.evalXgb`) kiểm chứng khớp test vectors với dung sai $10^{-6}$.
   - Biểu đồ tầm quan trọng đặc trưng (Feature Importance Gain) và banner thông báo lộ trình SHAP.

5. **Kiểm tra Sức chịu đựng (Stress Testing — PRD 8.5)**:
   - 6 thanh trượt cú sốc vĩ mô (Tăng trưởng GDP, Lạm phát, Lãi suất, Tỷ giá, Tín dụng, Tỷ lệ NPL nền) cùng các kịch bản mẫu (Cơ sở, Căng thẳng vừa, Suy thoái nghiêm trọng).
   - Cơ chế truyền dẫn tuyến tính minh bạch với các hệ số cấu hình công khai.
   - Bảng so sánh Trước vs Sau căng thẳng, danh sách ngân hàng chuyển nhóm xấu, và biểu đồ so sánh 3 kịch bản.

6. **Dự báo Chuỗi Thời gian (Forecasting Engine — PRD 8.6)**:
   - Hai phương pháp: Hồi quy xu hướng tuyến tính (OLS) và Trung bình trượt (MA-3) với đường dự báo nét đứt 1–3 năm.
   - Dải dự đoán tin cậy mở rộng 80% (Expanding Prediction Interval).
   - Kiểm tra điều kiện tối thiểu 5 năm quan sát liên tục và chặn miền giá trị phi âm ($\text{NPL} \ge 0, \text{CAR} \ge 0$).

7. **Bản đồ Vị thế Ngân hàng (System Map — PRD 8.7)**:
   - Đồ thị phân tán 2 chiều: Điểm Ổn định Tài chính (Trục X) vs Xác suất Kiệt quệ (Trục Y).
   - Bán kính bong bóng tỉ lệ thuận với $\sqrt{\text{Tổng tài sản}}$.
   - Hỗ trợ trợ năng với viền ký hiệu riêng biệt cho từng nhóm rủi ro, nhấp chuột để điều hướng thẳng đến Hồ sơ Ngân hàng.

8. **Khoang Giám sát Hệ thống (Supervisory Cockpit — PRD 8.8)**:
   - Watermark bán trong suốt cố định: *"MÔ PHỎNG PHỤC VỤ ĐÀO TẠO — KHÔNG DÙNG CHO QUYẾT ĐỊNH GIÁM SÁT THỰC TẾ"*.
   - Chỉ số SRI đa kỳ, cơ cấu tài sản theo nhóm rủi ro (đảm bảo tổng tỷ trọng $100\% \pm 0.1\%$).
   - Biểu đồ tần suất kích hoạt quy tắc rủi ro và dòng thời gian chuyển nhóm theo năm.

9. **Dữ liệu & Kiểm tra Hợp lệ (Data & Validation Screen — PRD 7)**:
   - Kéo-thả tệp CSV và Excel (`.xlsx`), tải về file mẫu chuẩn (Excel 3 sheet kèm Metadata và CSV UTF-8 BOM).
   - Kiểm tra 14 quy tắc dữ liệu (V-01 đến V-14), chấm điểm Chất lượng Dữ liệu (DQ Score 0–100).
   - Lọc và nhảy trực tiếp đến ô có cảnh báo hoặc lỗi chặn.
   - Bảng xem trước cho phép **chỉnh sửa trực tiếp trên ô (In-place Cell Editing)** với tính năng tự động chạy lại phân tích tức thời.

10. **Xuất Báo cáo Bản in & Văn bản (Printable Reports)**:
    - Tạo báo cáo tổng hợp in ấn / PDF (`window.print()`) và xuất file Word (`.doc`) với bảng mã UTF-8.
    - Nhúng đầy đủ phiên bản ứng dụng, phiên bản mô hình, mã băm tập dữ liệu (SHA-256) và điều khoản miễn trừ trách nhiệm bắt buộc (SEC-13).

---

## 3. Cấu trúc Thư mục

```text
bankrisk-intelligence/
├── index.html                   # Điểm khởi đầu của ứng dụng web
├── README.md                    # Tài liệu hướng dẫn này
├── assets/
│   └── css/
│       └── styles.css           # Toàn bộ CSS hệ thống (theme, layout, badges, responsive, print)
├── vendor/
│   ├── echarts.min.js           # Apache ECharts 5.5 (vẽ biểu đồ)
│   └── xlsx.full.min.js         # SheetJS 0.20 (đọc/ghi file Excel & CSV)
├── js/
│   ├── core.js                  # Lõi toán học: công thức, validation, DQ, Logit, XGB, OLS, Stress
│   ├── demo-data.js             # Bộ dữ liệu mẫu 23 ngân hàng × 11 năm (2014–2024, 253 dòng)
│   ├── model-artifact.js        # Artefact 12 cây XGBoost demo, model card, test vectors
│   ├── pipeline.js              # Điều phối phân tích nền & xử lý trùng lặp
│   ├── worker.js                # Web Worker chạy độc lập cho phân tích dữ liệu lớn
│   ├── ui.js                    # Thư viện UI tái sử dụng: Card, Metric, Table, Badges, Chart, Modal
│   ├── app.js                   # Điều phối ứng dụng, Router, State quản lý dữ liệu, Xuất báo cáo
│   └── views/
│       ├── overview.js          # 8.1 Phân hệ Tổng quan Hệ thống
│       ├── bank.js              # 8.2 Phân hệ Hồ sơ Ngân hàng & XAI
│       ├── alerts.js            # 8.3 Phân hệ Trung tâm Cảnh báo Sớm
│       ├── modellab.js          # 8.4 Phân hệ So sánh Mô hình & Cây XGBoost
│       ├── stress.js            # 8.5 Phân hệ Stress Test vĩ mô
│       ├── forecast.js          # 8.6 Phân hệ Dự báo Chuỗi Thời gian
│       ├── map.js               # 8.7 Phân hệ Bản đồ Hệ thống Ngân hàng
│       ├── cockpit.js           # 8.8 Phân hệ Khoang Giám sát
│       └── data.js              # Quản lý Dữ liệu, Kiểm tra Hợp lệ & Sửa ô trực tiếp
├── tests/
│   └── engine.test.js           # Bộ 87 bài kiểm thử tự động (Unit Tests) không phụ thuộc framework
└── cloudflare/
    ├── wrangler.toml            # Cấu hình triển khai Cloudflare Workers / Static Assets
    ├── worker.js                # Worker phục vụ file tĩnh & API lưu trữ tuỳ chọn
    └── migrations/
        └── 0001_init.sql        # Schema D1 Database cho lưu trữ bộ dữ liệu (Opt-in)
```

---

## 4. Hướng dẫn Khởi chạy & Sử dụng

### 4.1. Mở trực tiếp trong trình duyệt (Không cần cài đặt)
Do toàn bộ hệ thống được thiết kế theo kiến trúc Browser-First không phụ thuộc backend:
- Mở trực tiếp file `index.html` bằng trình duyệt hiện đại (Chrome, Edge, Firefox, Safari).
- Nếu trình duyệt chặn Web Worker trên giao thức `file://`, ứng dụng sẽ tự động chuyển đổi mượt mà sang chế độ xử lý trên luồng chính (Main-thread Fallback) mà không gây gián đoạn trải nghiệm người dùng.

### 4.2. Chạy với Local Web Server (Khuyên dùng)
```bash
# Bằng Node.js npx serve:
cd bankrisk-intelligence
npx serve .

# Hoặc bằng Python 3:
python -m http.server 8080

# Truy cập trên trình duyệt: http://localhost:8080 hoặc http://localhost:3000
```

### 4.3. Chạy Kiểm thử Tự động (Unit Tests)
Bộ kiểm thử gồm **87 kiểm tra tự động** bao quát:
- Tính chuẩn xác của các hàm thống kê (Sigmoid, Median, Quantile, Mean, SD, PercentileRank).
- Bộ phân tích số đa định dạng (dấu chấm phẩy kiểu Việt Nam và quốc tế).
- Kiểm tra hợp lệ 14 quy tắc V-01 đến V-14 và điểm DQ.
- Công thức 8 chỉ tiêu tài chính và các quy tắc biên của nhãn `RISK` ($3.00\% \to 0$, $3.01\% \to 1$, $8.00\% \to 0$, $7.99\% \to 1$).
- Khớp số kiểm nghiệm XGBoost với 4 test vectors chuẩn hoá (dung sai $< 10^{-6}$).
- Kiểm định truyền dẫn Stress Test và an toàn chống Formula Injection CSV.

Chạy lệnh:
```bash
node tests/engine.test.js
```
Kết quả kỳ vọng:
```text
Total: 87  Pass: 87  Fail: 0
ALL TESTS PASSED ✓
```

### 4.4. Triển khai lên Cloudflare Pages / Workers
Dự án được cấu hình sẵn sàng cho Cloudflare Workers Static Assets:
```bash
cd bankrisk-intelligence/cloudflare
npx wrangler deploy
```

---

## 5. Tuyên bố Miễn trừ Trách nhiệm & Giới hạn Pháp lý (SEC-13 / PRD 0.3)

1. **Bản chất Học thuật**: Hệ thống này là sản phẩm học thuật hỗ trợ ra quyết định và nghiên cứu, được xây dựng dựa trên dữ liệu báo cáo tài chính công khai của 23 ngân hàng thương mại Việt Nam giai đoạn 2014–2024.
2. **Quy tắc Gán nhãn RISK**: Nhãn `RISK = 1` trong toàn bộ hệ thống **chỉ là quy tắc gán nhãn dữ liệu nghiên cứu** định lượng ($\text{NPL} > 3\% \lor \text{CAR} < 8\%$), **hoàn toàn không phải** kết luận pháp lý, quyết định thanh tra, xếp hạng tín nhiệm hay kết luận kiệt quệ tài chính chính thức từ Ngân hàng Nhà nước Việt Nam hoặc bất kỳ cơ quan quản lý nào.
3. **Mô hình Demo**: Mô hình XGBoost v1.0.0 trong phiên bản này là mô hình minh hoạ với các cây quyết định được hiệu chuẩn phục vụ thử nghiệm trình duyệt; bảng kết quả Bảng 4.4 và Bảng 4.3 giữ nguyên văn từ báo cáo gốc với huy hiệu **[A]**.
4. **Bảo mật & Quyền riêng tư**: Mặc định, mọi dữ liệu người dùng tải lên chỉ tồn tại trong phiên làm việc hiện tại của trình duyệt và biến mất khi đóng tab, không bao giờ được gửi về máy chủ.
