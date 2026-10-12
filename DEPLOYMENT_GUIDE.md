# BA Desk: hướng dẫn triển khai từ bước 2 đến nghiệm thu

Phương án: Vercel chứa giao diện; Mac chứa FastAPI, Telegram, SQLite, tiến trình gọi Codex và bộ lịch. Trình duyệt gọi trực tiếp API qua Tailscale Serve; thiết bị truy cập phải bật Tailscale.

**Trạng thái hiện tại:** bước 3 đã áp dụng trong BA-DESK, có cấu hình backend/frontend của máy và kiểm thử remote. Tailscale đã đăng nhập. Chưa bật Serve HTTPS, chưa tạo LaunchAgent và chưa deploy Vercel. Các phần hướng dẫn sửa code bên dưới là tham chiếu; không cần chép lại bước 3.

## 2. Cài Tailscale và thử kết nối

### 2.1. Cài trên Mac

1. Mở [trang cài Tailscale cho macOS](https://tailscale.com/docs/install/mac).
2. Chọn bản **Standalone** do Tailscale cung cấp. Với file `.pkg`, chạy trình cài đặt. Với file `.zip`, giải nén rồi **chuyển `Tailscale.app` vào `/Applications` trước khi mở**; không chạy trực tiếp từ Downloads. Nếu đã mở từ Downloads, thoát ứng dụng trước khi chuyển. Không cài đồng thời nhiều bản Tailscale. [Yêu cầu cài đặt bản Standalone](https://pkgs.tailscale.com/stable/#macos).
3. Mở Tailscale; đăng nhập tài khoản bạn sẽ dùng trên điện thoại.
4. Cho phép cấu hình VPN / Network Extension khi macOS hỏi. Trên macOS 15 trở lên: **System Settings → General → Login Items & Extensions → Network Extensions → ⓘ**, bật Tailscale và xác nhận bằng Touch ID/mật khẩu; trên macOS 14 trở xuống, tìm yêu cầu **Allow** trong **Privacy & Security**. Sau đó cho phép cấu hình VPN nếu được hỏi. [Hướng dẫn cấp quyền extension](https://tailscale.com/docs/concepts/macos-sysext).
5. Bật tự mở Tailscale khi đăng nhập Mac nếu ứng dụng có tùy chọn này.
6. Trong [bảng quản lý thiết bị](https://login.tailscale.com/admin/machines), kiểm tra Mac online. Giữ mạng riêng chỉ có tài khoản và thiết bị của bạn trong giai đoạn đầu.

Trong Terminal:

```bash
tailscale version
tailscale status
```

Nếu báo `command not found`, thử gọi binary của ứng dụng:

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale version
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
```

Nếu cách này hoạt động, trong các lệnh bên dưới thay `tailscale` bằng đường dẫn đó. Nếu đường dẫn cũng không tồn tại, kiểm tra nơi cài ứng dụng và phiên bản bằng hướng dẫn chính thức, không cài thêm bản thứ hai chỉ để có CLI.

### 2.2. Cài trên điện thoại

1. Cài Tailscale từ App Store hoặc Google Play.
2. Đăng nhập cùng tài khoản / cùng mạng riêng với Mac.
3. Cho phép VPN, bật kết nối.
4. Xác nhận cả Mac và điện thoại xuất hiện online trong danh sách thiết bị.

Không cần bật Exit Node cho mục đích này. Nếu đang dùng VPN công ty, có thể cần chuyển VPN để thử kết nối.

### 2.3. Thử bằng một trang riêng, chưa đưa API thật vào Serve

Mở Terminal thứ nhất. Tạo thư mục tạm chỉ chứa một trang test:

```bash
ba_desk_test_dir="$(mktemp -d -t ba-desk-connect)"
printf '%s\n' 'BA Desk: ket noi thanh cong' > "$ba_desk_test_dir/index.html"
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$ba_desk_test_dir"
```

Giữ Terminal này chạy. Nếu cổng 8765 đang dùng, chọn một cổng trống và đổi ở cả lệnh Python lẫn Serve.

Mở Terminal thứ hai:

```bash
tailscale serve status
tailscale serve --bg http://127.0.0.1:8765
tailscale serve status
```

Nếu đã có cấu hình Serve phục vụ ứng dụng khác trên HTTPS 443, đừng ghi đè; chọn cấu hình/cổng HTTPS riêng theo tài liệu CLI trước.

Lần đầu, CLI có thể đưa một liên kết để bật HTTPS/MagicDNS. Mở liên kết và làm theo yêu cầu. Chọn **Serve**, không bật Funnel cho phương án mạng riêng này.

Ghi lại URL HTTPS thực tế mà CLI trả về, ví dụ:

```text
https://macbook-tenban.ten-mang.ts.net
```

Đây chỉ là ví dụ; không chép nguyên tên này. Mở URL trên điện thoại sau khi tắt Wi-Fi và dùng 4G/5G. Nếu thấy dòng test, đường kết nối đã hoạt động.

**Đạt bước 2:** điện thoại khác mạng mở được HTTPS test. Chưa dùng tin nhắn Telegram để thử.

Sau khi thử, Ctrl+C trong Terminal chạy Python. Nếu cổng HTTPS 443 vừa cấu hình chỉ dành cho test này, tắt nó bằng:

```bash
tailscale serve --https=443 off
```

Không dùng `serve reset` nếu máy có cấu hình Serve khác cần giữ.

Tham khảo: [Serve](https://tailscale.com/docs/features/tailscale-serve), [CLI Serve và chế độ --bg](https://tailscale.com/docs/reference/tailscale-cli/serve).

## 3. Sửa code để chấp nhận giao diện từ Vercel

**Đây là phần cần lập trình trước khi deploy dữ liệu thật. Thêm biến môi trường thôi chưa đủ.**

Hướng dẫn riêng cho bước này, với vị trí sửa, mẫu middleware đầy đủ và lệnh kiểm tra: [STEP_3_GUIDE.md](./STEP_3_GUIDE.md).

### 3.1. Frontend: cấu hình địa chỉ API

File: `src/services/api.ts`. Giữ helper API hiện tại và cơ chế account revision, đổi URL fetch theo nguyên tắc:

```ts
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

// Trong helper hiện tại:
const response = await fetch(`${API_BASE_URL}/api${path}`, {
  // Giữ method, headers, body và xử lý lỗi hiện có.
});
```

Không thay toàn bộ hàm bằng đoạn minh họa này. Nếu project chưa có kiểu `import.meta.env`, thêm khai báo Vite client vào file kiểu phù hợp:

```ts
/// <reference types="vite/client" />
```

Quy ước cấu hình:

- Local: để trống `VITE_API_BASE_URL`, tiếp tục dùng `/api`.
- Deploy: dùng URL HTTPS Serve, **không có /api ở cuối**.
- Biến `VITE_*` chỉ chứa cấu hình công khai. Không đặt token hoặc mật khẩu trong đó.

[Tài liệu biến môi trường Vite](https://vite.dev/guide/env-and-mode).

### 3.2. Backend: host, origin và danh tính

File: `server/app.py`. Hiện tại `TrustedHostMiddleware` và `local_only` chặn remote; cần thay bằng cấu hình có hai chế độ rõ ràng:

- **Local mặc định:** giữ hạn chế localhost như hiện tại.
- **Remote qua Serve:** cho đúng host backend và đúng origin frontend, xác thực tài khoản Tailscale.

Các biến sau đã được backend đọc; cấu hình riêng của máy nằm trong `.local/remote.env`:

```text
BA_DESK_REMOTE_MODE=tailscale
BA_DESK_ALLOWED_HOSTS=macbook-tenban.ten-mang.ts.net,127.0.0.1,localhost
BA_DESK_ALLOWED_ORIGINS=https://ten-project.vercel.app,https://macbook-tenban.ten-mang.ts.net
BA_DESK_TAILSCALE_LOGIN=email-dang-nhap-tailscale-cua-ban
```

`BA_DESK_TAILSCALE_LOGIN` phải khớp danh tính đăng nhập Tailscale, có thể khác email Telegram. Thay các URL ví dụ bằng URL đã xác minh.

Các điều kiện cần đáp ứng trong code:

1. Thêm CORS middleware với danh sách origin cụ thể, các method thực sự dùng và headers `Content-Type`, `X-Account-Revision`.
2. Xử lý preflight OPTIONS hợp lệ trước khi xác thực API. Không coi preflight là quyền đọc dữ liệu.
3. Với API dữ liệu thật, kiểm tra `Tailscale-User-Login` được Serve gắn vào request; thiếu danh tính hoặc sai tài khoản phải bị từ chối, kể cả GET và request không có Origin.
4. Client không tự gửi header danh tính Tailscale. Serve xử lý header này tại proxy.
5. Backend tiếp tục bind `127.0.0.1`, không đổi sang `0.0.0.0`. Chỉ tin proxy cục bộ đã cấu hình; không mặc nhiên tin mọi forwarded header.
6. Giữ giới hạn body, no-store, kiểm tra account revision và các validation hiện có.
7. Chỉ health endpoint được trả thông tin tối thiểu; không trả tin nhắn, token, email hoặc phiên đăng nhập.
8. Không mở wildcard `*.vercel.app`: chỉ thêm production domain và một preview domain cụ thể khi cần.

Serve chuyển danh tính của người truy cập đến backend; backend lắng nghe trên localhost là điều kiện quan trọng khi tin các header này. Mô hình này giả định các tiến trình khác chạy dưới quyền người dùng trên Mac là đáng tin. [Identity headers của Serve](https://tailscale.com/docs/features/tailscale-serve).

Khi chạy chế độ remote, truy cập trên Mac bằng URL Serve. Nếu còn muốn giao diện localhost dùng dữ liệu thật, cần thiết kế đường xác thực local riêng; không bỏ qua xác thực chỉ vì request đến từ proxy loopback.

### 3.3. Kiểm tra trước khi nối backend thật

- Request từ đúng tài khoản Tailscale hoạt động.
- Tài khoản khác / không có danh tính không đọc được API.
- Origin ngoài danh sách không được chấp nhận.
- OPTIONS từ origin được phép hoạt động.
- Thao tác đổi tài khoản vẫn chặn request cũ.
- Chế độ local mặc định không bị hỏng.

Chạy:

```bash
cd /Users/tuanbinh1511/WorkSpace/BA-DESK
npm run build
npm test
```

Bộ test hiện tại chưa thay thế việc bổ sung test cho remote/auth/CORS.

**Đạt bước 3:** bản sửa đã kiểm thử; cấu hình thiếu không được tự mở quyền truy cập.

## 4. Kiểm tra backend thật và xử lý mất kết nối

### 4.1. Kiểm tra bằng chạy tay trước

Sau khi code đã đọc cấu hình bước 3, lưu cấu hình riêng trên Mac, ví dụ `.local/remote.env`, chỉ dùng giá trị của bạn. Thư mục `.local` đang được bỏ qua bởi Git.

Dùng các dòng `export KEY='value'` trong file để shell có thể đọc; giữ quyền file 600. Không đưa token/API hash/phiên đăng nhập vào tài liệu chia sẻ.

Khởi động backend với cấu hình remote và kiểm tra AI đã đăng nhập:

```bash
cd /Users/tuanbinh1511/WorkSpace/BA-DESK
codex login status
source .local/remote.env
npm start
```

Nếu backend đã chạy ở cổng 8000, dừng đúng tiến trình/Terminal cũ trước; không khởi động thêm bản thứ hai.

Sau đó:

```bash
tailscale serve --bg http://127.0.0.1:8000
tailscale serve status
```

Mở URL Serve bằng Mac và điện thoại. Backend đã phục vụ bản build local nên có thể thử trước khi deploy Vercel.

### 4.2. UX đã bổ sung

Đã triển khai và kiểm thử mất kết nối/403/kết nối lại bằng backend riêng. Hướng dẫn chạy và giới hạn: [STEP_4_GUIDE.md](./STEP_4_GUIDE.md).

File chính: `src/hooks/useWorkspace.ts`, `src/services/api.ts` và phần hiển thị trạng thái trong `src/App.tsx`.

- Hiển thị đang kết nối, đã kết nối, mất kết nối, không đủ quyền.
- Giữ dữ liệu đang hiển thị khi ngắt mạng; ghi thời điểm cập nhật cuối.
- Nếu chưa lấy được dữ liệu thật, không âm thầm hiển thị demo như dữ liệu cá nhân.
- Không gửi thay đổi khi offline; không thông báo “đã lưu” khi request thất bại.
- Có timeout và thử kết nối lại có giới hạn.
- Tạm ngưng polling khi tab ẩn, tải lại khi tab được mở.
- AI chạy nền trên backend, frontend theo dõi tiến độ.

**Đạt bước 4:** chủ động ngắt Tailscale/backend rồi bật lại; trạng thái đúng và không nhân đôi thao tác.

## 5. Deploy chỉ bản build giao diện lên Vercel

Dùng CLI vì thư mục hiện tại chưa có Git repository; chưa cần tạo GitHub repository để triển khai lần đầu.

### 5.1. Build với địa chỉ API thật

Chỉ chạy sau khi đã implement `VITE_API_BASE_URL`:

```bash
cd /Users/tuanbinh1511/WorkSpace/BA-DESK
VITE_API_BASE_URL='https://macbook-tenban.ten-mang.ts.net' npm run build
```

Thay URL ví dụ. Vite nhúng địa chỉ này khi build: đổi địa chỉ cần build lại.

### 5.2. Tạo thư mục upload chỉ chứa giao diện

```bash
mkdir -p /Users/tuanbinh1511/WorkSpace/ba-desk-web-deploy
cp -R /Users/tuanbinh1511/WorkSpace/BA-DESK/dist/. /Users/tuanbinh1511/WorkSpace/ba-desk-web-deploy/
```

Thư mục này chỉ nên có `index.html`, `assets/`, các file tĩnh và cấu hình deploy; không có `.local`, `.venv`, `server`, `.env` hay credentials. Khi cập nhật, các asset cũ có thể còn lại; làm mới phần build trong thư mục này nhưng giữ liên kết project `.vercel`.

Trong thư mục upload, tạo `vercel.json`:

```json
{
  "framework": null,
  "buildCommand": null,
  "outputDirectory": ".",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Đây là deploy file đã build, không phải build Vite trên Vercel. Không dùng `--prebuilt` chỉ vì đã chạy `npm run build`: tùy chọn đó yêu cầu Vercel Build Output.

### 5.3. Đăng nhập và deploy preview

```bash
npx vercel login
npx vercel --cwd /Users/tuanbinh1511/WorkSpace/ba-desk-web-deploy
```

Cho phép npx cài CLI nếu được hỏi, đăng nhập bằng trình duyệt. Trong thiết lập project:

- Chọn tài khoản/scope của bạn.
- Tạo project mới, ví dụ `ba-desk-tenban` nếu tên còn trống.
- Thư mục deploy là thư mục chỉ chứa giao diện ở trên.
- Nếu hỏi framework, chọn Other; không thêm backend Python.

Lấy URL preview thực tế; thêm **đúng URL đó** vào allowed origins của backend, khởi động lại backend. Preview protection nếu có là lớp truy cập giao diện của Vercel, không thay thế xác thực backend.

Mở preview trên điện thoại đang bật Tailscale. Nếu trình duyệt yêu cầu quyền truy cập mạng cục bộ, chỉ cho phép trên domain ứng dụng của bạn. Tailscale đang bật không tự bỏ qua giới hạn CORS hoặc quyền trình duyệt. [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access).

### 5.4. Chốt production

Sau khi preview đã hoạt động:

```bash
npx vercel --prod --cwd /Users/tuanbinh1511/WorkSpace/ba-desk-web-deploy
```

Lấy production domain trong Vercel, cập nhật origin chính xác trên Mac, khởi động lại backend. Sau nghiệm thu, có thể bỏ preview origin để thu hẹp danh sách.

Trình duyệt gọi trực tiếp backend Serve; không thêm rewrite Vercel `/api` về một địa chỉ chỉ truy cập được trong mạng riêng Tailscale.

**Đạt bước 5:** domain production hoạt động trên điện thoại 4G/5G; dữ liệu đến từ SQLite trên Mac.

Tham khảo: [Vercel CLI](https://vercel.com/docs/cli/deploy), [Vite/SPA trên Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## 6. Tự chạy backend và vận hành trên Mac

### 6.1. Vì sao không chỉ dùng npm start

Terminal bị đóng sẽ dừng backend. LaunchAgent của macOS tự chạy khi bạn đăng nhập và khởi động lại dịch vụ nếu tiến trình thoát.

Đường dẫn Node/Codex hiện thấy trên máy:

```text
/Users/tuanbinh1511/.nvm/versions/node/v22.21.1/bin
```

LaunchAgent không tự nạp môi trường của Terminal hoặc nvm. Cần đặt PATH để backend tìm được `codex`. Khi nâng phiên bản Node/nvm, kiểm tra lại đường dẫn bằng `command -v node` và `command -v codex`.

### 6.2. Tạo script khởi động sau khi bước 3–5 đã đạt

Tạo `scripts/start-local-service.sh` trong project với nội dung sau:

```sh
#!/bin/sh
set -eu

cd /Users/tuanbinh1511/WorkSpace/BA-DESK
export PATH="/Users/tuanbinh1511/.nvm/versions/node/v22.21.1/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
. /Users/tuanbinh1511/WorkSpace/BA-DESK/.local/remote.env

exec /Users/tuanbinh1511/WorkSpace/BA-DESK/.venv/bin/python \
  -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Script LaunchAgent này thuộc bước 6, chưa được tạo. Bước 3 đã có `scripts/start-remote.sh`, dùng đường dẫn tương đối để hỗ trợ đổi thư mục. `remote.env` phải chứa các dòng `export` đã nói ở bước 4. Quyền file cấu hình:

```bash
chmod 600 /Users/tuanbinh1511/WorkSpace/BA-DESK/.local/remote.env
mkdir -p /Users/tuanbinh1511/Library/LaunchAgents
mkdir -p /Users/tuanbinh1511/Library/Logs/BA-Desk
chmod 700 /Users/tuanbinh1511/Library/Logs/BA-Desk
```

### 6.3. Tạo LaunchAgent

Tạo file `/Users/tuanbinh1511/Library/LaunchAgents/local.ba-desk.backend.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>local.ba-desk.backend</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>/Users/tuanbinh1511/WorkSpace/BA-DESK/scripts/start-local-service.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/tuanbinh1511/WorkSpace/BA-DESK</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>/Users/tuanbinh1511/Library/Logs/BA-Desk/backend.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/tuanbinh1511/Library/Logs/BA-Desk/backend.err.log</string>
</dict>
</plist>
```

Kiểm tra, dừng backend đang chạy tay bằng Ctrl+C ở đúng Terminal, rồi nạp dịch vụ:

```bash
plutil -lint /Users/tuanbinh1511/Library/LaunchAgents/local.ba-desk.backend.plist
launchctl bootstrap "gui/$(id -u)" /Users/tuanbinh1511/Library/LaunchAgents/local.ba-desk.backend.plist
launchctl print "gui/$(id -u)/local.ba-desk.backend"
```

Khởi động lại khi sửa cấu hình:

```bash
launchctl kickstart -k "gui/$(id -u)/local.ba-desk.backend"
```

Dừng và gỡ khỏi phiên hiện tại:

```bash
launchctl bootout "gui/$(id -u)/local.ba-desk.backend"
```

File plist vẫn ở LaunchAgents nên có thể chạy lại khi đăng nhập lần sau; muốn tắt lâu dài, chuyển file đó ra ngoài LaunchAgents. Không xóa thư mục dữ liệu để tắt dịch vụ.

Xem lỗi:

```bash
tail -n 60 /Users/tuanbinh1511/Library/Logs/BA-Desk/backend.err.log
```

Không chia sẻ nguyên log khi chưa kiểm tra dữ liệu nhạy cảm. Nên giới hạn/luân chuyển log khi triển khai vận hành.

Serve có `--bg` sẽ khôi phục cấu hình khi Tailscale chạy lại; vẫn cần kiểm tra Tailscale online sau khi reboot. [Serve chạy nền](https://tailscale.com/docs/reference/tailscale-cli/serve), [LaunchAgent của Apple](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).

### 6.4. Giữ Mac thức

Khi làm việc, cắm nguồn và giữ nắp máy mở. Trong cài đặt nguồn, bật tùy chọn ngăn máy tự ngủ khi cắm nguồn nếu phiên bản macOS có tùy chọn đó.

Thử tạm thời bằng Terminal:

```bash
caffeinate -i -s
```

Lệnh có hiệu lực khi còn chạy. Nó không bảo đảm máy vẫn hoạt động khi gập nắp. Nếu cần xử lý liên tục, dùng một máy luôn bật hoặc cấu hình nguồn phù hợp; LaunchAgent không hoạt động trước lúc bạn đăng nhập sau khi reboot.

### 6.5. Telegram và lịch

Trong BA Desk:

1. Xác nhận Telegram cá nhân đã kết nối.
2. Xác nhận bot đã kết nối và người nhận đúng tài khoản.
3. Bấm Gửi thử; kiểm tra điện thoại nhận tin.
4. Bật tự đồng bộ, phân tích AI, lịch báo cáo và thông báo bot theo nhu cầu.
5. Giữ 08:30 / 17:00, timezone Asia/Ho_Chi_Minh.
6. Đóng tab giao diện; backend vẫn phải gửi nhắc.

Lịch hiện tại có tạo bù những khung giờ đã qua trong ngày khi khởi động muộn. Đó là gửi bù, không phải đúng giờ khi máy đang ngủ. Gửi qua Telegram có thể trùng một phần nếu Telegram đã nhận nhưng phản hồi xác nhận bị mất.

### 6.6. Sao lưu SQLite

Thực hiện backup bằng SQLite backup API, không chỉ chép file khi database đang được ghi. Ví dụ thao tác thủ công:

```bash
cd /Users/tuanbinh1511/WorkSpace/BA-DESK
.venv/bin/python - <<'PY'
import os
import sqlite3
from datetime import datetime
from pathlib import Path

source = Path('.local/desk.sqlite')
if not source.is_file():
    raise SystemExit('Chua co database de sao luu.')
directory = Path('.local/backups')
directory.mkdir(mode=0o700, parents=True, exist_ok=True)
destination = directory / f"desk-{datetime.now():%Y%m%d-%H%M%S-%f}.sqlite"
fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
with sqlite3.connect(f"file:{source.resolve()}?mode=ro", uri=True) as src:
    with sqlite3.connect(destination) as dst:
        src.backup(dst)
        result = dst.execute('PRAGMA integrity_check').fetchone()[0]
        if result != 'ok':
            raise SystemExit('Ban sao luu khong dat kiem tra.')
print(f'Da sao luu: {destination}')
PY
```

Đây là ví dụ chưa được thực thi trong lượt hướng dẫn. Bản sao lưu chứa dữ liệu cá nhân, bảo vệ như database gốc. Sao lưu cùng ổ giúp khôi phục lỗi ứng dụng; để chống hỏng/mất máy cần thêm bản sao được bảo vệ ở nơi khác.

Để backup tự động hằng ngày, sau khi chạy tay thành công, tách đoạn này thành script có kiểm thử rồi tạo LaunchAgent theo lịch riêng; không khởi chạy thêm một backend để làm backup. Kiểm tra phục hồi trên thư mục thử và chế độ tắt AI/Telegram trước; không thử ghi đè dữ liệu đang dùng.

**Đạt bước 6:** đăng nhập lại Mac thì backend và kết nối hoạt động; AI tìm được Codex; đóng giao diện vẫn có lịch và bot; backup phục hồi được.

## 7. Nghiệm thu và xử lý lỗi

### 7.1. Checklist cuối

- [ ] Production domain tải giao diện.
- [ ] Điện thoại 4G/5G + Tailscale đọc được dữ liệu thật.
- [ ] Tắt Tailscale: không đọc được API.
- [ ] Sai tài khoản: không đọc được API.
- [ ] Báo cáo đúng ngày, AI có tiến độ và kết quả.
- [ ] Đánh dấu task lưu thành công sau khi tải lại.
- [ ] Tìm tài liệu có đúng người, ngày và nội dung gốc.
- [ ] Đổi tài khoản không trộn dữ liệu; thử trên dữ liệu test.
- [ ] Gửi thử bot thành công; có ít nhất một lượt lịch tự động chạy khi tab đã đóng.
- [ ] Mất mạng/backend rồi bật lại: UI đúng trạng thái, không tự gửi trùng thao tác.
- [ ] Reboot và đăng nhập: backend, Tailscale, AI hoạt động.
- [ ] Bản sao lưu qua integrity_check và phục hồi trong môi trường thử.
- [ ] Build và test đạt sau thay đổi.

### 7.2. Bảng lỗi thường gặp

| Hiện tượng | Kiểm tra trước |
|---|---|
| tailscale: command not found | CLI/PATH hoặc binary Tailscale.app |
| URL ts.net không mở | Cả hai thiết bị online; VPN bật; HTTPS/MagicDNS; đúng URL |
| 502 từ Serve | Backend/test server chưa chạy hoặc sai cổng |
| Invalid host header / 400 | Allowed hosts chưa có hostname Serve |
| 401/403 | Danh tính Tailscale, chế độ remote, origin cụ thể |
| URL Serve mở được nhưng Vercel lỗi | URL API nhúng khi build, preflight CORS, quyền mạng cục bộ của trình duyệt |
| Vercel hiển thị dữ liệu demo | Frontend chưa trỏ đúng API, API bị chặn hoặc backend offline; không coi demo là dữ liệu thật |
| AI chạy bằng Terminal nhưng không chạy bằng LaunchAgent | PATH tới Codex/Node; tài khoản chạy dịch vụ; đăng nhập Codex |
| Address already in use | Backend đã chạy; chỉ giữ một phiên |
| Bot không gửi đúng giờ | Máy ngủ/offline, backend dừng, công tắc lịch/bot hoặc bot bị chặn |
| Bootstrap failed / service already loaded | plutil, đường dẫn, trạng thái launchctl; không bootstrap trùng |

### 7.3. Cách cập nhật về sau

1. Sao lưu dữ liệu.
2. Sửa code; chạy build và test.
3. Nếu đổi frontend, build lại với API URL thật, cập nhật thư mục frontend deploy, preview rồi production.
4. Nếu đổi backend, khởi động lại LaunchAgent và kiểm tra kết nối/bot.
5. Nếu lỗi, quay về bản frontend Vercel trước và bản backend đã biết hoạt động; không tự phục hồi database cũ trừ khi thực sự có lỗi dữ liệu.

Vercel Hobby chỉ dành cho cá nhân phi thương mại; chọn gói phù hợp nếu triển khai cho doanh nghiệp. [Điều kiện Hobby](https://vercel.com/docs/plans/hobby).

**Giới hạn vận hành:** Mac phải thức, có mạng và có phiên người dùng hoạt động. Tiến trình Codex chạy trên Mac vẫn gọi dịch vụ model OpenAI; không phải inference hoàn toàn offline.
