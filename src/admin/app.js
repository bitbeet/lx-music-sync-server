let token = localStorage.getItem('admin_token') || ''
let users = []

const api = (path, opts = {}) => fetch('/admin/api' + path, {
  ...opts,
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers||{}) },
}).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error||'failed'); return d })

function login() {
  token = document.getElementById('token').value.trim()
  if (!token) return show('err', '请输入密钥')
  api('/users').then(() => {
    localStorage.setItem('admin_token', token)
    document.getElementById('login').style.display = 'none'
    document.getElementById('app').style.display = 'block'
    loadUsers()
  }).catch(e => show('err', e.message))
}

function logout() {
  localStorage.removeItem('admin_token')
  token = ''
  document.getElementById('app').style.display = 'none'
  document.getElementById('login').style.display = 'block'
}

function tab(id, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'))
  btn.classList.add('on')
  document.getElementById('users').style.display = id === 'users' ? '' : 'none'
  document.getElementById('snap').style.display = id === 'snap' ? '' : 'none'
  if (id === 'snap') updateSelect()
}

function show(id, msg) { const e = document.getElementById(id); e.textContent = msg; e.style.display = msg ? '' : 'none' }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }
function time(t) { return t ? new Date(t).toLocaleString('zh-CN') : '' }

function loadUsers() {
  api('/users').then(d => {
    users = d.users
    const el = document.getElementById('ulist')
    if (!users.length) { el.innerHTML = '<div class="empty">暂无用户</div>'; return }
    el.innerHTML = users.map(u => `<div class="item"><div><div class="nm">${esc(u.name)}</div><div class="mt">${u.maxSnapshotNum?'快照数:'+u.maxSnapshotNum+' | ':''}${u['list.addMusicLocationType']||''}</div></div><div class="ac"><button class="b2" onclick="chpass('${esc(u.name)}')">改密</button><button class="b3" onclick="delUser('${esc(u.name)}')">删除</button></div></div>`).join('')
  }).catch(e => alert(e.message))
}

function addUser() {
  const name = document.getElementById('uname').value.trim()
  const pass = document.getElementById('upass').value.trim()
  if (!name || !pass) return show('uerr', '请填写用户名和密码')
  api('/users', { method: 'POST', body: JSON.stringify({ name, password: pass }) }).then(() => {
    document.getElementById('uname').value = ''
    document.getElementById('upass').value = ''
    show('uerr', '')
    loadUsers()
  }).catch(e => show('uerr', e.message))
}

function delUser(name) {
  if (!confirm('确认删除用户 ' + name + '?')) return
  api('/users/' + encodeURIComponent(name), { method: 'DELETE' }).then(() => loadUsers()).catch(e => alert(e.message))
}

function chpass(name) {
  const p = prompt('输入 ' + name + ' 的新密码:')
  if (!p) return
  api('/users/' + encodeURIComponent(name) + '/password', { method: 'PUT', body: JSON.stringify({ password: p }) }).then(() => alert('修改成功')).catch(e => alert(e.message))
}

function updateSelect() {
  const s = document.getElementById('suser')
  s.innerHTML = '<option value="">-- 选择 --</option>' + users.map(u => `<option value="${esc(u.name)}">${esc(u.name)}</option>`).join('')
}

function loadSnap() {
  const name = document.getElementById('suser').value
  const info = document.getElementById('sinfo')
  if (!name) { info.style.display = 'none'; return }
  api('/users/' + encodeURIComponent(name) + '/snapshots').then(d => {
    info.style.display = ''
    renderSnap('lsnap', name, d.list, 'list')
    renderSnap('dsnap', name, d.dislike, 'dislike')
  }).catch(e => show('ierr', e.message))
}

function renderSnap(id, name, data, type) {
  const el = document.getElementById(id)
  const all = []
  if (data.latest) all.push(data.latest)
  all.push(...data.snapshots.filter(s => s !== data.latest))
  if (!all.length) { el.innerHTML = '<div class="empty">暂无快照</div>'; return }
  el.innerHTML = all.map((s, i) => `<div class="item"><div><div class="nm" style="font-family:monospace;font-size:12px;word-break:break-all">${esc(s)}${i===0?' (最新)':''}</div><div class="mt">${time(data.time)}</div></div><div class="ac"><button class="b4" onclick="restore('${esc(name)}','${esc(s)}','${type}')">恢复</button><button class="b2" onclick="exportSnap('${esc(name)}','${esc(s)}','${type}')">导出</button></div></div>`).join('')
}

function restore(name, sid, type) {
  if (!confirm('确认恢复? 将覆盖当前数据')) return
  api('/users/' + encodeURIComponent(name) + '/snapshots/' + encodeURIComponent(sid) + '/restore', { method: 'POST', body: JSON.stringify({ type }) }).then(() => alert('恢复成功')).catch(e => alert(e.message))
}

function exportSnap(name, sid, type) {
  fetch('/admin/api/users/' + encodeURIComponent(name) + '/snapshots/' + encodeURIComponent(sid) + '/export?type=' + type, { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.blob()).then(b => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = type + '_' + name + '_' + sid.slice(0, 8) + '.json'
      a.click()
    }).catch(e => alert(e.message))
}

if (token) {
  api('/users').then(() => {
    document.getElementById('login').style.display = 'none'
    document.getElementById('app').style.display = 'block'
    loadUsers()
  }).catch(() => { localStorage.removeItem('admin_token'); token = '' })
}

document.getElementById('token').addEventListener('keypress', e => { if (e.key === 'Enter') login() })
