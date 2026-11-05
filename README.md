# Trợ Đạo: hướng dẫn chơi Vạn Kiếp Tu Tiên realtime

Bảng hướng dẫn luôn chạy cạnh game, tự cập nhật mỗi khi trạng thái đổi:
**việc nên làm ngay**, **lộ trình tối ưu** từ cảnh giới hiện tại tới cảnh giới bạn chọn
(Luyện Khí → Hóa Thần), **phân tích đột phá**, **chỗ tu luyện tốt nhất** quanh đây, và
**chấm điểm từng lựa chọn** khi đang ở một sự kiện hay giao chiến.

Khác với kiểu đọc màn hình của `chess_realtime`, Trợ Đạo đọc thẳng trạng thái game
qua cửa mod chính thức `window.tuTien`, và tính bằng **chính hàm lõi của game**
(`tuTien.core`). Vì vậy tỉ lệ đột phá, tu vi/năm, nơi có chủ, xác suất lựa chọn… khớp
đúng con số game dùng, không phải ước đoán.

Trợ Đạo **chỉ đọc**: mọi phép tính chạy trên bản sao kiếp (`tuTien.game.readCtx()`), không
gọi lệnh đổi trạng thái, không bấm hộ.

## Ba cách chạy

### 1. Cài như mod trong game (khuyên dùng)

1. `python tools/build.py` tạo ra `dist/vkt_tro_dao.zip` (đã có sẵn trong `dist/`).
2. Trong game: **Cấu hình → Mods → Cài mod** → chọn `dist/vkt_tro_dao.zip`, bật, tải lại trang.
3. Bảng **☯ Trợ Đạo** hiện ở góc phải, kéo thanh tiêu đề để dời chỗ. Đóng rồi thì mở lại
   từ nút nổi **Mod** (góc dưới phải) → Trợ Đạo; dòng gợi ý đầu tiên cũng hiện ở ô dock của nút đó.

Chạy ở bất kỳ trình duyệt nào (cả điện thoại), không cần gì thêm. Tùy chọn của mod (màn Mods):
cảnh giới mục tiêu mặc định, tự mở bảng khi vào game.

### 2. Userscript

Cài `dist/vkt_tro_dao.user.js` bằng Tampermonkey / Violentmonkey.

### 3. Monitor ngoài (giống chess_realtime)

```
pip install -r requirements.txt
run.bat
```

Mở một cửa sổ nhỏ **luôn nổi trên cùng** (kể cả khi game không ở phía trước). Bấm `▶` để mở
một Edge riêng có cổng debug vào thẳng game (Edge chặn debug trên hồ sơ mặc định, nên dùng
hồ sơ riêng ở `data/edge-profile`, lần đầu đăng nhập / nạp save ở đó). Game chưa cài mod thì
monitor tự bơm engine Trợ Đạo vào trang. Nút trên thanh tiêu đề: chọn cảnh giới mục tiêu,
`▶` mở Edge, `⏸` tạm dừng, `✕` thoát; kéo thanh tiêu đề để dời, vị trí được nhớ.

## Mới ở bản 1.3

- **Nhãn khuyên chọn trên từng nút của game.** Khung nơi chốn (Khai phủ, Săn yêu, các điện
  tông môn…) và khung sự kiện (mọi lựa chọn) đều có một dòng nhỏ dưới nút:
  `★ NÊN CHỌN` / `✓ được` / `· lời ít` / `✗ TRÁNH` / `↩ rời` / `🔒 khóa`, kèm lý do: tu vi được,
  cống hiến, linh thạch, tỉ lệ thành, mức hiểm trận, thời gian tốn.
- Điểm quy về "năm tu ở chỗ tốt nhất": việc vặt 2 năm được 16 tu vi trong khi bế quan chỗ tốt
  nhất được 20 thì bị trừ. Cống hiến được tính cao hơn khi đang thiếu cống hiến cho món đột phá.
- Hiểu riêng: bảng nhiệm vụ (gợi ý việc nên nhận), khai phủ (so tốc độ động phủ với chỗ tốt nhất),
  linh mạch sư môn (×1,1 → ×1,5 theo cấp bậc, trừ cống hiến/năm), bổng lộc (đã tích bao nhiêu),
  nhập tông khi còn Phàm Nhân (khảo hạch linh căn, tuyển đồ: tính tỉ lệ đậu), món cần mua / đổi.
- Khối "Trợ Đạo" cuối khung nơi chốn: ở đây nên làm gì + việc chính hiện tại.
- Tắt / bật: nút "Tắt nhãn trên nút" ở cuối bảng Trợ Đạo.

## Mới ở bản 1.2

- **Không xung kích khi tỉ lệ thấp.** Tab *Đột phá* tính mức "chuẩn bị đủ" khả thi (đầy Đại viên mãn, 2 đan mạnh nhất,
  chữa chấn tổn, nơi xung tốt nhất, hộ pháp, hạ tâm ma, tâm pháp trợ đột phá, đốt 1 nấc thọ), có tính **ngân sách
  linh thạch / cống hiến kiếm được trong nửa thọ còn lại** (chọn món lời nhất trên mỗi linh thạch). Chỉ khuyên xung
  khi tỉ lệ đã sát mức đó (hoặc thọ không cho chờ). Đứng đúng chỗ bán / ở sư môn và đủ tiền thì nhắc *Mua ngay*.
- **Toàn bản đồ kể cả chỗ còn mây.** Nơi tu, tiệm, mật bí, tông môn đều quét cả vùng chưa khám phá; đích còn mây thì
  dẫn qua ô đã mở gần nhất. Bỏ các nơi bên kia biển (phải đi thuyền).
- **Động phủ tính đúng:** sau khi khai, game lấy linh khí theo nền của ô, Trợ Đạo giả lập trước nên số tu vi/năm khớp thật.
- **Cơ duyên:** nơi có mật bí (truyền thừa cổ tu 1 lần / kiếp, động phủ ẩn), ô nào đang bốc sự kiện được, bí cảnh đang mở.
- **Kinh mạch:** thử mọi cách xếp công pháp / pháp khí đang có trên bản sao, so tốc độ, trợ đột phá, sức đánh, điểm nghịch;
  nút *Áp dụng* để game tự gỡ và đặt lại.
- **Săn an toàn:** chọn "Săn loài khác…" đúng loài game mô phỏng là an toàn (ưu tiên đầu đàn). Đuổi / buông khi địch tháo
  chạy, xử trí kẻ bại, chấm xác suất phải đánh × mức hiểm cho từng lựa chọn sự kiện.
- **Giao diện mới:** thanh tu vi / thọ / tỉ lệ xung, thẻ việc, tab vuốt ngang; trên điện thoại thành bảng trượt đáy (chạm
  tiêu đề để thu gọn), nút ☯ để mở lại; nhãn bản đồ giữ cỡ cố định khi zoom.

## Chỉ đường ngay trên màn hình game

- **Trên bản đồ:** Trợ Đạo vẽ các điểm cần đến. Điểm chính có dấu ➤ và vạch nét đứt nối từ chỗ bạn đứng. Màu theo loại:
  xanh lá = chỗ tu / khai phủ, vàng = chỗ bán món nên mua, xanh dương = sư môn, cam = chỗ săn yêu (khi lịch luyện thấp),
  đỏ = nơi có chủ (đánh thắng thì tu nhanh hơn), tím = nơi có mật bí. Tắt / bật ở cuối tab **Ngay**.
- **Nút 📍 Xem / ➜ Đi tới** cạnh mỗi việc: *Xem* chỉ dời bản đồ tới đó, *Đi tới* làm như bấm nơi đó trên bản đồ (game vẫn hiện hộp xác nhận / tốn thời gian như thường).
- **Trong tiệm:** ô hàng nên mua có viền vàng nhấp nháy và nhãn **★ mua**, rê chuột vào thấy lý do.
- **Tooltip vật phẩm:** thêm một dòng Trợ Đạo (nên mua không, đan đột phá / tu luyện của cảnh giới nào, dùng được bây giờ không).
- **Tab Mua:** danh sách món nên mua (đan chữa chấn tổn, đan đột phá, đan tu luyện đúng cảnh giới, đan phá bình cảnh, đồ hạ tâm ma), giá ở nơi bạn đứng, đủ tiền chưa, và **tiệm nào quanh đây đang thật sự bày bán** (quét hàng theo kỳ hàng của game, ~170 nơi); không ai bán thì ghi nguồn khác (luyện, phần thưởng sơn môn, yêu thú rơi).

## Các tab trong bảng

| Tab | Nội dung |
|---|---|
| **Đột phá** | Bây giờ / ngưỡng / tối đa khả thi, danh sách chuẩn bị (làm được / quá xa), các dòng cộng trừ, đốt thọ. |
| **Cơ duyên** | Mật bí, bí cảnh, trạng thái truyền thừa cổ tu. |
| **Kinh mạch** | Cách xếp tối ưu + nút Áp dụng. |
| **Ngay** | Danh sách việc theo độ ưu tiên: ‼ khẩn (sắp hết thọ, thương nặng thua là chết, chưa có công pháp…), ➤ nên làm (xung kích / bế quan / dời chỗ / vào tông / chọn lựa chọn nào), ⚠ cảnh báo (điểm nghịch, thương thế…), • mẹo (lĩnh bổng lộc, đan trong túi). Cuối tab là bí quyết của giai đoạn hiện tại. |
| **Lộ trình** | Từng chặng tới mục tiêu: tu vi cần (gồm bình cảnh), tu vi/năm ở chỗ tốt nhất an toàn, số năm bế quan, tỉ lệ xung kích ước lượng, số năm thử, tuổi so với thọ. Báo ngay chặng nào hết thọ và **tốc độ tối thiểu** cần có. |
| **Đột phá** | Mọi dòng cộng / trừ tỉ lệ đúng như game tính tại chỗ đang đứng, tỉ lệ khi dùng đan sẵn trong túi (chọn tổ hợp tốt nhất, tối đa 2 loại), tỉ lệ nếu đốt thọ, trận tâm ma nếu có, và **cách tăng tỉ lệ** xếp theo % (đầy tu vi, tháo mảnh điểm nghịch, chữa thương, hạ tâm ma, chữa chấn tổn, động phủ, hộ pháp, đan nên mua và mua ở đâu). |
| **Nơi tu** | Quét mọi địa danh trong bán kính ~320 đơn vị: tu vi/năm nếu ngồi ở đó (động phủ của mình, sư môn, khai phủ mới ×1/×1,15/×1,25, hay ngoài trời), linh khí, độ hiểm, thời gian đi. Kèm danh sách **nơi có chủ** (đánh thắng thì khai phủ ×1,1, tốc độ nếu thắng) và **nơi có mật bí** chưa ghé (truyền thừa cổ tu, động phủ ẩn). |
| **Sự kiện** | Khi đang ở một sự kiện: từng lựa chọn kèm xác suất thành, được gì, mất gì, mức hiểm nếu đánh, và ➤ lựa chọn nên chọn. Khi đang giao chiến: dự kiến trận, khuyên đánh / chạy, đồ nên ném khi bỏ chạy (rẻ, không phải đan quý). Tiệm, bảo khố… không chấm. |

## Engine dùng hàm nào của game

| Việc | Hàm lõi |
|---|---|
| Tỉ lệ đột phá, nguồn tỉ lệ, đốt thọ, đan dùng được, tâm ma | `progress/dot_pha.chuanBiDotPha(ctx, {dan, thieuDot})` |
| Tu vi/năm chỗ đang ngồi, đan tu luyện dùng được | `progress/be_quan.chuanBiBeQuan(ctx)` |
| Linh khí ở một nơi bất kỳ, loại chỗ ngồi | `progress/be_quan.linhKhiTai`, `loaiChoBeQuan` |
| Tốc độ tu luyện, thọ tối đa, bình cảnh | `character/character.tocDoTuLuyen`, `thoNguyenToiDa`, `atBottleneck` |
| Khai phủ được không, hệ số động phủ | `progress/dong_phu.lyDoKhongLap`, `HE_SO_DONG_PHU` |
| Chủ của nơi, đã bị đánh bại chưa | `world/wild_master.wildMasterAt`, `isWildMasterVacant` |
| Mật bí, loại nơi | `world/noi.coMatBi`, `placeKind` |
| Độ hiểm | `encounter/do_hiem.doChenh`, `mucHiem` |
| Thời gian đi đường | `world/travel.travelYears` |
| Bảng cảnh giới, tu vi mỗi tiểu cảnh giới | `kernel/realms.canhGioi`, `tuViCan` |
| Lịch luyện | `progress/lich_luyen.lichLuyen`, `namLichLuyenCon` |
| Điểm nghịch, công pháp thông | `character/kinh_mach.tinhKinhMach` |
| Tông môn: thăng cấp, bổng lộc, sắp bị xóa tên | `progress/tong_mon.thieuDeThangCap`, `bongLoc`, `yearsUntilExpelled` |
| Món mua / nhận ở đâu | `world/lookup.itemSources` |
| Sự kiện đang mở, xác suất check, mức hiểm trận | `game.encounterView()`, `kernel/checks.checkChance` |
| Dự kiến trận đang mở | `game.duKienTran()` |

Hàm nào bản game mới đổi tên thì khối đó tự ẩn, phần còn lại vẫn chạy.
So `/mod/tu-tien.d.ts` hai bản để biết game đổi gì.

## Giả định của lộ trình

- Ngồi ở chỗ tốt nhất **an toàn hoặc ngang sức** tìm được, giữ tốc độ tu luyện hiện tại.
  Linh khí từng chặng tính lại theo bậc cảnh giới (cùng một chỗ, lên cao thì loãng đi).
- Tỉ lệ xung kích: chặng hiện tại lấy đúng tỉ lệ game tính (cộng 10% nếu còn "chưa viên mãn");
  chặng sau: gốc + động phủ + công pháp + 2 đan mạnh nhất cho cảnh giới đó.
- Mỗi lần hỏng tốn thời gian xung kích + ~4 năm hồi phục.
- Chưa tính đan tu luyện, mật bí, và lịch luyện cạn (cạn thì ×0,5).

## Phát triển

- `mod/vkt_tro_dao/main.js`: toàn bộ engine + giao diện (một file, game chỉ nạp chắc `main.js`).
- `node tools/dev_reload.mjs`: nạp lại bản đang sửa vào tab game (Edge có cổng debug 9222).
  `node tools/dev_reload.mjs eval "window.__vktTroDao.snapshot()"` xem kết quả thô.
- `python tools/build.py`: đóng gói `dist/`.
- `monitor/vkt_monitor/`: monitor Python (`cdp.py` nói chuyện với Edge, `bridge.py` bơm engine
  và đọc `window.__vktTroDao.snapshot()`, `hud.py` vẽ cửa sổ).
- Cấu hình monitor ở `data/config.json`: `port`, `poll_ms`, `target`, `inject`, `edge_path`, `max_lines`.
