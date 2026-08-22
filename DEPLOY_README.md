# نشر النظام المحاسبي على GitHub Pages (مجاني ومستدام)

الرابط النهائي بعد النشر:
**https://qassy1141981-debug.github.io/alsafa-accounting/**

## الخطوات

### 1) إنشاء الـ Repo
- على GitHub، اعمل repository جديد باسم: `alsafa-accounting`
- خليه **Public** (مطلوب لـ GitHub Pages المجاني)

### 2) رفع الكود
```bash
git init
git add .
git commit -m "Initial commit - نظام محاسبي مستقل"
git branch -M main
git remote add origin https://github.com/qassy1141981-debug/alsafa-accounting.git
git push -u origin main
```

### 3) تفعيل GitHub Pages
- روح على: Settings → Pages
- تحت "Build and deployment" اختار Source: **GitHub Actions**
(الـ workflow جاهز أصلاً في `.github/workflows/deploy.yml`)

### 4) إعداد Convex (الباك اند - خاص بيك بالكامل، مستقل عن Hercules)
1. اعمل حساب مجاني على https://convex.dev بحسابك أنت
2. من جهازك، جوه مجلد المشروع:
   ```bash
   npx convex login
   npx convex deploy
   ```
3. هياخدلك رابط زي: `https://xxxxx.convex.cloud`
4. استورد بيانات التراخيص القديمة (من ملف الـ snapshot):
   ```bash
   npx convex import --table licenses licenses/documents.jsonl
   ```

### 5) ربط الرابط بمشروع GitHub
- روح على: Settings → Secrets and variables → Actions
- ضيف Secret جديد:
  - Name: `VITE_CONVEX_URL`
  - Value: الرابط اللي أخدته من Convex (`https://xxxxx.convex.cloud`)

### 6) كل تعديل بعد كده
أي `git push` على branch `main` هيبني وينشر تلقائيًا من غير أي تدخل يدوي.

---
**ملاحظة أمان:** كلمة سر لوحة الإدارة (`ADMIN_PASSWORD`) موجودة كنص واضح في `convex/licenses.ts`.
متنسيش تغيّرها لكلمة سر خاصة بيك قبل النشر، ومتشاركش الـ repo لو هيبقى فيه بيانات حساسة.
