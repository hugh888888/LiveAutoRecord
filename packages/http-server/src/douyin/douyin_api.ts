import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { assert } from './utils'
import crypto from 'crypto'
const { sign } = require('../public/douyin_sign')
const jar = new CookieJar()
const requester = wrapper(
  axios.create({
    timeout: 10e3,
    jar,
    // axios 会自动读取环境变量中的 http_proxy 和 https_proxy 并应用，这会让请求发往代理的 host。
    // 于是 set-cookie 的 domain 与请求的 host 无法匹配上，tough-cookie 在检查时会丢弃它，导致 cookie 丢失。
    // 所以这里需要主动禁用代理功能。
    proxy: false,
  }),
)
const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.47'

const msToken = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const randomBytes = crypto.randomBytes(length)
  return Array.from(randomBytes, (byte) => characters[byte % characters.length]).join('')
}
const getDouYinSign = async (url) => {
  const query = url.includes('?') ? url.split('?')[1] : ''
  const xbogus = sign(query, userAgent)
  const newUrl = `${url}&X-Bogus=${xbogus}`

  return {
    xbogus,
    newUrl,
  }
}

export async function getRoomInfo(
  webRoomId: string,
  retryOnSpecialCode = true,
): Promise<{
  living: boolean
  roomId: string
  owner: string
  title: string
  streams: StreamProfile[]
  sources: SourceProfile[]
}> {
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.47'

  // 抖音的 'webcast/room/web/enter' api 会需要 ttwid 的 cookie，这个 cookie 是由这个请求的响应头设置的，
  // 所以在这里请求一次自动设置。
  await requester.get('https://live.douyin.com/')

  const oldUrl = `https://live.douyin.com/webcast/room/web/enter/?aid=6383&live_id=1&device_platform=web&language=zh-CN&enter_from=web_live&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=MacIntel&browser_name=Chrome&browser_version=108.0.0.0&web_rid=${webRoomId}&Room-Enter-User-Login-Ab=0&is_need_double_stream=false`
  const bb = await getDouYinSign(oldUrl)
  const res = await requester.get<EnterRoomApiResp>(bb.newUrl, {
    headers: {
      'User-Agent': userAgent,
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'cache-control': 'max-age=0',
      priority: 'u=0, i',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      cookie:
        'UIFID_TEMP=3c3e9d4a635845249e00419877a3730e2149197a63ddb1d8525033ea2b3354c2f12ff8cd3b81aa55ef6c7aab639cb06a81028c968111f71e1c6a46cc17478aed9c77777e2f722658e1fc96debb48cc89; UIFID=3c3e9d4a635845249e00419877a3730e2149197a63ddb1d8525033ea2b3354c2f12ff8cd3b81aa55ef6c7aab639cb06a05445d670da6db976c8652949ef0c9f7569dc95b964e9b6a1a8a687b6abb9d1e6121506243952c9850a391c14b0487ff5c17cea0ad7cf38d1ad2bd8ad7fdf66807773fdeba9e748d99221ea1e7f9f867aea0b57ad663529b071ce633d34a350daa447c6ae580f8a594768dab5dfdd3b5; live_use_vvc=%22false%22; xgplayer_user_id=210282485698; odin_tt=7aea1f3dcddcfc85ab5d7b3a930b72ba95ad525b1257f3d477316f2b7e0bdd647cdb0402fe27f59aa25645d2b1f732bfa601d0201dc59fbc8c887886938e69da260e134428ffce77e4156ce843de521d; fpk1=U2FsdGVkX1/LlJpYkbjQ6R56jDBBST/4Wb0ZT2Y58c51wGt+1sGv6M+mF3dVLz8xImel5KbNnxfDffNYbDX0Mg==; fpk2=362d7fe3d8b2581bffa359f0eeda7106; my_rd=2; SEARCH_RESULT_LIST_TYPE=%22single%22; ttwid=1%7CUHH1UPwg9LMVdmNIDC7qZHKRQVSLSUmEXieN9dBLJZs%7C1733886720%7C579ceb5986cf51815cd13a4dda1dc633d57a73697126299a9d9ef53b2f179a20; hevc_supported=true; stream_recommend_feed_params=%22%7B%5C%22cookie_enabled%5C%22%3Atrue%2C%5C%22screen_width%5C%22%3A1920%2C%5C%22screen_height%5C%22%3A1080%2C%5C%22browser_online%5C%22%3Atrue%2C%5C%22cpu_core_num%5C%22%3A24%2C%5C%22device_memory%5C%22%3A8%2C%5C%22downlink%5C%22%3A10%2C%5C%22effective_type%5C%22%3A%5C%224g%5C%22%2C%5C%22round_trip_time%5C%22%3A150%7D%22; strategyABtestKey=%221733886723.275%22; passport_csrf_token=d3c4ffefee3f27053da04d9730b561fa; passport_csrf_token_default=d3c4ffefee3f27053da04d9730b561fa; bd_ticket_guard_client_data=eyJiZC10aWNrZXQtZ3VhcmQtdmVyc2lvbiI6MiwiYmQtdGlja2V0LWd1YXJkLWl0ZXJhdGlvbi12ZXJzaW9uIjoxLCJiZC10aWNrZXQtZ3VhcmQtcmVlLXB1YmxpYy1rZXkiOiJCSHpvUGdCVDNBU3BOV1haWWdGZXA0akJJeVRIeGk3L2l1TnhaQnBMNTkvL283Z1EyN2FKVHBDTzZ0UlRhMnlIUkFPOUNvZVBXMzJ5Z2NGQ05Sc0lIM1U9IiwiYmQtdGlja2V0LWd1YXJkLXdlYi12ZXJzaW9uIjoyfQ%3D%3D; bd_ticket_guard_client_web_domain=2; biz_trace_id=d5bb1a0a; home_can_add_dy_2_desktop=%221%22; FORCE_LOGIN=%7B%22videoConsumedRemainSeconds%22%3A180%7D; __live_version__=%221.1.2.6176%22; has_avx2=null; device_web_cpu_core=24; device_web_memory_size=8; webcast_local_quality=null; csrf_session_id=54c8183e6cbf9418e346bfad022c2468; h265ErrorNum=-1; __ac_signature=_02B4Z6wo00f010nfLvwAAIDCloTdsoBmpx9J.ypAALU4bc; xg_device_score=8.028734300177488; volume_info=%7B%22isUserMute%22%3Atrue%2C%22isMute%22%3Atrue%2C%22volume%22%3A0.6%7D; webcast_leading_last_show_time=1733995028990; webcast_leading_total_show_times=1; IsDouyinActive=false; live_can_add_dy_2_desktop=%221%22; download_guide=%221%2F20241212%2F0%22',
    },
  })
  console.log(res.data.data)

  // 无 cookie 时 code 为 10037
  if (res.data.status_code === 10037 && retryOnSpecialCode) {
    // resp 自动设置 cookie
    await requester.get('https://live.douyin.com/favicon.ico')
    return getRoomInfo(webRoomId, false)
  }

  assert(
    res.data.status_code === 0,
    `Unexpected resp, code ${res.data.status_code}, msg ${res.data.data}, id ${webRoomId}`,
  )

  const data = res.data.data
  const room = data.data[0]

  if (room?.stream_url == null) {
    return {
      living: false,
      roomId: webRoomId,
      owner: data.user.nickname,
      title: room?.title ?? data.user.nickname,
      streams: [],
      sources: [],
    }
  }

  const {
    options: { qualities },
    stream_data,
  } = room.stream_url.live_core_sdk_data.pull_data
  const streamData = (JSON.parse(stream_data) as StreamData).data

  const streams: StreamProfile[] = qualities.map((info) => ({
    desc: info.name,
    key: info.sdk_key,
    bitRate: info.v_bit_rate,
  }))

  // 看起来抖音是自动切换 cdn 的，所以这里固定返回一个默认的 source。
  const sources: SourceProfile[] = [
    {
      name: '自动切换线路',
      streamMap: streamData,
    },
  ]

  return {
    living: data.room_status === 0,
    // 接口里不会再返回 web room id，只能直接用入参原路返回了。
    roomId: webRoomId,
    owner: data.user.nickname,
    title: room.title,
    streams,
    sources,
  }
}

export interface StreamProfile {
  desc: string
  key: string
  bitRate: number
}

export interface SourceProfile {
  name: string
  streamMap: StreamData['data']
}

interface EnterRoomApiResp {
  data: {
    data: [
      | undefined
      | {
          id_str: string
          status: number
          status_str: string
          title: string
          user_count_str: string
          cover: {
            url_list: string[]
          }
          stream_url?: {
            flv_pull_url: PullURLMap
            default_resolution: string
            hls_pull_url_map: PullURLMap
            hls_pull_url: string
            stream_orientation: number
            live_core_sdk_data: {
              pull_data: {
                options: {
                  default_quality: QualityInfo
                  qualities: QualityInfo[]
                }
                stream_data: string
              }
            }
            extra: {
              height: number
              width: number
              fps: number
              max_bitrate: number
              min_bitrate: number
              default_bitrate: number
              bitrate_adapt_strategy: number
              anchor_interact_profile: number
              audience_interact_profile: number
              hardware_encode: boolean
              video_profile: number
              h265_enable: boolean
              gop_sec: number
              bframe_enable: boolean
              roi: boolean
              sw_roi: boolean
              bytevc1_enable: boolean
            }
            pull_datas: unknown
          }
          mosaic_status: number
          mosaic_status_str: string
          admin_user_ids: number[]
          admin_user_ids_str: string[]
          owner: UserInfo
          room_auth: unknown
          live_room_mode: number
          stats: {
            total_user_desp: string
            like_count: number
            total_user_str: string
            user_count_str: string
          }
          has_commerce_goods: boolean
          linker_map: {}
          linker_detail: unknown
          room_view_stats: {
            is_hidden: boolean
            display_short: string
            display_middle: string
            display_long: string
            display_value: number
            display_version: number
            incremental: boolean
            display_type: number
            display_short_anchor: string
            display_middle_anchor: string
            display_long_anchor: string
          }
          scene_type_info: unknown
          toolbar_data: unknown
          room_cart: unknown
        },
    ]
    enter_room_id: string
    extra?: {
      digg_color: string
      pay_scores: string
      is_official_channel: boolean
      signature: string
    }
    user: UserInfo
    qrcode_url: string
    enter_mode: number
    room_status: number
    partition_road_map?: unknown
    similar_rooms: unknown[]
    shark_decision_conf: string
    web_stream_url?: unknown
  }
  extra: { now: number }
  status_code: number
}

type PullURLMap = Record<string, string>

interface QualityInfo {
  name: string
  sdk_key: string
  v_codec: string
  resolution: string
  level: number
  v_bit_rate: number
  additional_content: string
  fps: number
  disable: number
}

interface UserInfo {
  id_str: string
  sec_uid: string
  nickname: string
  avatar_thumb: {
    url_list: string[]
  }
  follow_info: { follow_status: number; follow_status_str: string }
}

interface StreamData {
  common: unknown
  data: Record<
    string,
    {
      main: {
        flv: string
        hls: string
        cmaf: string
        dash: string
        lls: string
        tsl: string
        tile: string
        sdk_params: string
      }
    }
  >
}
