const isInstalled = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAndroid = /Android/i.test(navigator.userAgent);
let deferredInstallPrompt = null;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallBanner();
});

window.addEventListener("appinstalled", () => {
  document.querySelector(".install-banner")?.remove();
  document.querySelectorAll("[data-install-app]").forEach((button) => button.remove());
});

function showInstallBanner() {
  if (isInstalled || document.querySelector(".install-banner")) return;
  const banner = document.createElement("aside");
  banner.className = "install-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Install Shera Studio app");
  banner.innerHTML = `
    <div class="install-banner__copy">
      <strong>Save Shera Studio to your phone</strong>
      <span>${isIos ? "iPhone: tap Share, then Add to Home Screen." : isAndroid ? "Android Chrome: tap the three dots ⋮ in the top-right corner, then tap Install app." : deferredInstallPrompt ? "Press Install app for quicker access to classes and bookings." : "Open your browser menu and choose Install app or Add to Home Screen."}</span>
    </div>
    <div class="install-banner__actions">
      ${deferredInstallPrompt ? '<button class="install-banner__install" type="button">Install app</button>' : ""}
      <button class="install-banner__close" type="button" aria-label="Close install message">Not now</button>
    </div>`;

  banner.querySelector(".install-banner__close").addEventListener("click", () => {
    banner.remove();
  });

  banner.querySelector(".install-banner__install")?.addEventListener("click", async () => {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    banner.remove();
    deferredInstallPrompt = null;
  });

  document.body.append(banner);
}

document.querySelectorAll("[data-install-app]").forEach((button) => {
  if (isInstalled) {
    button.remove();
    return;
  }
  button.addEventListener("click", () => {
    showInstallBanner();
  });
});

window.addEventListener("load", showInstallBanner);
