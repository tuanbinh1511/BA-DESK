# BA Desk — Rõ việc, nhẹ đầu

Không gian làm việc cá nhân cho Business Analyst: tổng hợp Telegram theo ngày, giữ ngữ cảnh gốc, theo dõi việc được giao và tin cần phản hồi. Giao diện React + TypeScript + Vite; máy chủ Python + FastAPI + Telethon; lưu cục bộ bằng SQLite.

## Truy cập riêng qua Tailscale — đã cấu hình bước 3

Frontend hỗ trợ `VITE_API_BASE_URL`; backend có chế độ `tailscale`, kiểm tra danh tính do Tailscale Serve cung cấp và chỉ chấp nhận host/origin đã cấu hình. Chế độ local mặc định vẫn hoạt động. Dữ liệu, phiên Telegram và AI nằm trên Mac.

Cấu hình riêng của máy nằm trong `.local/remote.env` (backend) và `.env.remote.local` (frontend), được bỏ qua bởi Git. Domain chính thức là `https://ba-desk.vercel.app`. Khi đổi hostname, tài khoản Tailscale hoặc domain, sửa cấu hình tương ứng và khởi động lại backend; đổi biến Vite cần build/deploy lại.

`BA_DESK_TAILSCALE_LOGIN` là chủ sở hữu với quyền quản lý. `BA_DESK_TAILSCALE_ADMINS` là danh sách email Tailscale cách nhau bằng dấu phẩy có toàn quyền sử dụng workspace chung, bao gồm chỉnh sửa dữ liệu, cấu hình Telegram/bot và chạy AI; mặc định rỗng. `BA_DESK_TAILSCALE_VIEWERS` là danh sách email có quyền chỉ xem, mặc định rỗng. Người truy cập cần nhận lời mời chia sẻ Mac qua Tailscale. Giao diện chưa ẩn các nút theo vai trò; thao tác của người xem bị chặn sẽ báo chỉ có quyền xem.

Từ lần gộp project, `BA-DESK` là thư mục chính cho code, database, Telegram session và cấu hình quyền. Đường dẫn `tool-telegram` cũ là liên kết tới `BA-DESK`; bản thư mục cũ được lưu trong `.ba-desk-migration-backups` bên ngoài project.

Trong project BA-DESK, dừng backend cũ ở cổng 8000 trước rồi chạy:

```bash
npm run start:remote
```

Terminal khác, cấu hình Serve cho riêng BA Desk:

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg http://127.0.0.1:8000
```

Nếu CLI yêu cầu bật HTTPS, hoàn tất yêu cầu qua liên kết chính thức được CLI trả về. Serve chỉ dành cho mạng riêng; không dùng cấu hình này với Funnel. Mở `https://macbook-pro-ca-dang.tail4cfbc8.ts.net` bằng thiết bị đang bật Tailscale. Truy cập trực tiếp localhost bị chặn trong chế độ remote vì thiếu danh tính Serve.

Để thử giao diện Vite riêng:

```bash
npm run dev:ui:remote
```

Mở `http://127.0.0.1:5173` trên Mac. Lệnh `npm run build:remote` tạo giao diện trỏ đến HTTPS API để deploy Vercel; `npm run build` vẫn tạo bản local. Không chạy thêm `npm run dev` khi backend remote đã chạy.

Node.js 22+ được khuyến nghị. Nếu Terminal đang dùng Node 20.10, chạy `nvm use 22` nếu có nvm, rồi kiểm tra `node --version`. Bộ test dùng database tạm: test local luôn ép chế độ local, test remote kiểm tra CORS/danh tính/giới hạn riêng. Xem thêm [hướng dẫn triển khai](DEPLOYMENT_GUIDE.md).

## Chạy local

Yêu cầu Node.js 22+ và Python 3.11+.

```bash
npm install
python3 -m venv .venv
.venv/bin/python -m pip install -r server/requirements.lock.txt
npm run dev
```

Mở **http://127.0.0.1:5173**. Lệnh dev chạy cả giao diện và API; dùng Ctrl+C để dừng. Hai cổng mặc định là 5173 và 8000.

Nếu chưa kết nối, bạn thấy **dữ liệu mẫu có nhãn Trải nghiệm**. Những thay đổi trong chế độ này lưu trong trình duyệt và được làm mới vào ngày tiếp theo. Để dùng với dữ liệu thật, vào **Cài đặt & tích hợp**, chọn một trong ba cách:

- **Kết nối tài khoản** Telegram.
- **Nhập file JSON** Telegram Desktop.
- **Dùng không gian trống** để tạo việc và lịch thật trước khi kết nối Telegram.

## Kết nối Telegram

1. Lấy API ID và API Hash tại [my.telegram.org/apps](https://my.telegram.org/apps).
2. Nhập API ID, API Hash và số điện thoại dạng `+84…` trong ứng dụng.
3. Nhập mã Telegram; nếu tài khoản có xác minh hai bước, nhập mật khẩu tại giao diện.
4. Tin hôm nay tự tải sau khi kết nối, rồi cập nhật mỗi **5 phút**. Để lấy ngày cũ, vào **Hộp thư Telegram**, chọn ngày và nhấn **Đồng bộ Telegram**.

Ứng dụng tải nội dung tin từ mọi hội thoại bạn có quyền truy cập: nhóm, cá nhân, kênh, bot và Saved Messages. Tin được lưu trong SQLite theo ngày Việt Nam; không cắt im lặng sau một số lượng tin cố định. Chỉ tin từ nhóm/cá nhân được phân tích thành việc được giao. Khi đọc ngày cũ, ứng dụng đọc thêm những tin sau ngày đó để kiểm tra reply muộn. Lúc chuyển ngày, ứng dụng đọc bù ngày hôm qua trước khi lấy hôm nay. Khi Telegram giới hạn tốc độ, ứng dụng đợi theo thời gian Telegram yêu cầu.

Lịch sử đầy đủ dùng API của tài khoản người dùng, vì [`messages.getHistory` chỉ dành cho user](https://core.telegram.org/method/messages.getHistory). Bot riêng dùng để gửi báo cáo và lời nhắc cho bạn. **Xác nhận đã phản hồi** chỉ thay đổi trạng thái trong BA Desk; ứng dụng không tự trả lời, sửa/xóa tin hoặc đánh dấu đã đọc trong hội thoại công việc.

## Nhận thông báo qua bot Telegram

1. Kết nối tài khoản Telegram cá nhân như trên.
2. Mở [@BotFather](https://t.me/BotFather), gửi `/newbot` và làm theo hướng dẫn để lấy bot token. Xem [hướng dẫn Telegram](https://core.telegram.org/bots/features#botfather).
3. Mở bot vừa tạo bằng **chính tài khoản đã kết nối** và nhấn **Start**.
4. Vào **Cài đặt & tích hợp → Thông báo qua Telegram**, nhập token và bấm **Kết nối bot**. Không cần tìm hoặc nhập Chat ID: máy chủ xác minh người nhận là bạn.
5. Bấm **Gửi thử**, rồi bật **Gửi báo cáo & lời nhắc qua bot** và lưu thiết lập.

Bot gửi báo cáo ngắn theo người, ưu tiên việc cần xử lý/phản hồi, cùng lời nhắc hạn công việc/cuộc hẹn bằng [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage). Nội dung dài được chia thành nhiều tin. Bot token không được trả về giao diện hay lưu trong trình duyệt. Có thể ngắt bot độc lập; ngắt tài khoản Telegram cũng xóa cấu hình bot.

Trạng thái gửi và từng phần báo cáo được lưu trên máy. Khi lỗi mạng hoặc giới hạn gửi, ứng dụng chờ rồi thử lại; phần đã được xác nhận gửi thành công không gửi lại. Bot API không có khóa chống trùng: nếu Telegram đã nhận tin nhưng phản hồi bị mất, lần thử lại có thể trùng một tin. Chỉ những thông báo từ ngày kết nối bot trở đi được đưa vào hàng chờ.

## Nhập lịch sử

Telegram Desktop → Settings → Advanced → Export Telegram data → chọn **JSON**. Bạn cũng có thể dùng **Export chat history** của một chat.

Chọn file tối đa 10 MB, ngày phân tích, User ID và username của bạn. User ID xác định tin bạn gửi; có thể bỏ trống nếu file export có `personal_information.user_id`. Username giúp nhận diện `@username` trong nhóm. Có thể nhập nhiều file; ID nguồn giúp không tạo việc trùng.

## Việc, phản hồi và báo cáo

- Nhận diện yêu cầu có động từ giao việc/câu hỏi trong tin nhắn riêng, tin nhắc đến bạn và reply đến tin của bạn trong nhóm.
- Giữ nguyên tin gốc, các tin gần trong khoảng 30 phút và reply trực tiếp để đối chiếu. Khi tin trong ngày reply đến tin cũ, ứng dụng lấy thêm tin cha để không bỏ sót ngữ cảnh từ ngày trước.
- **Đã phản hồi**: có bằng chứng câu trả lời đúng nội dung từ AI, reply trực tiếp khi chưa có AI, hoặc bạn xác nhận thủ công.
- **Cần xác nhận**: tin nhắn riêng có tin bạn gửi sau yêu cầu, nhưng chưa có reply trực tiếp. Không tự kết luận nội dung đó đã được trả lời.
- **Chưa phản hồi**: chưa tìm thấy các dấu hiệu trên.
- Hoàn thành công việc và phản hồi là hai trạng thái độc lập. Việc đã làm nhưng chưa trả lời vẫn được nhắc; việc hoặc phản hồi còn mở từ ngày trước được đưa vào ngày tiếp theo.
- Có thể tạo việc thủ công, đổi ưu tiên/trạng thái, nhắc lại sau một giờ, đặt cuộc hẹn và xuất báo cáo Markdown.
- 6 mẫu BA có thể chỉnh sửa, sao chép hoặc tải: User story/AC, meeting notes, UAT, clarification, change request, risk/decision log.

Nhận diện ban đầu dùng quy tắc tiếng Việt/tiếng Anh trên máy; phân tích sâu dùng Codex/ChatGPT nếu được bật (xem bên dưới). Deadline dạng `14h30`, `14:30`, `9h ngày mai` được nhận diện; hạn mơ hồ được để trống. Nội dung ảnh, tài liệu, audio và secret chat chưa được phân tích. Yêu cầu có cách diễn đạt khác có thể cần bạn tự thêm công việc.

## Lịch nhắc

Mặc định **08:30** và **17:00**, múi giờ **Asia/Ho_Chi_Minh**. Bạn có thể sửa giờ hoặc tạm dừng trong Cài đặt.

- Buổi sáng: đồng bộ Telegram khi đã kết nối, tổng hợp việc còn mở và phản hồi còn chờ.
- Cuối ngày: đồng bộ và ghi lại phần chưa hoàn thành.
- Nhắc khi đến hạn công việc/giờ nhắc lại và trước cuộc hẹn 10 phút.
- Bộ lịch kiểm tra mỗi 30 giây; mỗi báo cáo/nhắc hạn có ID cố định để tránh lặp. Nếu máy chủ khởi động muộn, báo cáo của các khung giờ đã qua trong ngày được tạo bù một lần.
- Dùng dữ liệu import thì báo cáo dựa trên lịch sử đã nhập, cần nhập lại hoặc kết nối để cập nhật reply mới.
- Tự tải tin và gửi qua bot có công tắc riêng, độc lập với bật/tắt lịch báo cáo. Nếu một hội thoại mất quyền đọc, báo cáo vẫn được tạo từ dữ liệu đọc được và ghi rõ phần chưa đầy đủ.

**Máy chủ phải đang chạy và máy tính phải thức để thực hiện lịch, tải tin và gửi bot.** Có thể đóng giao diện: máy chủ vẫn đồng bộ, tạo báo cáo và gửi Telegram. Thông báo cũng lưu trong biểu tượng chuông. Thông báo desktop cần quyền Notification và giao diện đang mở. Để điện thoại phát âm thanh/rung, bật thông báo cho bot trong Telegram.

Để chạy bản build với một máy chủ:

```bash
npm run build
npm start
```

Mở **http://127.0.0.1:8000**. Có thể để lệnh này chạy trong một terminal riêng trong giờ làm việc.

## Dữ liệu và phiên đăng nhập

SQLite, API credentials, session Telegram và bot token nằm trong `.local/`, được bỏ qua bởi Git. Trên hệ thống Unix, thư mục được tạo với quyền `700`, tệp cơ sở dữ liệu/session/config với quyền `600`. Mã xác minh và mật khẩu 2FA không được lưu. **Session Telegram, API Hash và bot token là dữ liệu nhạy cảm**; không chia sẻ hoặc commit thư mục này.

Ứng dụng bind vào `127.0.0.1`, chặn Host/Origin bên ngoài. Thiết kế cho một người trên máy cá nhân; chưa có đăng nhập ứng dụng hoặc cơ chế phục vụ nhiều người. Không đưa API này ra Internet. Ngắt kết nối thu hồi phiên Telegram nhưng giữ công việc/lịch/báo cáo cục bộ.

## Kiểm tra

```bash
npm run build
npm test
```

Test dùng cơ sở dữ liệu và API riêng trong thư mục tạm, không cần đăng nhập Telegram. Bao gồm nhận diện yêu cầu/reply, timezone, reply muộn, chống trùng, giữ trạng thái qua lần đồng bộ, báo cáo/nhắc lịch không lặp, xác thực đầu vào, nguồn truy cập cục bộ và vòng đời việc thủ công. Thao tác chính đã được kiểm tra trên trình duyệt ở desktop, laptop và mobile; kết nối Telegram thật cần credentials của bạn.

## Nâng cấp phân tích theo người và tài khoản

Dữ liệu Telegram được ràng buộc với **Telegram User ID đã xác minh**. Đổi tài khoản trong Cài đặt mở quy trình đăng nhập mới; chỉ sau khi xác minh thành công, ứng dụng thay tin nhắn, công việc Telegram, báo cáo, nhóm và cache AI của tài khoản cũ. Công việc thủ công và lịch cá nhân được giữ. Các thao tác từ giao diện cũ bị chặn bằng account revision. Lần nâng cấp đầu tiên, dữ liệu chưa xác định chủ sở hữu được lưu vào một bản phục hồi `.local/legacy-*.sqlite` có quyền `600`, rồi tải lại tài khoản đã xác minh. Bot chỉ được giữ khi người nhận khớp tài khoản mới.

**Nhóm Telegram** liệt kê cả nhóm đang hoạt động và nhóm cũ trong danh sách hội thoại. Bỏ qua nhóm loại công việc khỏi danh sách, AI, báo cáo mới và nhắc hạn; tin gốc vẫn tải/tra cứu được. Theo dõi lại khôi phục công việc đã có. Báo cáo cũ là snapshot tại thời điểm tạo.

### AI dùng đăng nhập ChatGPT đang có

Ứng dụng gọi **Codex CLI** bằng đăng nhập ChatGPT hiện có, mặc định **GPT-6-Luna / low**; có thể đổi sang GPT-6-Sol hoặc GPT-6.1-Sol. Không cần OpenAI API key riêng. Đây là cách dùng model qua Codex với tài khoản ChatGPT, không tự điều khiển trang web ChatGPT. Cần `codex` trên PATH và `codex login status` báo đã đăng nhập bằng ChatGPT. Xem [tài liệu non-interactive Codex](https://learn.chatgpt.com/docs/non-interactive-mode).

AI chạy trước báo cáo sáng/chiều, khi tạo báo cáo, hoặc khi bấm **Phân tích lại / Phân tích hội thoại trong ngày**. Chỉ gửi tin trong ngày đã chọn theo giờ Việt Nam đến AI, từ các hội thoại cá nhân và nhóm được theo dõi. Không kéo yêu cầu cũ, tin trước ngày hoặc phản hồi ngày sau vào lượt phân tích. Công việc cũ vẫn nằm trong Công việc để theo dõi độc lập. Cache chia phần theo model, account revision và nội dung, dùng lại phần không đổi. Nội dung trong ngày được gửi đến model qua Codex, sử dụng hạn mức Codex của tài khoản ChatGPT. Có thể tắt AI tự động; nút phân tích thủ công vẫn dùng được.

Kết quả gồm tóm tắt, trạng thái phản hồi, lý do, message IDs làm chứng cứ, bước tiếp theo và bản nháp trả lời để sao chép. Tin trả lời phải do bạn gửi, trong cùng chat và sau yêu cầu. Lời xác nhận nhận việc không mặc nhiên trả lời câu hỏi nghiệp vụ. Yêu cầu không liên quan công việc có thể được AI loại khỏi danh sách, tin gốc vẫn giữ. Tin mới hoặc tin được sửa làm kết quả cũ trở thành cần phân tích lại. AI chỉ **đề xuất hoàn thành**, không tự đóng việc; xác nhận phản hồi thủ công được giữ qua các lần đồng bộ. Kết quả AI vẫn có thể sai: kiểm tra tin gốc trong Chi tiết công việc.

Báo cáo và danh sách yêu cầu gom theo Telegram sender ID; mỗi yêu cầu giữ giờ nhận, dự án, hạn, trạng thái phản hồi và trạng thái công việc riêng. Bộ lọc có quá hạn, cần phản hồi và đề xuất hoàn thành. Báo cáo chỉ gồm yêu cầu phát sinh trong ngày đã chọn; mỗi yêu cầu một dòng ngắn, chi tiết mở khi cần. Việc đã hoàn thành nhưng chưa trả lời vẫn được nhắc. Các báo cáo được hiển thị có cấu trúc theo người và xuất Markdown.

**Bộ công cụ BA** có 16 prompt chuyên sâu có thể điền bối cảnh/sao chép, bên cạnh 6 mẫu tài liệu: discovery, BRD, FRD/SRS, stories/AC, AS-IS/TO-BE/BPMN, API, data/migration, UAT, RTM, change impact, meeting actions, Telegram review, backlog, requirement review, stakeholder escalation và daily report. Giao diện có chuyển trang, disclosure, phản hồi trạng thái và tiến trình AI; hỗ trợ reduced motion.


### Tài liệu & liên kết

Kho tự lưu tên file đính kèm, link (kể cả link có nhãn trong tin), tên file/đường dẫn được nhắc và ngữ cảnh trao đổi. Tìm nhiều từ cùng lúc trên tên file, người gửi, hội thoại, nội dung và đường dẫn; không phân biệt dấu tiếng Việt. Lọc loại tài liệu, người gửi, hội thoại, chiều gửi/nhận và khoảng ngày trên toàn bộ dữ liệu đã đồng bộ. Mỗi kết quả giữ mã tin gốc, ngày giờ và nội dung chính xác; cùng link gửi ở hai cuộc trò chuyện giữ hai nguồn riêng. Nhóm bỏ qua vẫn tra cứu được; đổi tài khoản xóa chỉ mục cũ cùng dữ liệu Telegram cũ.

Tên được nhắc trong tin được ghi rõ khác với file đính kèm. Tin nhóm có link mở tin gốc, tin cá nhân có thể mở hội thoại khi có username và sao chép tên/ngữ cảnh để tìm trong Telegram. Kho lưu metadata và nguồn, không tải binary hay đọc nội dung bên trong file. Tên file đính kèm của tin đã tải bằng phiên bản cũ được bổ sung khi đồng bộ lại ngày đó hoặc nhập export có metadata.

Giao diện bổ sung chuyển động 3D cho mở tài liệu và hộp thoại; menu cuộn riêng và giữ nút Cài đặt trong màn hình thấp. Các hiệu ứng có đường xử lý reduced motion, không có vòng lặp trang trí.
