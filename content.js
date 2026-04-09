document.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "ArrowUp") {
    const link = document.querySelector(
      'div[data-testid="task-detail-breadcrumbs"] > a'
    );
    if (link) {
      event.preventDefault();
      link.click();
    }
  }
});
