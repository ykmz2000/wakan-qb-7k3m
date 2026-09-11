# 画像・PDFと資料カード

画像とPDFは、既存の問題・解説・個人メモの添付順で混在できます。PDFのページは1添付の内部で移動します。PDF原本のページ順を変更する機能ではありません。

## 追加方法

ライブラリに複数ファイルを追加するときは、端末・クリップボード・最近のファイルのどの経路でも登録前に選択します。

- **別々のカードに追加**：1ファイルにつき1カード。
- **1つのカードにまとめる**：選択順に1カードのメンバーとして登録。
- **キャンセル**：アップロードせず戻る。

既存カード内の「このカードにファイルを追加」は、そのカードへの追加です。既存のセットはカードとして引き続き表示します。過去のメンバーID・添付コピー・使用履歴を削除しません。

ファイル形式は画像またはPDF、上限は1ファイル100MiBです。50MiB超は処理を止めず、通信に時間がかかる案内を出します。PDFの貼り付けはブラウザーがファイルとして提供する場合に対応します。提供されない環境ではファイル選択を利用します。通常の文字入力欄のペーストは保持します。

## 表示と編集

PDFカードは1ページ目とページ数を表示します。専用ビューアーには前後移動・ページ選択・拡大を用意し、ページサムネイルは現在ページ付近だけ描画します。原本を画像へ置換しません。画像編集にPDFを追加すると、選択した1ページをPNGとして独立素材にします。問題の画像化・単元PDF出力では添付PDFの1ページ目を使用し、総ページ数と全体の参照先がアプリであることを明記します。

画像編集は「全体をトリミング」と「選択画像をトリミング」を分離します。後者は追加画像を1つ選択したときだけ表示します。切り抜きは編集履歴に範囲を保持するため、途中保存は不要です。元画像と追加素材を保ち、Undo/Redoで範囲を戻せます。PNG保存は元ピクセル密度を使ったタイルエンコードです。

## 配備と検証

`scripts/build-inline-overview.cjs` は固定版 pdfjs-dist 6.3.289 の旧ブラウザー用ディスプレイ層・worker・CMaps・標準フォント・WASMを `vendor/pdfjs/` にコピーします。生成ファイルはPagesの成果物に含みます。

`supabase/file-media-v1.sql` は既存コピーRPCの拡張子検査にPDFを追加し、対象3バケットの許可MIMEにapplication/pdfを追加します。公開状態、100MiB上限、RLSや所有者の条件、既存の問題・解答・画像紐付けを変更しません。

新規ブラウザーテスト：`file-media.browser.cjs`、`library-file-batch.browser.cjs`、`image-crop-scene.browser.cjs`。ChromiumとWebKitの両方で検証します。実機iPad、OSからのPDFクリップボード、100MiB実ファイル通信は別途確認対象です。


## PDF page reading and organization (2026-09-11)

- Inline attachment PDFs expose every page in order. Each page is keyboard focusable and opens that exact page. Render near the viewport at display width × device pixel ratio (up to 3), bounded by 8 million pixels/8192 pixels per edge. Offscreen bitmaps are released. Library grid covers remain bounded.
- Popup previous/next traverses pages, then adjacent attachments within the same media group. Reverse navigation into a PDF starts on its last page. Original row order and independent duplicate rows are retained.
- PDF editor provides page selection, move earlier/later, and insertion after the current page from blank, image files, or PDF files. Source pages and editable overlays are remapped together; imported app PDFs retain their editable overlays. Page operations validate a replacement before committing it.
- Viewer trackpad handling supports Ctrl/Meta wheel and native gesture events, with deduplication. Crop editor receives the same zoom input. Browser zoom shortcuts outside media surfaces remain unchanged.
- Browser regressions cover inline page selection, mixed-media boundaries, PDF order and editable import persistence, wheel zoom and native gesture cancellation. Physical Mac trackpad behavior still requires a real-device check.

## Touch navigation and bounded previews

Inline PDF pages keep their aspect ratio within 380 × 400 CSS pixels and available width, without a viewer backdrop. They still render from the PDF at display density. In PDF and image viewers, one-finger horizontal swipes navigate even while zoomed; two fingers pan/pinch. Lifting one finger after a pinch cannot trigger a swipe. Single-finger double-tap zoom is disabled; zoom buttons and trackpad gestures remain available.

PDF annotation dialogs provide previous/next page buttons. Navigation applies the current editable overlay to the pending document and opens the next page directly; returning restores editable items. The final PDF save persists the document. Recent-file PDF cards are passive previews: a tap selects and a long press opens details.

PDF page organization uses a dedicated thumbnail dialog: drag handles reorder, thumbnail taps select multiple pages, delete keeps at least one page, and undo/cancel preserve the draft. Apply remaps original pages and editable overlays together.
Eraser removes whole strokes or annotation objects while skipping image objects; selected photos remain deletable with Delete. Erasing is undoable.
