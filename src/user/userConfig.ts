import fs from 'node:fs'
import path from 'node:path'
import { File } from '@/constants'
import { getUserDirname } from './data'

interface PersistedUser {
  name: string
  password: string
  maxSnapshotNum?: number
  'list.addMusicLocationType'?: LX.AddMusicLocationType
}

const userConfigFilePath = path.join(global.lx.dataPath, File.userConfigJSON)
let persistedUsers: PersistedUser[] = []

const save = () => {
  try {
    fs.writeFileSync(userConfigFilePath, JSON.stringify(persistedUsers, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save users.json:', err)
  }
}

export const initUserConfig = () => {
  try {
    if (fs.existsSync(userConfigFilePath)) {
      persistedUsers = JSON.parse(fs.readFileSync(userConfigFilePath, 'utf-8'))
    }
  } catch (err) {
    console.error('Failed to load users.json:', err)
  }
  for (const u of persistedUsers) {
    if (global.lx.config.users.some(x => x.name === u.name)) continue
    const dir = path.join(global.lx.userPath, getUserDirname(u.name))
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    global.lx.config.users.push({ ...u, dataPath: dir })
  }
  if (persistedUsers.length) console.log(`Loaded ${persistedUsers.length} persisted users from users.json`)
}

export const addUserConfig = (user: PersistedUser): boolean => {
  if (persistedUsers.some(u => u.name === user.name)) return false
  persistedUsers.push(user)
  save()
  return true
}

export const removeUserConfig = (userName: string): boolean => {
  const i = persistedUsers.findIndex(u => u.name === userName)
  if (i === -1) return false
  persistedUsers.splice(i, 1)
  save()
  return true
}

export const updateUserPassword = (userName: string, password: string): boolean => {
  const u = persistedUsers.find(x => x.name === userName)
  if (!u) return false
  u.password = password
  save()
  return true
}
