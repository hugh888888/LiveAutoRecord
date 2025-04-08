"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoomInfo = void 0;
const axios_1 = __importDefault(require("axios"));
const axios_cookiejar_support_1 = require("axios-cookiejar-support");
const tough_cookie_1 = require("tough-cookie");
const utils_1 = require("./utils");
const jar = new tough_cookie_1.CookieJar();
const requester = (0, axios_cookiejar_support_1.wrapper)(axios_1.default.create({
    timeout: 10e3,
    jar,
    // axios 会自动读取环境变量中的 http_proxy 和 https_proxy 并应用，这会让请求发往代理的 host。
    // 于是 set-cookie 的 domain 与请求的 host 无法匹配上，tough-cookie 在检查时会丢弃它，导致 cookie 丢失。
    // 所以这里需要主动禁用代理功能。
    proxy: false,
}));
let hasPush=false
function getRoomInfo(webRoomId, retryOnSpecialCode = true) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        // 抖音的 'webcast/room/web/enter' api 会需要 ttwid 的 cookie，这个 cookie 是由这个请求的响应头设置的，
        // 所以在这里请求一次自动设置。
        yield requester.get('https://live.douyin.com/');
        const res = yield requester.get('https://live.douyin.com/webcast/room/web/enter/', {
            params: {
                aid: 6383,
                live_id: 1,
                device_platform: 'web',
                language: 'zh-CN',
                enter_from: 'web_live',
                cookie_enabled: 'true',
                screen_width: 1920,
                screen_height: 1080,
                browser_language: 'zh-CN',
                browser_platform: 'MacIntel',
                browser_name: 'Chrome',
                browser_version: '108.0.0.0',
                web_rid: webRoomId,
                // enter_source:,
                'Room-Enter-User-Login-Ab': 0,
                is_need_double_stream: 'false',
            },
        });
        // console.log(res);
        // if (res.data.status_code !== 0||!res.data) {
        //     hasPush=true
        //     console.log('res.data is null');
        //     let config = {
        //         method: "post",
        //         url: " https://www.yunzhijia.com/gateway/robot/webhook/send?yzjtype=0&yzjtoken=06755bf1578c45659d55c4356da79648",
        //         headers: {
        //           "Content-Type": "application/json",
        //         },
        //         data: {
        //             content: "@ALL LIVE ERR"  }
                   
                     
        //     };
        //     if (!hasPush)     yield requester(config); 
            
          
        // } else {
        //     hasPush=false
        // }
        // 无 cookie 时 code 为 10037
        if (res.data.status_code === 10037 && retryOnSpecialCode) {
            // resp 自动设置 cookie
            yield requester.get('https://live.douyin.com/favicon.ico');
            return getRoomInfo(webRoomId, false);
        }
        (0, utils_1.assert)(res.data.status_code === 0, `Unexpected resp, code ${res.data.status_code}, msg ${res.data.data}, id ${webRoomId}`);
        const data = res.data.data;
        const room = data.data[0];
        if ((room === null || room === void 0 ? void 0 : room.stream_url) == null) {
            return {
                living: false,
                roomId: webRoomId,
                owner: data.user.nickname,
                title: (_a = room === null || room === void 0 ? void 0 : room.title) !== null && _a !== void 0 ? _a : data.user.nickname,
                streams: [],
                sources: [],
            };
        }
        const { options: { qualities }, stream_data, } = room.stream_url.live_core_sdk_data.pull_data;
        const streamData = JSON.parse(stream_data).data;
        const streams = qualities.map((info) => ({
            desc: info.name,
            key: info.sdk_key,
            bitRate: info.v_bit_rate,
        }));
        // 看起来抖音是自动切换 cdn 的，所以这里固定返回一个默认的 source。
        const sources = [
            {
                name: '自动切换线路',
                streamMap: streamData,
            },
        ];
        return {
            living: data.room_status === 0,
            // 接口里不会再返回 web room id，只能直接用入参原路返回了。
            roomId: webRoomId,
            owner: data.user.nickname,
            title: room.title,
            streams,
            sources,
        };
    });
}
exports.getRoomInfo = getRoomInfo;
//# sourceMappingURL=douyin_api.js.map