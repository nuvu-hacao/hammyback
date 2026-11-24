# HammyBack 🐹

**Hammy chọn thẻ, đầy má hoàn tiền.** Web app (cài lên màn hình chính như app thật) giúp biết quẹt thẻ tín dụng nào được hoàn tiền nhiều nhất, còn bao nhiêu cap, khi nào đến hạn thanh toán.

## Quyền riêng tư

- Dữ liệu của mỗi người nằm trong **một Google Sheet ở Google Drive của chính người đó**. Người làm app không xem được.
- **Không có server**, không cơ sở dữ liệu riêng, không analytics, không tracking. Trang chỉ là file tĩnh trên GitHub Pages.
- Quyền Google duy nhất cho dữ liệu: `drive.file` — app chỉ thấy file do chính nó tạo. Thêm `openid email` để biết tài khoản nào đang đăng nhập.
- Không bao giờ hỏi số thẻ, ngày hết hạn, CVV. Gõ nhầm dãy số giống số thẻ (kiểm tra Luhn) hoặc CVV → app chặn không cho lưu.
- Access token chỉ giữ trong bộ nhớ, không lưu vào trình duyệt. Đăng xuất = thu hồi quyền + xoá dữ liệu trình duyệt của app.
- Repo này **không chứa** client secret, API key, token hay dữ liệu thật nào. Client ID trong `config.js` là thông tin công khai theo thiết kế của Google.

Chi tiết: [privacy.html](privacy.html).

## Các file

| File | Là gì |
| --- | --- |
| `index.html`, `styles.css` | Giao diện |
| `app.js` | Đăng nhập Google, đọc/ghi Sheet, các màn hình |
| `engine.js` | Tính kỳ sao kê, cap, bậc hoàn tiền, tiền hoàn, gợi ý thẻ, chặn số thẻ |
| `config.js` | **Chỗ duy nhất cần sửa**: dán Client ID |
| `mock.js` | Chế độ thử `?mock=1` (dữ liệu giả, không kết nối Google) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Để cài lên màn hình chính |
| `fonts/` | Font Inter & Fraunces tự host (giấy phép OFL) |
| `privacy.html` | Chính sách quyền riêng tư (dùng cho màn xin quyền của Google) |

Google Sheet của mỗi người có 5 sheet: Thẻ, Nhóm hoàn tiền, Bậc hoàn tiền, Giao dịch, Đọc tôi.

Xem thử không cần Google: mở `https://<tên>.github.io/hammyback/?mock=1&seed=1`.

---

## Hướng dẫn đưa app lên mạng (làm 1 lần, ~30 phút)

Bạn cần: 1 tài khoản GitHub, 1 tài khoản Google. **Bật xác minh 2 bước (2FA) cho cả hai** trước khi bắt đầu.

### Bước 1 – Đưa code lên GitHub Pages

1. Vào github.com → đăng nhập → góc phải bấm **+** → **New repository**.
2. Repository name: `hammyback` · chọn **Public** · bấm **Create repository**.
3. Ở trang repo mới, bấm link **uploading an existing file**.
4. Giải nén file zip, mở thư mục `hammyback`, **chọn tất cả file và thư mục bên trong** (không phải chính thư mục `hammyback`) rồi kéo thả vào trang GitHub. Đợi tải xong → bấm **Commit changes**.
5. Vào **Settings** (của repo) → menu trái **Pages** → *Source*: **Deploy from a branch** → *Branch*: `main`, thư mục `/ (root)` → **Save**.
6. Đợi 1–2 phút, tải lại trang Pages, sẽ thấy link dạng `https://<tên-github>.github.io/hammyback/`. Mở thử `…/hammyback/?mock=1&seed=1` để xem app chạy với dữ liệu giả.

### Bước 2 – Tạo "chìa khoá" đăng nhập Google (Google Cloud)

1. Vào console.cloud.google.com → đăng nhập → thanh trên cùng bấm chọn project → **New project** → tên `HammyBack` → **Create**. Không cần bật thanh toán (billing).
2. Menu ☰ → **APIs & Services** → **Library** → tìm **Google Sheets API** → **Enable**. Quay lại Library → tìm **Google Drive API** → **Enable**.
3. Menu ☰ → **APIs & Services** → **OAuth consent screen** (có thể hiện là **Google Auth Platform**) → **Get started**:
   - App name: `HammyBack` · User support email: email của bạn.
   - Audience: **External**.
   - Contact email: email của bạn → đồng ý điều khoản → **Create**.
4. Trong Google Auth Platform:
   - **Branding**: tải logo `icons/icon-512.png` (tuỳ chọn); *Application home page*: `https://<tên-github>.github.io/hammyback/`; *Privacy policy link*: `https://<tên-github>.github.io/hammyback/privacy.html`; *Authorized domains*: `<tên-github>.github.io` → **Save**.
   - **Data Access** → **Add or remove scopes** → chỉ tick 3 quyền: `openid`, `…/auth/userinfo.email`, `…/auth/drive.file` → **Update** → **Save**. **Không** thêm quyền nào khác.
   - **Audience** → **Publish app** → **Confirm** (chuyển sang *In production*).
5. **Clients** (hoặc **Credentials** → **Create credentials** → **OAuth client ID**):
   - Application type: **Web application** · Name: `HammyBack web`.
   - **Authorized JavaScript origins** → Add URI: `https://<tên-github>.github.io` (không có dấu `/` cuối, không có `/hammyback`).
   - **Authorized redirect URIs** → Add URI: `https://<tên-github>.github.io/hammyback/` (có dấu `/` cuối). Cái này dùng cho iPhone khi mở từ màn hình chính.
   - **Create** → copy **Client ID** (dạng `1234…-abc….apps.googleusercontent.com`). **Không cần** và **không dùng** client secret.

### Bước 3 – Dán Client ID

1. Trên GitHub, mở file `config.js` → bấm biểu tượng bút chì (Edit).
2. Dán Client ID vào giữa hai dấu nháy: `clientId: '1234…apps.googleusercontent.com',`
3. **Commit changes**. Đợi 1–2 phút.

### Bước 4 – Tự thử trước trên iPhone

1. Mở `https://<tên-github>.github.io/hammyback/` bằng **Safari**.
2. Nút **Chia sẻ** → **Thêm vào Màn hình chính** → **Thêm**.
3. Mở app từ icon Hammy → **Đăng nhập bằng Google** → chọn tài khoản → cho phép.
4. Chọn thẻ → điền ngày chốt sổ, hạn thanh toán → **Lưu vào Google Sheet** → thấy "Ghi vào hết rồi nè bạn ơi!".
5. Ghi thử 1 giao dịch. Mở Google Drive, thấy file **HammyBack – Sổ thẻ hoàn tiền**.
6. Đóng hẳn app rồi mở lại: app tự đăng nhập lại, không hỏi gì.
7. Thử thêm với **một tài khoản Google khác**: mỗi tài khoản chỉ thấy sổ của mình.

Nếu Google hiện màn "Google hasn't verified this app" (chưa xác minh): báo lại để xử lý (cách tạm: OAuth consent screen → Audience → đưa về *Testing* và thêm email bạn bè vào *Test users*, tối đa 100 người).

### Bước 5 – Gửi cho bạn bè

> Link HammyBack: https://<tên-github>.github.io/hammyback/
> 1. Mở bằng Safari (iPhone) hoặc Chrome (Android).
> 2. Chia sẻ → Thêm vào Màn hình chính.
> 3. Mở app, đăng nhập Google. Dữ liệu nằm trong Drive của bạn, mình không xem được.

---

## Cập nhật app về sau

Sửa/thay file trên GitHub là xong. Nếu thay đổi nhiều, tăng số trong dòng `var CACHE = 'hammyback-static-v2'` ở `sw.js` (vd v2 → v3) để máy bạn bè tải bản mới ngay.

## Kiểm tra (cho người làm kỹ thuật)

```bash
python3 -m http.server 8123
```

```bash
node tests/engine.test.js && node tests/e2e.js && node tests/auth.js
```
