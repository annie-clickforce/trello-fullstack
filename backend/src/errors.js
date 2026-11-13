// 帶 HTTP 狀態碼的錯誤。在處理函式裡 throw，由 errorHandler 轉成 API 的錯誤格式。
export class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
