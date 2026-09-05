# Supabase Auth メール設定（定期テスト対策QB）

対象プロジェクト: `qebvqcubtyfgaakrzbzh`

## 1. URL Configuration
Supabase Dashboard → Authentication → URL Configuration

- Site URL
  `https://ykmz2000.github.io/wakan-qb-7k3m/`

- Redirect URLs に追加
  `https://ykmz2000.github.io/wakan-qb-7k3m/**`

localhost が Site URL になっている場合は上記へ変更する。

## 2. Confirm signup メール
Supabase Dashboard → Authentication → Email Templates → Confirm signup

### Subject
`【定期テスト対策QB】メールアドレスの確認`

### Body
```html
<h2>定期テスト対策QBへようこそ</h2>
<p>新規登録ありがとうございます。</p>
<p>下のボタンを押してメールアドレスを確認すると、登録が完了します。</p>
<p style="margin:24px 0;">
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#126fb3;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:bold;">
    メールアドレスを確認して登録を完了する
  </a>
</p>
<p>このメールに心当たりがない場合は、そのまま破棄してください。</p>
<p style="color:#6f7786;font-size:12px;">定期テスト対策QB</p>
```

## 3. アプリ側
`auth.js` の `signUp` でも `emailRedirectTo` を本番URLに固定済み。

`https://ykmz2000.github.io/wakan-qb-7k3m/`

これにより、メール内の認証リンクを開いた後も localhost ではなく本番サイトへ戻る。