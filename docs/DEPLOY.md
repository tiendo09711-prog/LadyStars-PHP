# Deploy LadyStars v2

## Source of truth (chỉ sửa ở đây)

- `client/` — React UI  
- `backend/` — Laravel API + `backend/public` (SPA sau build)

**Không** có folder `deploy-upload` làm source. Gói host = **1 file zip**.

## Mỗi lần xong task

```bat
npm run deploy:prepare
```

Lấy file:

```text
artifacts\ladystars-host-code.zip
```

## Upload

1. cPanel → `public_html`  
2. Upload zip → Extract (ghi đè code)  
3. **Giữ** `.env`, `vendor`, database  
4. Ctrl+F5 trên v2  

## Agent

Chỉ sửa `client/` + `backend/`. Không tạo/sửa bản “deploy-upload” song song.
