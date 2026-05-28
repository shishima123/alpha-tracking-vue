# Binance Alpha Tracking

Ứng dụng web Vue 3 quản lý tracking Binance Alpha:
- Lưu lịch sử phí trade & số tiền nhận được từ alpha của từng tài khoản
- Tự động tính điểm alpha từ volume
- Tính ngày hồi điểm (reset sau 15 ngày) và cảnh báo đủ điểm húp airdrop
- Dashboard tổng quan lợi nhuận theo tháng (USD & VND)
- Dữ liệu lưu trên **Google Sheets** — không cần backend server riêng

## Kiến trúc

```
Frontend Vue 3 (static)  ──fetch──>  Google Apps Script Web App  ──>  Google Sheet
```

Apps Script chạy dưới Google account của bạn, có sẵn quyền với Sheet — không cần Service Account, không cần OAuth, không cần Node.js server.

## Tech stack

- **Frontend**: Vue 3 + Vite + Pinia + Vue Router + TailwindCSS + Chart.js
- **Backend**: Google Apps Script Web App (1 file `Code.gs`)
- **Storage**: Google Sheets

## Cấu trúc thư mục

```
Alpha tracking/
├── apps-script/
│   └── Code.gs              # Toàn bộ logic backend - paste vào Apps Script
├── frontend/                # Vue 3 SPA
│   ├── .env.example         # VITE_APPS_SCRIPT_URL
│   ├── src/
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── stores/
│   │   ├── services/api.js  # Gọi Apps Script qua fetch
│   │   ├── components/      # StatCard, ProfitChart
│   │   └── views/           # Dashboard, Fees, Alpha, Points
│   └── package.json
├── backend/                 # (Cũ - Node.js Express, đã bỏ. Có thể xóa)
└── README.md
```

## Setup

### Bước 1: Deploy Google Apps Script Web App

1. Mở Google Sheet của bạn (sheet `Bản sao của Binance Alpha Tracking`).
2. Menu **Extensions → Apps Script** → mở editor.
3. Xóa toàn bộ code mặc định (`function myFunction() {}`).
4. Mở file `apps-script/Code.gs` trong dự án này → **copy toàn bộ** → paste vào editor.
5. Đặt tên project (vd `Alpha Tracking API`) → **Save** (Ctrl+S).
6. Bấm **Deploy → New deployment**.
7. Trong dialog:
   - **Select type** (bánh răng) → **Web app**
   - **Description**: `Alpha Tracking API v1`
   - **Execute as**: `Me (email@gmail.com)`
   - **Who has access**: `Anyone` *(URL public nhưng unguessable — như Google Form)*
8. Bấm **Deploy** → cấp quyền (Authorize access → chọn account → Advanced → Go to ... → Allow).
9. Copy **Web app URL** (dạng `https://script.google.com/macros/s/AKfycb.../exec`).

### Bước 2: Test Apps Script

Mở URL vừa copy trong browser → bạn sẽ thấy JSON:

```json
{"ok":true,"data":{"status":"ok","time":"2026-05-28T..."}}
```

Nếu thấy như vậy là Apps Script đã hoạt động.

### Bước 3: Cấu hình frontend

```powershell
cd D:\Development\Binance\Alpha tracking\frontend
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

Mở http://127.0.0.1:5300 — app sẽ tự tạo 3 sheet mới trong Google Sheet:
- `Accounts` — danh sách tài khoản
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
cd frontend
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

- **Web app URL là một dạng "API key"** — không share công khai, không commit lên git public.
- `.env` đã được gitignore.
- Bất kỳ ai có URL đều có thể đọc/ghi sheet → giữ URL private.
- Nếu lộ URL: vào **Deploy → Manage deployments** → **Archive** deployment cũ và tạo deployment mới.

## License

Personal use.
