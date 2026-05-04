export class OAuthPopup {
  private popup: Window | null = null;

  public preparePopup(
    title: string = "OAuth Auth",
    w: number = 600,
    h: number = 700
  ): Window {
    if (typeof window === "undefined") {
      throw new Error(
        "Window is undefined. Are you running this in the browser?"
      );
    }

    const dualScreenLeft =
      window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    const dualScreenTop =
      window.screenTop !== undefined ? window.screenTop : window.screenY;
    const width =
      window.innerWidth || document.documentElement.clientWidth || screen.width;
    const height =
      window.innerHeight ||
      document.documentElement.clientHeight ||
      screen.height;
    const left = width / 2 - w / 2 + dualScreenLeft;
    const top = height / 2 - h / 2 + dualScreenTop;

    const newWindow = window.open(
      "about:blank",
      title,
      `scrollbars=yes, width=${w}, height=${h}, top=${top}, left=${left}`
    );

    if (newWindow) {
      newWindow.focus();
      this.popup = newWindow;
      return newWindow;
    } else {
      throw new Error(
        "Failed to open popup window. Please allow popups and try again."
      );
    }
  }

  public navigateToUrl(url: string): void {
    if (!this.popup) {
      throw new Error(
        "Popup window was not opened. Please allow popups and try again."
      );
    }

    if (this.popup.closed) {
      throw new Error("Popup window was closed.");
    }

    this.popup.location.href = url;
  }

  /**
   * Close the OAuth popup. After Plex loads, the window is cross-origin; some
   * browsers still ignore opener.close(), so we also navigate to a same-origin
   * page that calls window.close() (see /plex-oauth-complete.html).
   */
  public closePopup(): void {
    const popup = this.popup;
    if (!popup) {
      return;
    }
    this.popup = null;

    const tryClose = (): void => {
      try {
        if (!popup.closed) {
          popup.close();
        }
      } catch {
        /* ignore */
      }
    };

    tryClose();

    if (typeof window !== "undefined" && !popup.closed) {
      try {
        popup.location.href = `${window.location.origin}/plex-oauth-complete.html`;
      } catch {
        tryClose();
      }
      setTimeout(tryClose, 450);
    }
  }

  public getPopup(): Window | null {
    return this.popup;
  }

  public isPopupOpen(): boolean {
    return this.popup !== null && !this.popup.closed;
  }
}
