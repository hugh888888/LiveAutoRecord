const crypto = require('crypto')
const { sign } = require('./signer.js')
const axios = require('axios')

function msToken(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const randomBytes = crypto.randomBytes(length)
  return Array.from(randomBytes, (byte) => characters[byte % characters.length]).join('')
}

async function getTtwid() {
  try {
    const url = 'https://ttwid.bytedance.com/ttwid/union/register/'
    const data = {
      region: 'cn',
      aid: 1768,
      needFid: false,
      service: 'www.ixigua.com',
      migrate_info: { ticket: '', source: 'node' },
      cbUrlProtocol: 'https',
      union: true,
    }
    const response = await axios.post(url, data, {
      headers: { 'Content-Type': 'application/json' },
    })
    console.log('setCookie', response)
    const setCookie = response.headers['set-cookie']

    const regex = /ttwid=([^;]+)/
    const match = regex.exec(setCookie[0])
    return match && match.length > 1 ? match[1] : ''
  } catch (error) {
    console.error(error)
    return ''
  }
}

const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.47'

async function getDouYinSign(url) {
  const query = url.includes('?') ? url.split('?')[1] : ''
  const xbogus = sign(query, userAgent)
  const newUrl = `${url}&X-Bogus=${xbogus}`
  const ttwid = await getTtwid()
  const msTokens = msToken(107)
  return {
    ttwid,
    xbogus,
    newUrl,
    msToken: msTokens,
  }
}

module.exports = { getDouYinSign }
