document.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".site-nav");

  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => {
      const expanded = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!expanded));
      navigation.classList.toggle("is-open", !expanded);
    });
  }

  const surveyUrl = typeof SURVEY_URL === "string" ? SURVEY_URL.trim() : "";
  const surveyLinks = document.querySelectorAll("[data-survey-link]");

  surveyLinks.forEach((link) => {
    if (!surveyUrl) {
      link.setAttribute("aria-disabled", "true");
      link.removeAttribute("target");
      return;
    }

    link.href = surveyUrl;
    link.removeAttribute("aria-disabled");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
});
