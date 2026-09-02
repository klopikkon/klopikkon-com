(function () {
  var form = document.getElementById("enquiry-form");
  if (!form) return;

  var button = form.querySelector('button[type="submit"]');
  var status = document.getElementById("enquiry-status");

  function setStatus(text, kind) {
    if (!status) return;
    status.hidden = false;
    status.textContent = text;
    status.className = "form-status" + (kind ? " form-status--" + kind : "");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var honey = form.elements._honey;
    if (honey && honey.value) return;

    var name = (form.elements.name.value || "").trim();
    var email = (form.elements.email.value || "").trim();
    var message = (form.elements.message.value || "").trim();
    if (!name || !email || !message) {
      setStatus("Please fill in your name, email, and message.", "error");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Sending";
    }
    setStatus("Sending");

    fetch("https://formsubmit.co/ajax/adamarc999@yahoo.com.au", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name: name,
        email: email,
        message: message,
        _subject: "Enquiry from klopikkon"
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || (result.data && result.data.success === "false")) {
          throw new Error("not sent");
        }
        form.reset();
        setStatus("Sent. I will reply by email.", "ok");
      })
      .catch(function () {
        setStatus("Could not send. Try again in a moment.", "error");
      })
      .then(function () {
        if (button) {
          button.disabled = false;
          button.textContent = "Send an enquiry";
        }
      });
  });
})();
