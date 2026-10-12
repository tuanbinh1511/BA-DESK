# Bước 3: cấu hình API và xác thực qua Tailscale

Đây là hướng dẫn sửa code dựa trên phiên bản BA Desk đã đọc ngày 12/10/2026. Các đoạn dưới **chưa được áp dụng vào ứng dụng**. Chỉ dùng cho **Tailscale Serve riêng tư** và backend bind localhost; không dùng với Funnel/public tunnel.

## 3.1. Chuẩn bị

- Tailscale đã đăng nhập, Mac online.
- Có hostname Serve thực tế, ví dụ `macbook-tenban.ten-mang.ts.net`. Lệnh `tailscale serve status` cho biết URL khi đã cấu hình Serve.
- Biết Login name của tài khoản Tailscale trong bảng quản lý Users. Không lấy username Telegram để thay thế.
- Chưa cần domain Vercel ở giai đoạn này: thử bằng Vite local trước, thêm domain Vercel sau khi tạo project.
- Sao chép `server/app.py` và `src/services/api.ts` vào thư mục backup riêng trước khi sửa nếu chưa có Git.

Các URL và email trong tài liệu đều là ví dụ: thay bằng giá trị của bạn.

## 3.2. Thêm địa chỉ API cho frontend

Mở `src/services/api.ts`. Thêm trước dòng `let accountRevision`:

```ts
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
```

Trong cùng file, thay đúng dòng:

```ts
const response = await fetch(`/api${path}`, {
```

bằng:

```ts
const response = await fetch(`${API_BASE_URL}/api${path}`, {
```

Giữ nguyên headers, body, xử lý lỗi và kiểm tra accountRevision phía dưới.

Tạo file `src/vite-env.d.ts` nếu chưa có:

```ts
/// <reference types="vite/client" />
```

Khi biến rỗng, cách chạy local vẫn gọi `/api`. Khi biến có URL Serve, mọi lời gọi qua helper dùng backend đó. Không thêm `/api` vào giá trị biến; không tự gắn `Tailscale-User-Login` trong frontend.

Vite nhúng biến `VITE_*` vào giao diện khi build. Chỉ chứa địa chỉ công khai, không chứa token, mật khẩu hoặc session. [Tài liệu Vite](https://vite.dev/guide/env-and-mode).

## 3.3. Thêm import cho backend

Mở `server/app.py`. Thêm:

```python
import os
from fastapi.middleware.cors import CORSMiddleware
```

Giữ `urlparse`, `JSONResponse`, `TrustedHostMiddleware` và các import hiện có.

## 3.4. Thay đoạn cấu hình app và middleware

Trong `server/app.py`, tìm đoạn bắt đầu:

```python
app = FastAPI(title='BA Desk', lifespan=lifespan, docs_url=None, redoc_url=None, dependencies=[Depends(account_context)])
```

Thay từ dòng đó đến hết hàm `local_only`, **dừng trước `def validate_day(value):`**, bằng toàn bộ đoạn sau:

```python
REMOTE_MODE = os.environ.get('BA_DESK_REMOTE_MODE', 'local').strip()
REMOTE_LOGIN = os.environ.get('BA_DESK_TAILSCALE_LOGIN', '').strip()
REMOTE_HOSTS = [value.strip() for value in os.environ.get('BA_DESK_ALLOWED_HOSTS', '').split(',') if value.strip()]
REMOTE_ORIGINS = [value.strip().rstrip('/') for value in os.environ.get('BA_DESK_ALLOWED_ORIGINS', '').split(',') if value.strip()]

if REMOTE_MODE not in ('local', 'tailscale'):
    raise RuntimeError('BA_DESK_REMOTE_MODE phải là local hoặc tailscale.')

if REMOTE_MODE == 'tailscale':
    if not REMOTE_LOGIN or not REMOTE_HOSTS or not REMOTE_ORIGINS:
        raise RuntimeError('Thiếu login, hosts hoặc origins cho chế độ Tailscale.')
    if any('*' in host or '/' in host or ':' in host for host in REMOTE_HOSTS):
        raise RuntimeError('Allowed hosts phải là hostname cụ thể, không chứa URL hoặc wildcard.')
    for origin in REMOTE_ORIGINS:
        parsed = urlparse(origin)
        local_origin = parsed.hostname in ('127.0.0.1', 'localhost')
        if (
            not parsed.hostname or '*' in origin or parsed.username is not None
            or parsed.password is not None or parsed.path or parsed.query or parsed.fragment
            or (parsed.scheme != 'https' and not (local_origin and parsed.scheme == 'http'))
        ):
            raise RuntimeError('Allowed origins phải là origin HTTPS cụ thể hoặc HTTP localhost.')

app = FastAPI(title='BA Desk', lifespan=lifespan, docs_url=None, redoc_url=None, dependencies=[Depends(account_context)])
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=['127.0.0.1', 'localhost', 'testserver'] + (REMOTE_HOSTS if REMOTE_MODE == 'tailscale' else []),
)


@app.middleware('http')
async def local_only(request: Request, call_next):
    origin = request.headers.get('origin')
    if REMOTE_MODE == 'tailscale':
        if request.headers.get('tailscale-user-login') != REMOTE_LOGIN:
            return JSONResponse(
                {'detail': 'Chỉ tài khoản Tailscale được cấu hình mới được truy cập.'},
                status_code=403,
                headers={'Cache-Control': 'no-store'},
            )
        if origin and origin not in REMOTE_ORIGINS:
            return JSONResponse({'detail': 'Origin không được phép.'}, status_code=403)
    elif origin:
        parsed = urlparse(origin)
        if parsed.hostname not in ('localhost', '127.0.0.1') or parsed.scheme not in ('http', 'https'):
            return JSONResponse({'detail': 'Chỉ cho phép truy cập từ ứng dụng trên máy này.'}, status_code=403)
    try:
        content_length = int(request.headers.get('content-length', '0') or 0)
    except ValueError:
        return JSONResponse({'detail': 'Kích thước yêu cầu không hợp lệ.'}, status_code=400)
    if content_length < 0:
        return JSONResponse({'detail': 'Kích thước yêu cầu không hợp lệ.'}, status_code=400)
    if content_length > 12 * 1024 * 1024:
        return JSONResponse({'detail': 'File quá lớn. Export từng chat hoặc từng khoảng ngày (tối đa 12 MB).'}, status_code=413)
    revision = request.headers.get('x-account-revision')
    if request.method not in ('GET', 'HEAD') and revision is not None and revision != str(store.get('meta', 'accountRevision', 0)):
        return JSONResponse({'detail': 'Tài khoản đã đổi. Tải lại dữ liệu trước khi thao tác.'}, status_code=409)
    response = await call_next(request)
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


# CORS ở ngoài lớp kiểm tra danh tính để trả lời preflight và gắn headers cho lỗi.
if REMOTE_MODE == 'tailscale':
    app.add_middleware(
        CORSMiddleware,
        allow_origins=REMOTE_ORIGINS,
        allow_credentials=False,
        allow_methods=['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allow_headers=['Content-Type', 'X-Account-Revision'],
    )
```

Không thay `account_context`, `validate_day`, các API hay lifespan. Không thêm bản thứ hai của app/middleware.

Ý nghĩa:

- Không cấu hình remote: vẫn là chế độ local.
- Chọn tailscale nhưng thiếu login/hosts/origins: backend dừng khởi động.
- Đúng danh tính Tailscale mới truy cập được; thiếu danh tính bị chặn kể cả GET hoặc không có Origin.
- CORS trả lời OPTIONS cho frontend hợp lệ, nhưng không cấp quyền đọc dữ liệu.
- Giữ giới hạn file, bảo vệ đổi tài khoản và no-store.
- Không cần cài thêm package; FastAPI/Starlette hiện đã có CORS middleware.

Backend chỉ tin danh tính do Serve gửi khi backend **bind localhost**. Serve loại bỏ các header danh tính do client tự gửi trước khi gắn danh tính xác thực. Các tiến trình trên chính Mac vẫn nằm trong phạm vi tin cậy; đây là mô hình dành cho máy cá nhân của bạn. [Serve identity headers](https://tailscale.com/docs/features/tailscale-serve), [CORS FastAPI](https://fastapi.tiangolo.com/tutorial/cors/).

## 3.5. Tạo file cấu hình riêng

Trong Terminal:

```bash
cd /Users/tuanbinh1511/WorkSpace/tool-telegram
mkdir -p .local
chmod 700 .local
```

Tạo `.local/remote.env` bằng trình soạn thảo. Ví dụ:

```bash
export BA_DESK_REMOTE_MODE='tailscale'
export BA_DESK_TAILSCALE_LOGIN='email-dang-nhap-tailscale-cua-ban'
export BA_DESK_ALLOWED_HOSTS='macbook-tenban.ten-mang.ts.net'
export BA_DESK_ALLOWED_ORIGINS='https://macbook-tenban.ten-mang.ts.net,http://127.0.0.1:5173'
```

- Hostname không có `https://`, port hoặc đường dẫn.
- Origin có `https://` và có port nếu cần; không có đường dẫn.
- Origin Vite thử nghiệm là `http://127.0.0.1:5173`. Mở đúng địa chỉ này thay vì localhost hay cổng khác.
- Khi có domain Vercel, thêm origin chính xác vào danh sách, cách nhau bằng dấu phẩy.
- Không đặt `*` hoặc `*.vercel.app`.

Sau khi lưu:

```bash
chmod 600 .local/remote.env
```

Chưa sửa backend theo 3.3–3.4 thì các biến trên chưa có tác dụng.

## 3.6. Build và kiểm thử local trước

Chạy trong Terminal **chưa source remote.env**, hoặc đặt rõ chế độ local cho bộ test:

```bash
cd /Users/tuanbinh1511/WorkSpace/tool-telegram
npm run build
BA_DESK_REMOTE_MODE=local npm test
```

Bộ test API hiện tại khởi động server con và không gửi danh tính Tailscale; nếu source remote.env rồi chạy npm test nguyên bản, test có thể bị chặn. Việc ép chế độ local giúp kiểm tra tương thích cũ; vẫn cần kiểm thử remote riêng ở bước tiếp theo.

Nếu TypeScript báo không có thuộc tính env: kiểm tra file `src/vite-env.d.ts`.

## 3.7. Khởi động backend ở chế độ remote

Dừng đúng backend cũ ở cổng 8000 trước (Ctrl+C trong Terminal đang chạy). Không chạy đồng thời hai backend trên cùng dữ liệu Telegram.

Terminal thứ nhất:

```bash
cd /Users/tuanbinh1511/WorkSpace/tool-telegram
source .local/remote.env
npm start
```

Giữ Terminal này chạy. Backend phải dùng `127.0.0.1:8000`. Không sửa script start sang `0.0.0.0`.

Terminal thứ hai:

```bash
tailscale serve --bg http://127.0.0.1:8000
tailscale serve status
```

Chỉ dùng HTTPS listener dành cho BA Desk; không ghi đè Serve của dịch vụ khác.

## 3.8. Thử frontend local gọi backend remote

Trong Terminal thứ ba, dùng URL thật:

```bash
cd /Users/tuanbinh1511/WorkSpace/tool-telegram
VITE_API_BASE_URL='https://macbook-tenban.ten-mang.ts.net' npm run dev:ui
```

Dùng **dev:ui**, không dùng **npm run dev** ở bước này vì backend đã chạy.

Mở `http://127.0.0.1:5173` trên Mac đang bật Tailscale. Nếu Vite chọn cổng khác do 5173 đã dùng, dừng đúng phiên UI cũ hoặc cập nhật cả origin và địa chỉ mở cho cổng mới.

- Request state phải tới URL `https://...ts.net/api/state`.
- Dữ liệu thật tải được.
- Nếu trình duyệt hỏi quyền mạng cục bộ, cho phép trên giao diện bạn đang thử.
- Khi remote mode bật, mở `http://127.0.0.1:8000` trực tiếp có thể bị 403 vì request không đi qua Serve; điều này là dự kiến.
- Trên điện thoại, mở URL HTTPS Serve để thử bản build local; bản này có thể dùng API cùng origin Serve.

Frontend hiện còn fallback demo khi chưa nhận dữ liệu thật; không coi màn hình demo là bằng chứng kết nối thành công. Xem URL/status trong tab Network để xác nhận.

## 3.9. Kiểm tra status, CORS và chặn truy cập

Các lệnh sau chỉ in status hoặc headers, không in toàn bộ tin nhắn. Thay URL/email ví dụ.

**Qua Serve, đúng tài khoản:** kỳ vọng 200.

```bash
curl --max-time 10 --silent --output /dev/null --write-out '%{http_code}\n' \
  'https://macbook-tenban.ten-mang.ts.net/api/state'
```

**Gọi trực tiếp localhost, không danh tính:** kỳ vọng 403 trong remote mode.

```bash
curl --max-time 10 --silent --output /dev/null --write-out '%{http_code}\n' \
  'http://127.0.0.1:8000/api/state'
```

**Preflight từ origin được phép:** kỳ vọng 200, có `access-control-allow-origin: http://127.0.0.1:5173`.

```bash
curl --max-time 10 --silent --dump-header - --output /dev/null \
  -X OPTIONS 'https://macbook-tenban.ten-mang.ts.net/api/state' \
  -H 'Origin: http://127.0.0.1:5173' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: content-type,x-account-revision'
```

**Preflight từ origin khác:** kỳ vọng 400, không có allow-origin của website đó.

```bash
curl --max-time 10 --silent --dump-header - --output /dev/null \
  -X OPTIONS 'https://macbook-tenban.ten-mang.ts.net/api/state' \
  -H 'Origin: https://untrusted.example' \
  -H 'Access-Control-Request-Method: GET'
```

**Request có origin khác:** kỳ vọng 403.

```bash
curl --max-time 10 --silent --output /dev/null --write-out '%{http_code}\n' \
  'https://macbook-tenban.ten-mang.ts.net/api/state' \
  -H 'Origin: https://untrusted.example'
```

**Client tự khai danh tính sai qua Serve:** Serve phải gắn lại danh tính thật. Chạy từ thiết bị của bạn thì vẫn 200; đây không phải cách giả lập tài khoản khác.

```bash
curl --max-time 10 --silent --output /dev/null --write-out '%{http_code}\n' \
  'https://macbook-tenban.ten-mang.ts.net/api/state' \
  -H 'Tailscale-User-Login: wrong@example.invalid'
```

Muốn kiểm tra tài khoản khác thật sự phải dùng thiết bị/user khác đã được quyền vào mạng hoặc môi trường thử riêng. Không mở thêm quyền cho người khác trên dữ liệu thật chỉ để test.

**Host sai:** gọi localhost để kiểm tra, kèm login cấu hình nhằm đi qua lớp kiểm tra danh tính. Kỳ vọng 400. Chỉ dùng khi chạy test trên chính Mac; không coi việc tự gắn header ở loopback là cơ chế đăng nhập từ xa.

```bash
curl --max-time 10 --silent --output /dev/null --write-out '%{http_code}\n' \
  'http://127.0.0.1:8000/api/state' \
  -H 'Host: untrusted.example' \
  -H 'Tailscale-User-Login: email-dang-nhap-tailscale-cua-ban'
```

Tắt Tailscale trên điện thoại rồi thử URL Serve: thiết bị không vào được mạng riêng. Nếu vẫn mở được giao diện đã cache, kiểm tra API bằng tải lại; một trang tĩnh đã tải trước không chứng minh backend còn truy cập được.

## 3.10. Khi nào hoàn thành?

- [ ] Build và bộ test local đạt.
- [ ] Backend remote thiếu cấu hình không tự mở truy cập.
- [ ] Đúng user qua Serve đọc được API.
- [ ] Thiếu danh tính bị chặn.
- [ ] Origin sai / host sai bị chặn.
- [ ] Preflight hợp lệ hoạt động.
- [ ] Frontend gọi đúng HTTPS API.
- [ ] Task cập nhật và account revision vẫn hoạt động, kiểm thử trên dữ liệu thử cho các thay đổi tài khoản.
- [ ] Trình duyệt và điện thoại thực tế hoạt động.

Sau đó mới thực hiện bước 4 về trạng thái offline và bước 5 deploy Vercel. Các test CORS/auth có thể tự động hóa trên database tạm theo cách test API hiện tại; bộ test local sẵn có chưa chứng minh remote an toàn.

**Giới hạn:** mẫu được hướng dẫn cho một Mac đáng tin với Serve riêng tư. Chưa áp dụng mẫu vào code và chưa kiểm thử kết nối Tailscale thật trong lượt viết tài liệu này.

