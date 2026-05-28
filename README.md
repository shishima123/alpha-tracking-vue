# Binance Alpha Tracking

Ứng dụng web Vue 3 quản lý tracking Binance Alpha:
- Lưu lịch sử phí trade & số tiền nhận được từ alpha của từng tài khoản
- Tự động tính điểm alpha từ volume
- Tính ngày hồi điểm (reset sau 15 ngày) và cảnh báo đủ điểm húp airdrop
- Dashboard tổng quan lợi nhuận theo tháng (USD & VND)
- Dữ liệu lưu trên **Google Sheets** — không cần backend server riêng
- Bảo vệ bằng **passphrase + HMAC signing** (không ai khác ghi dữ liệu được)

## Kiến trúc

```
Frontend Vue 3 (static)  ──fetch (HMAC-signed)──>  Google Apps Script  ──>  Google Sheet
```

Apps Script chạy dưới Google account của bạn, có sẵn quyền với Sheet — không cần Service Account, không cần OAuth, không cần Node.js server.

## Tech stack

- **Frontend**: Vue 3 + Vite + Pinia + Vue Router + TailwindCSS + Chart.js
- **Backend**: Google Apps Script Web App (1 file `Code.gs`)
- **Storage**: Google Sheets
- **Auth**: HMAC-SHA256 + Web Crypto API + IndexedDB (non-extractable CryptoKey)

## Cấu trúc thư mục

```
Alpha tracking/
├── apps-script/
│   └── Code.gs           # Toàn bộ logic backend - paste vào Apps Script
├── src/                  # Vue 3 SPA
│   ├── App.vue
│   ├── router/
│   ├── stores/           # Pinia
│   ├── services/api.js   # Client gọi Apps Script + HMAC signing
│   ├── components/       # StatCard, ProfitChart
│   └── views/            # Login, Dashboard, Fees, Alpha, Points
├── .env.example          # VITE_APPS_SCRIPT_URL
├── index.html
└── package.json
```

## Setup

### Bước 1: Paste code vào Apps Script

1. Mở Google Sheet của bạn (sheet để lưu dữ liệu).
2. Menu **Extensions → Apps Script** → mở editor.
3. Xóa code mặc định (`function myFunction() {}`).
4. Mở file `apps-script/Code.gs` trong dự án này → **copy toàn bộ** → paste vào editor.
5. Đặt tên project (vd `Alpha Tracking API`) → **Save** (Ctrl+S).

### Bước 2: Cấu hình APP_SECRET (passphrase)

App yêu cầu passphrase để chống người lạ ghi dữ liệu — xem section [Bảo mật](#bảo-mật).

1. Trong Apps Script editor, vào **⚙️ Project Settings** (sidebar trái).
2. Cuộn xuống **Script Properties** → **Add script property**.
3. Key: `APP_SECRET`, Value: chuỗi ngẫu nhiên bất kỳ (vd: `MyStrongPass_2026!`). **Đây cũng chính là passphrase bạn sẽ nhập khi login app.**
4. **Save script properties**.

### Bước 3: Deploy Web App

1. **Deploy → New deployment**.
2. **Select type** (bánh răng) → **Web app**
3. **Description**: `Alpha Tracking API v1`
4. **Execute as**: `Me (email@gmail.com)`
5. **Who has access**: `Anyone` *(URL public nhưng được bảo vệ bằng HMAC + APP_SECRET)*
6. **Deploy** → cấp quyền (Authorize access → chọn account → Advanced → Go to ... → Allow).
7. Copy **Web app URL** (dạng `https://script.google.com/macros/s/AKfycb.../exec`).

### Bước 4: Test Apps Script

Mở URL vừa copy trong browser. Bạn sẽ thấy:

```json
{"ok":false,"error":"unauthorized"}
```

**Đây là dấu hiệu tốt** — server đang chạy và đúng là yêu cầu auth. Nếu thấy lỗi khác (vd `"Server chưa cấu hình APP_SECRET"`), quay lại Bước 2.

### Bước 5: Cấu hình & chạy frontend

```powershell
copy .env.example .env
```

Sửa file `.env`, dán URL vừa copy:

```env
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycb.../exec
```

Cài dependencies và chạy:

```powershell
npm install
npm run dev
```

Mở http://127.0.0.1:5300 → app sẽ chuyển sang màn **login** → nhập passphrase (chính là `APP_SECRET` đã set ở Bước 2) → vào dashboard.

Lần đầu truy cập sẽ tự tạo 3 sheet trong Google Sheet:
- `Accounts` — danh sách tài khoản (preset sẵn 6 account mẫu)
- `Fees` — lịch sử phí trade
- `AlphaProjects` — dự án Alpha + reward

## Sử dụng

### Tab Phí Trade
Nhập ngày → nhập phí + điểm cho từng tài khoản → Lưu. Hỗ trợ xem lịch sử, filter, xóa.

### Tab Dự án Alpha
Thêm dự án mới (tên, ngày, điểm yêu cầu 15/30, loại TGE/Phase/FCFS/...) + số $ nhận được từ từng tài khoản. Bảng tổng hợp tự cộng tổng reward.

### Tab Điểm Alpha
- Máy tính volume → điểm
- Điểm còn lại của từng account (đã loại các đợt > 15 ngày)
- Lịch hồi điểm chi tiết
- Cảnh báo "đủ điểm húp airdrop"

### Tab Dashboard
Tổng thu nhập, phí, lợi nhuận, quy đổi VND, biểu đồ theo tháng, bảng chi tiết.

### Đăng xuất
Bấm nút `⎋` góc phải header → IndexedDB key bị xóa, redirect về login.

## Logic điểm Alpha

| Điểm | Volume (USD) |
|------|-------------|
| 1    | 2           |
| 2    | 4           |
| 3    | 8           |
| ...  | ...         |
| 14   | 16,384      |
| 15   | 32,768      |
| 16   | 65,536      |

Volume = `2^điểm`. Mỗi đợt trade phát sinh điểm sẽ reset sau **15 ngày**.

## Build production (deploy static)

```powershell
npm run build
```

Folder `dist/` chứa file tĩnh — có thể deploy lên:
- **Vercel / Netlify / Cloudflare Pages** (drag & drop folder dist)
- **GitHub Pages**
- Hoặc mở trực tiếp `dist/index.html`

Nhớ set `VITE_APPS_SCRIPT_URL` trong env của hosting trước khi build.

## Cập nhật Apps Script

Mỗi khi sửa `Code.gs`, vào Apps Script editor:
- **Deploy → Manage deployments** → chọn deployment cũ → bấm pencil ✏️
- **Version**: `New version`
- **Deploy**

URL Web App **không đổi** (đây là điểm khác `New deployment`).

## Bảo mật

App có 2 lớp bảo vệ:

### Lớp 1: URL Web App là dạng "API key" — giữ private
- `.env` đã gitignore — không commit lên git public.
- Nếu deploy frontend lên hosting public, URL sẽ lộ trong network tab → vẫn ok nhờ lớp 2.

### Lớp 2: HMAC-SHA256 signing + APP_SECRET

Mọi request từ frontend đến Apps Script đều được sign bằng HMAC-SHA256:

```
body = {
  data:      JSON({resource, action, payload}),
  timestamp: Date.now(),
  nonce:     <random>,
  signature: base64(HMAC-SHA256(passphrase, data + '|' + timestamp + '|' + nonce)),
}
```

- **Passphrase không bao giờ gửi nguyên trên network** — chỉ gửi signature của message.
- **Chống replay**: timestamp lệch > 60s → server reject.
- **Chống tamper**: sửa bất kỳ field nào → signature break → reject.

Trên client, passphrase được import thành `CryptoKey` **non-extractable** (Web Crypto API) và lưu vào IndexedDB. Attacker mở DevTools → Application → IndexedDB chỉ thấy 1 object opaque, không thể `subtle.exportKey()` ra giá trị gốc để dùng ở chỗ khác.

### Đổi passphrase
1. Apps Script → **Project Settings → Script Properties** → sửa `APP_SECRET` thành giá trị mới.
2. **Deploy → Manage deployments → ✏️ → New version → Deploy**.
3. Trên browser: bấm `⎋` (Đăng xuất) → nhập passphrase mới.

### Nếu lộ URL + APP_SECRET cho người khác
1. Vào Apps Script → **Deploy → Manage deployments** → **Archive** deployment cũ.
2. Tạo deployment mới (URL mới) + đổi `APP_SECRET`.
3. Cập nhật `.env` với URL mới + login lại.

### Giới hạn
- Attacker có quyền chạy JS persistent trên trang (XSS, malicious browser extension) vẫn có thể gọi `subtle.sign()` với CryptoKey trong session đó. Đây là giới hạn cơ bản của bất kỳ scheme client-side nào.
- Đồng hồ máy cần chính xác (lệch > 60s sẽ bị server reject — Windows tự sync nên thường ok).

## License

Personal use.
