const TOKEN_KEY = "kprobe_token";
let _token: string | null = sessionStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
	return _token;
}

export function setToken(token: string): void {
	_token = token;
	sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
	_token = null;
	sessionStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
	return _token !== null;
}
