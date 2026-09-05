document.addEventListener("DOMContentLoaded", function () {
  var inp = document.getElementById("targetFolder");
  var btn = document.getElementById("saveBtn");
  var bdg = document.getElementById("savedBadge");

  if (window.chrome && chrome.storage) {
    chrome.storage.local.get(["targetSubfolder"], function (r) {
      if (r && r.targetSubfolder) {
        inp.value = r.targetSubfolder;
      }
    });
  }

  btn.addEventListener("click", function () {
    var val = inp.value.trim() || "SeaPower/user/missions";
    if (window.chrome && chrome.storage) {
      chrome.storage.local.set({ targetSubfolder: val }, function () {
        bdg.style.display = "block";
        setTimeout(function () {
          bdg.style.display = "none";
        }, 2000);
      });
    }
  });
});
