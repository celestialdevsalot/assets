// too lazy to make a new one, why waste resources?

if (localStorage.getItem("switchCloakOn") === "true") {
  const title = localStorage.getItem("savedTitle");
  const favicon = localStorage.getItem("savedFavicon");

  if (document.hidden) {
    document.title = title || "Google Slides";

    if (favicon) {
      let icon = document.querySelector('link[rel~="icon"]');

      if (!icon) {
        icon = document.createElement("link");
        icon.rel = "icon";
        document.head.appendChild(icon);
      }

      icon.href = favicon;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      document.title = title || "Google Slides";

      if (favicon) {
        let icon = document.querySelector('link[rel~="icon"]');

        if (!icon) {
          icon = document.createElement("link");
          icon.rel = "icon";
          document.head.appendChild(icon);
        }

        icon.href = favicon;
      }
    } else {
      document.title =
        localStorage.getItem("savedTitle") || "celestial.";

      const savedFavicon =
        localStorage.getItem("savedFavicon");

      if (savedFavicon) {
        let icon = document.querySelector('link[rel~="icon"]');

        if (!icon) {
          icon = document.createElement("link");
          icon.rel = "icon";
          document.head.appendChild(icon);
        }

        icon.href = savedFavicon;
      }
    }
  });
}