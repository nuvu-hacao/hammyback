/* Cấu hình HammyBack.
   Dán Client ID (loại "Web application") từ Google Cloud Console vào giữa hai dấu nháy.
   Client ID là thông tin công khai, để ở đây là an toàn.
   KHÔNG BAO GIỜ dán client secret, API key hay token vào file này. */
window.HAMMY_CONFIG = {
  clientId: '110635684955-sdgpbue2of71il5sj86rdeug63k4rssd.apps.googleusercontent.com',
  /* 'auto' (khuyên dùng): iPhone đã cài lên màn hình chính → chuyển trang, nơi khác → cửa sổ popup.
     Chỉ đổi sang 'redirect' nếu đăng nhập bằng popup bị lỗi trên máy nào đó. */
  authMode: 'auto'
};
