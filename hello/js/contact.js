(function () {
  var form = document.getElementById("enquiry-form");
  if (!form) return;

  var button = form.querySelector('button[type="submit"]');
  var status = document.getElementById("enquiry-status");
  var otherBox = document.getElementById("enq-other");
  var otherWrap = document.getElementById("other-wrap");
  var otherCheck = form.querySelector('input[name="reason"][value="Other"]');

  function setStatus(text, kind) {
    if (!status) return;
    status.hidden = false;
    status.textContent = text;
    status.className = "form-status" + (kind ? " form-status--" + kind : "");
  }

  function reasons() {
    return Array.prototype.map.call(
      form.querySelectorAll('input[name="reason"]:checked'),
      function (el) { return el.value; }
    );
  }

  function syncOther() {
    var on = otherCheck && otherCheck.checked;
    if (otherWrap) otherWrap.hidden = !on;
    if (otherBox) {
      otherBox.required = !!on;
      if (!on) otherBox.value = "";
    }
  }

  if (otherCheck) otherCheck.addEventListener("change", syncOther);
  syncOther();

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var honey = form.elements._honey;
    if (honey && honey.value) return;

    var name = (form.elements.name.value || "").trim();
    var email = (form.elements.email.value || "").trim();
    var message = (form.elements.message.value || "").trim();
    var picked = reasons();
    var other = (otherBox && otherBox.value || "").trim();

    if (!name || !email || !message) {
      setStatus("Please fill in your name, email, and message.", "error");
      return;
    }
    if (picked.indexOf("Other") !== -1 && !other) {
      setStatus("Please add a note for Other.", "error");
      if (otherBox) otherBox.focus();
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
        reasons: picked,
        other: other,
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
        syncOther();
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
