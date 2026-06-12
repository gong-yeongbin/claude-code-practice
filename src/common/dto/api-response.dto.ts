// 모든 HTTP 응답을 통일하는 공통 응답 구조 인터페이스
export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string | string[];
  data?: T;
  error?: string;
  timestamp: string;
  path: string;
}
