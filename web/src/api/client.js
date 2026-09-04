const API_BASE = '/api/v1';

export class ApiClient {
  static getToken() {
    return localStorage.getItem('wh_access_token');
  }

  static getRefreshToken() {
    return localStorage.getItem('wh_refresh_token');
  }

  static setTokens(access, refresh) {
    if (access) localStorage.setItem('wh_access_token', access);
    if (refresh) localStorage.setItem('wh_refresh_token', refresh);
  }

  static clearTokens() {
    localStorage.removeItem('wh_access_token');
    localStorage.removeItem('wh_refresh_token');
    localStorage.removeItem('wh_user');
    localStorage.removeItem('wh_company');
  }

  static async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle token expired (401)
    if (response.status === 401 && this.getRefreshToken()) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.getToken()}`;
        response = await fetch(url, {
          ...options,
          headers,
        });
      } else {
        this.clearTokens();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: response.statusText || 'Erro na requisição' };
      }
      throw new Error(errorData.error || `Erro ${response.status}`);
    }

    // Return JSON or text
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  static async refreshToken() {
    try {
      const refresh = this.getRefreshToken();
      if (!refresh) return false;

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });

      if (!res.ok) return false;
      const data = await res.json();
      this.setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  static get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  static post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  static patch(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  static async uploadFile(endpoint, file, fieldName = 'file') {
    const token = this.getToken();
    const formData = new FormData();
    formData.append(fieldName, file);

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: response.statusText || 'Erro no upload' };
      }
      throw new Error(errorData.error || `Erro ${response.status}`);
    }

    return response.json();
  }
}

export default ApiClient;
