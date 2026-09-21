// This runs in the background, managed by the browser — independent of any open tab.
self.addEventListener("push", (event) => {
  let data = { title: "Dispatch", body: "" };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data ? event.data.text() : "";
  }
  const title = data.title || "Dispatch";
  const options = {
    body: data.body || "",
    icon: undefined,
    badge: undefined,
    tag: "dispatch-" + Date.now()
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
