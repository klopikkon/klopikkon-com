(function () {
  var form = document.getElementById("enquiry-form");
  if (!form) return;

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = (form.elements.name.value || "").trim();
    var email = (form.elements.email.value || "").trim();
    var message = (form.elements.message.value || "").trim();
    var body = "Name: " + name + "\nEmail: " + email + "\n\n" + message;
    var href =
      "mailto:adamarc999@yahoo.com.au?subject=" +
      encodeURIComponent("Enquiry from klopikkon") +
      "&body=" +
      encodeURIComponent(body);
    window.location.href = href;
  });
})();
