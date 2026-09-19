import { type IncomingMessage, type ServerResponse } from 'node:http'
import { getUserSpace, releaseUserSpace } from '@/user'
import { toMD5 } from '@/utils'
import fs from 'node:fs'
import path from 'node:path'
import { getUserDirname } from '@/user/data'
import { addUserConfig, removeUserConfig, updateUserPassword } from '@/user/userConfig'

let adminToken = ''

export const setAdminToken = (token: string) => { adminToken = token }

const sendJson = (res: ServerResponse, status: number, data: any) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

const parseBody = (req: IncomingMessage): Promise<any> => new Promise((resolve, reject) => {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}) } catch (e) { reject(e) } })
  req.on('error', reject)
})

const authed = (req: IncomingMessage): boolean => {
  const auth = req.headers.authorization
  return !!auth && auth.startsWith('Bearer ') && auth.slice(7) === adminToken
}

export const handleAdminApi = async(req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
  if (!req.url?.startsWith('/admin/api/')) return false
  if (!authed(req)) { sendJson(res, 401, { error: 'Unauthorized' }); return true }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname.replace('/admin/api', '')
  const m = req.method

  if (p === '/users' && m === 'GET') {
    sendJson(res, 200, { users: global.lx.config.users.map(u => ({
      name: u.name, maxSnapshotNum: u.maxSnapshotNum, 'list.addMusicLocationType': u['list.addMusicLocationType'],
    })) })
    return true
  }

  if (p === '/users' && m === 'POST') {
    try {
      const { name, password, maxSnapshotNum, 'list.addMusicLocationType': loc } = await parseBody(req)
      if (!name || !password) { sendJson(res, 400, { error: 'name and password required' }); return true }
      if (global.lx.config.users.some(u => u.name === name)) { sendJson(res, 400, { error: 'User exists' }); return true }
      if (global.lx.config.users.some(u => u.password === password)) { sendJson(res, 400, { error: 'Password exists' }); return true }
      const dir = path.join(global.lx.userPath, getUserDirname(name))
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const newUser: LX.UserConfig = { name, password, dataPath: dir }
      if (maxSnapshotNum !== undefined) newUser.maxSnapshotNum = maxSnapshotNum
      if (loc !== undefined) newUser['list.addMusicLocationType'] = loc
      global.lx.config.users.push(newUser)
      addUserConfig({ name, password, maxSnapshotNum, 'list.addMusicLocationType': loc })
      sendJson(res, 200, { success: true })
    } catch (e: any) { sendJson(res, 500, { error: e.message }) }
    return true
  }

  let match = p.match(/^\/users\/([^/]+)$/)
  if (match && m === 'DELETE') {
    const name = decodeURIComponent(match[1])
    const i = global.lx.config.users.findIndex(u => u.name === name)
    if (i === -1) { sendJson(res, 404, { error: 'User not found' }); return true }
    releaseUserSpace(name, true)
    global.lx.config.users.splice(i, 1)
    removeUserConfig(name)
    sendJson(res, 200, { success: true })
    return true
  }

  match = p.match(/^\/users\/([^/]+)\/password$/)
  if (match && m === 'PUT') {
    const name = decodeURIComponent(match[1])
    const user = global.lx.config.users.find(u => u.name === name)
    if (!user) { sendJson(res, 404, { error: 'User not found' }); return true }
    const { password } = await parseBody(req)
    if (!password) { sendJson(res, 400, { error: 'password required' }); return true }
    if (global.lx.config.users.some(u => u.password === password && u.name !== name)) { sendJson(res, 400, { error: 'Password exists' }); return true }
    user.password = password
    updateUserPassword(name, password)
    sendJson(res, 200, { success: true })
    return true
  }

  match = p.match(/^\/users\/([^/]+)\/snapshots$/)
  if (match && m === 'GET') {
    const name = decodeURIComponent(match[1])
    if (!global.lx.config.users.some(u => u.name === name)) { sendJson(res, 404, { error: 'User not found' }); return true }
    const us = getUserSpace(name)
    const li = await us.listManage.snapshotDataManage.getSnapshotInfo()
    const di = await us.dislikeManage.snapshotDataManage.getSnapshotInfo()
    sendJson(res, 200, {
      list: { latest: li.latest, time: li.time, snapshots: li.list, devices: li.clients },
      dislike: { latest: di.latest, time: di.time, snapshots: di.list, devices: di.clients },
    })
    return true
  }

  match = p.match(/^\/users\/([^/]+)\/snapshots\/([^/]+)\/restore$/)
  if (match && m === 'POST') {
    const name = decodeURIComponent(match[1])
    const sid = decodeURIComponent(match[2])
    if (!global.lx.config.users.some(u => u.name === name)) { sendJson(res, 404, { error: 'User not found' }); return true }
    const { type = 'list' } = await parseBody(req)
    const us = getUserSpace(name)
    if (type === 'list') {
      const data = await us.listManage.snapshotDataManage.getSnapshot(sid)
      if (!data) { sendJson(res, 404, { error: 'Snapshot not found' }); return true }
      await us.listManage.listDataManage.listDataOverwrite(data)
    } else {
      const data = await us.dislikeManage.snapshotDataManage.getSnapshot(sid)
      if (!data) { sendJson(res, 404, { error: 'Snapshot not found' }); return true }
      await us.dislikeManage.dislikeDataManage.overwirteDislikeInfo(data)
    }
    sendJson(res, 200, { success: true })
    return true
  }

  match = p.match(/^\/users\/([^/]+)\/snapshots\/([^/]+)\/export$/)
  if (match && m === 'GET') {
    const name = decodeURIComponent(match[1])
    const sid = decodeURIComponent(match[2])
    if (!global.lx.config.users.some(u => u.name === name)) { sendJson(res, 404, { error: 'User not found' }); return true }
    const type = url.searchParams.get('type') || 'list'
    const us = getUserSpace(name)
    const data = type === 'dislike'
      ? await us.dislikeManage.snapshotDataManage.getSnapshot(sid)
      : await us.listManage.snapshotDataManage.getSnapshot(sid)
    if (!data) { sendJson(res, 404, { error: 'Snapshot not found' }); return true }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${type}_${name}_${sid}.json"` })
    res.end(JSON.stringify(data, null, 2))
    return true
  }

  match = p.match(/^\/users\/([^/]+)\/snapshots\/import$/)
  if (match && m === 'POST') {
    const name = decodeURIComponent(match[1])
    if (!global.lx.config.users.some(u => u.name === name)) { sendJson(res, 404, { error: 'User not found' }); return true }
    const { type = 'list', data } = await parseBody(req)
    if (!data) { sendJson(res, 400, { error: 'data required' }); return true }
    const us = getUserSpace(name)
    const str = JSON.stringify(data)
    const md5 = toMD5(str)
    if (type === 'list') {
      await us.listManage.snapshotDataManage.saveSnapshot(md5, str)
      const info = await us.listManage.snapshotDataManage.getSnapshotInfo()
      if (info.latest) info.list.unshift(info.latest)
      info.latest = md5; info.time = Date.now()
      us.listManage.snapshotDataManage.saveSnapshotInfo(info)
    } else {
      await us.dislikeManage.snapshotDataManage.saveSnapshot(md5, str)
      const info = await us.dislikeManage.snapshotDataManage.getSnapshotInfo()
      if (info.latest) info.list.unshift(info.latest)
      info.latest = md5; info.time = Date.now()
      us.dislikeManage.snapshotDataManage.saveSnapshotInfo(info)
    }
    sendJson(res, 200, { success: true, snapshotId: md5 })
    return true
  }

  sendJson(res, 404, { error: 'Not found' })
  return true
}
