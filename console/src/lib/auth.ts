export function getAuth(): boolean {
  return sessionStorage.getItem("kprobe_authed") === "1";
}

export function setAuth(value: boolean) {
  if (value) {
    sessionStorage.setItem("kprobe_authed", "1");
  } else {
    sessionStorage.removeItem("kprobe_authed");
  }
}
