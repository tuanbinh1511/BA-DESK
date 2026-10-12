# Bước 4 — Kết nối ổn định giữa giao diện và Mac

Đã triển khai trong `/Users/tuanbinh1511/WorkSpace/BA-DESK`.

- Trạng thái: đang kết nối, đã kết nối, mất kết nối/chỉ đọc, không có quyền.
- Khi mất kết nối: giữ dữ liệu đã tải trong tab và thời điểm cập nhật; không chuyển sang dữ liệu mẫu. Tải lại cả trang khi Mac đang offline sẽ không có dữ liệu cũ: tin nhắn thật không được lưu thêm vào localStorage.
- Khi bị 401/403: ẩn dữ liệu và đóng chi tiết công việc/báo cáo.
- Các thao tác ghi bị chặn khi chưa kết nối. Nếu mất mạng trong lúc gửi, thông báo chưa xác nhận kết quả; kiểm tra dữ liệu sau khi kết nối lại trước khi gửi lần nữa. Không tự gửi lại thao tác ghi.
- Khi tab hiển thị: cập nhật sau 5 giây; thất bại giãn nhịp lên 10, 20, tối đa 30 giây. Tab ẩn sẽ tạm dừng, khi trở lại hoặc có mạng sẽ kiểm tra lại.
- Yêu cầu đọc hết thời gian sau 12 giây; ghi thông thường sau 60 giây. Tạo báo cáo cho phép tối đa 15 phút vì đang chờ phân tích AI. Dừng chờ ở giao diện không đảm bảo công việc trên Mac đã dừng.
- AI và SQLite vẫn trên Mac. Mac tắt/ngủ thì giao diện không thể lấy dữ liệu hay kích hoạt công việc mới.

## Chạy bản mới

1. Dừng backend cũ trong Terminal bằng Ctrl+C để tránh hai phiên Telegram.
2. Mở Terminal tại thư mục mới:

```sh
cd /Users/tuanbinh1511/WorkSpace/BA-DESK
npm run build
npm run start:remote
```

3. Trong Terminal khác, chạy Tailscale Serve (nếu chưa bật HTTPS, mở liên kết Tailscale yêu cầu và hoàn tất trên tài khoản của bạn):

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg http://127.0.0.1:8000
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve status
```

4. Mở `https://macbook-pro-ca-dang.tail4cfbc8.ts.net` trên Mac và điện thoại đã đăng nhập cùng mạng Tailscale. Kiểm tra mất kết nối/bật lại trước khi deploy Vercel.

Giao diện trên Mac: `http://127.0.0.1:8000/`. Backend tiếp tục dùng cấu hình Tailscale ở bước 3. Khi deploy UI riêng dùng `npm run build:remote`; cần hoàn tất HTTPS/Tailscale Serve trước khi domain kết nối được.

## Kiểm tra

```sh
npm run test:connection
npm run build
npm run build:remote
```

Đã kiểm tra trên backend riêng với dữ liệu giả: mất kết nối vẫn giữ task, chặn cập nhật không phát sinh POST/PATCH, 403 ẩn dữ liệu, kết nối lại tải được dữ liệu. Desktop và viewport 390×844 không tràn ngang ở cảnh báo kết nối. Chưa xác minh kết nối từ domain Vercel qua Tailscale thực tế.
