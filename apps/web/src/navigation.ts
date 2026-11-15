/** Opens a settings page from anywhere (the app shell listens and switches the screen). */
export const OPEN_SETTINGS = "tavli:open-settings";

export const openSettings = (page: "notify" | null = null): void => {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS, { detail: page }));
};
