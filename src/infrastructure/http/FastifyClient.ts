import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";

export interface ApiConfig {
  baseURL: string;
  timeout?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class FastifyClient {
  private axiosInstance: AxiosInstance;
  private authTokens: AuthTokens | null = null;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  constructor(config: ApiConfig) {
    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - Add auth token
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.authTokens?.accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${this.authTokens.accessToken}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - Handle token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If error is 401 and we haven't tried to refresh yet
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // Wait for the token refresh to complete
            return new Promise((resolve) => {
              this.refreshSubscribers.push((token: string) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(this.axiosInstance(originalRequest));
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newTokens = await this.refreshAccessToken();
            this.isRefreshing = false;

            // Notify all waiting requests
            this.refreshSubscribers.forEach((callback) =>
              callback(newTokens.accessToken)
            );
            this.refreshSubscribers = [];

            // Retry original request
            originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            this.isRefreshing = false;
            this.refreshSubscribers = [];
            // Clear tokens and redirect to login
            this.clearAuth();
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessToken(): Promise<AuthTokens> {
    if (!this.authTokens?.refreshToken) {
      throw new Error("No refresh token available");
    }

    try {
      const response = await axios.post(
        `${this.axiosInstance.defaults.baseURL}/api/auth/refresh`,
        {
          refreshToken: this.authTokens.refreshToken,
        }
      );

      const newTokens: AuthTokens = {
        accessToken: response.data.accessToken,
        refreshToken:
          response.data.refreshToken || this.authTokens.refreshToken,
      };

      this.setAuth(newTokens);
      return newTokens;
    } catch (error) {
      throw new Error("Failed to refresh token");
    }
  }

  public setAuth(tokens: AuthTokens): void {
    this.authTokens = tokens;
    // Store tokens in localStorage or secure storage
    if (typeof window !== "undefined") {
      localStorage.setItem("authTokens", JSON.stringify(tokens));
    }
  }

  public clearAuth(): void {
    this.authTokens = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("authTokens");
    }
  }

  public loadAuth(): boolean {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("authTokens");
      if (stored) {
        try {
          this.authTokens = JSON.parse(stored);
          return true;
        } catch {
          return false;
        }
      }
    }
    return false;
  }

  public isAuthenticated(): boolean {
    return this.authTokens !== null;
  }

  // HTTP Methods
  public async get<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axiosInstance.get<T>(url, config);
    return response.data;
  }

  public async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }

  public async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  public async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axiosInstance.patch<T>(url, data, config);
    return response.data;
  }

  public async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }

  // Auth endpoints
  public async login(email: string, password: string): Promise<AuthTokens> {
    const response = await this.post<{ data: AuthTokens }>("/api/auth/login", {
      email,
      password,
    });
    this.setAuth(response.data);
    return response.data;
  }

  public async logout(): Promise<void> {
    try {
      await this.post("/api/auth/logout");
    } finally {
      this.clearAuth();
    }
  }

  public getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

// Singleton instance
let fastifyClientInstance: FastifyClient | null = null;

export function createFastifyClient(config: ApiConfig): FastifyClient {
  fastifyClientInstance = new FastifyClient(config);
  return fastifyClientInstance;
}

export function getFastifyClient(): FastifyClient {
  if (!fastifyClientInstance) {
    throw new Error(
      "FastifyClient not initialized. Call createFastifyClient first."
    );
  }
  return fastifyClientInstance;
}
