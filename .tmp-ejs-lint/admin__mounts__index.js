/* inline script 1 */

document.getElementById('newMountBtn').addEventListener('click', () => {
  document.getElementById('mountModal').classList.remove('hidden');
  document.getElementById('mountModal').classList.add('flex');
});
function closeMountModal() {
  document.getElementById('mountModal').classList.add('hidden');
  document.getElementById('mountModal').classList.remove('flex');
}
document.getElementById('saveMountBtn').addEventListener('click', async () => {
  const body = {
    name: document.getElementById('mountName').value,
    source: document.getElementById('mountSource').value,
    target: document.getElementById('mountTarget').value,
    readOnly: document.getElementById('mountReadOnly').checked,
  };
  const r = await fetch('/admin/mounts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json();
  if (r.ok) { showToast('Mount created.', 'success'); setTimeout(() => location.reload(), 800); }
  else showToast(d.error || 'Failed to create mount.', 'error');
});
window.deleteMount = async (id) => {
  const r = await fetch('/admin/mounts/' + id, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) { showToast('Mount deleted.', 'success'); setTimeout(() => location.reload(), 800); }
  else showToast(d.error || 'Failed to delete mount.', 'error');
};
