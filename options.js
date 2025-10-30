function restore() {
  chrome.storage.sync.get({ cps: 20, enterAsReturn: true }, (opts) => {
    document.getElementById('cps').value = String(opts.cps ?? 20);
    document.getElementById('enterAsReturn').checked = !!opts.enterAsReturn;
  });
}
function save() {
  const cps = Number(document.getElementById('cps').value) || 20;
  const enterAsReturn = document.getElementById('enterAsReturn').checked;
  chrome.storage.sync.set({ cps, enterAsReturn }, () => {
    const st = document.getElementById('status');
    st.textContent = "Saved.";
    setTimeout(() => (st.textContent = ""), 1200);
  });
}
document.getElementById('save').addEventListener('click', save);
document.addEventListener('DOMContentLoaded', restore);
