(function () {
  var root = document.documentElement;
  var toggle = document.querySelector("[data-theme-toggle]");
  var colors = {
    a: { light: "#f7f7f4", dark: "#111111" },
    b: { light: "#f2f6f3", dark: "#07141c" },
    c: { light: "#f3eadf", dark: "#1c130e" }
  };

  function look() {
    return root.getAttribute("data-look") || "a";
  }

  function paint(theme) {
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    var pair = colors[look()] || colors.a;
    if (meta) meta.setAttribute("content", pair[theme] || pair.light);
    if (toggle) {
      var dark = theme === "dark";
      toggle.setAttribute("aria-pressed", dark ? "true" : "false");
      toggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    }
    document.querySelectorAll("[data-look-set]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-look-set") === look() ? "true" : "false");
    });
    var open = document.querySelector("[data-look-href]");
    if (open) open.setAttribute("href", "/amt/redesign/variants/" + look() + "/");
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem("amt-theme", next); } catch (e) {}
      paint(next);
    });
  }

  document.querySelectorAll("[data-look-set]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = btn.getAttribute("data-look-set");
      var theme = next === "b" ? "dark" : "light";
      root.setAttribute("data-look", next);
      try {
        localStorage.setItem("amt-look", next);
        localStorage.setItem("amt-theme", theme);
      } catch (e) {}
      paint(theme);
    });
  });

  paint(root.getAttribute("data-theme") || "light");
})();
