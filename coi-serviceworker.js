/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (event) => {
        if (event.data && event.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => self.clients.matchAll())
                .then((clients) => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const request =
            coepCredentialless && r.mode === "no-cors"
                ? new Request(r, {
                      credentials: "omit",
                  })
                : r;

        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set(
                        "Cross-Origin-Embedder-Policy",
                        coepCredentialless ? "credentialless" : "require-corp"
                    );
                    if (!coepCredentialless) {
                        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                    }
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });
} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coi = {
            shouldRegister: () => !reloadedBySelf,
            shouldDeregister: () => false,
            coepCredentialless: () => true,
            coepDegrade: () => true,
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi,
        };

        let n = navigator.serviceWorker;
        if (n && n.controller) {
            n.controller.postMessage({
                type: "coepCredentialless",
                value: coi.coepCredentialless(),
            });

            if (coi.shouldDeregister()) {
                n.controller.postMessage({ type: "deregister" });
            }
        }

        if (coi.shouldRegister()) {
            if (window.isSecureContext) {
                const script = document.currentScript;
                n.register(script.src).then(
                    (registration) => {
                        !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);

                        registration.addEventListener("updatefound", () => {
                            !coi.quiet && console.log("Signalled reload due to Service Worker update.");
                            window.sessionStorage.setItem("coiReloadedBySelf", "true");
                            coi.doReload();
                        });

                        if (registration.active && !n.controller) {
                            !coi.quiet && console.log("Signalled reload due to Service Worker registration.");
                            window.sessionStorage.setItem("coiReloadedBySelf", "true");
                            coi.doReload();
                        }
                    },
                    (err) => {
                        !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);
                    }
                );
            } else {
                !coi.quiet &&
                    console.warn(
                        "COOP/COEP Service Worker not registered, perhaps public hostname is not secure?"
                    );
            }
        }
    })();
}
