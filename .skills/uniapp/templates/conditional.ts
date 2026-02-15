/**
 * 平台工具函数
 * 使用条件编译处理多端差异
 */

// 平台标识
// #ifdef MP-WEIXIN
export const PLATFORM = 'mp-weixin' as const
// #endif
// #ifdef MP-ALIPAY
export const PLATFORM = 'mp-alipay' as const
// #endif
// #ifdef H5
export const PLATFORM = 'h5' as const
// #endif
// #ifdef APP-PLUS
export const PLATFORM = 'app' as const
// #endif

// 平台判断
export const isWeixin = PLATFORM === 'mp-weixin'
export const isAlipay = PLATFORM === 'mp-alipay'
export const isH5 = PLATFORM === 'h5'
export const isApp = PLATFORM === 'app'
export const isMiniProgram = isWeixin || isAlipay

/**
 * 统一登录
 */
export async function login(): Promise<string> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (res) => resolve(res.code),
      fail: reject
    })
  })
  // #endif

  // #ifdef MP-ALIPAY
  return new Promise((resolve, reject) => {
    my.getAuthCode({
      scopes: 'auth_base',
      success: (res: { authCode: string }) => resolve(res.authCode),
      fail: reject
    })
  })
  // #endif

  // #ifdef H5
  throw new Error('H5 端请使用其他登录方式')
  // #endif
}

/**
 * 统一分享
 */
export interface ShareParams {
  title: string
  path?: string
  imageUrl?: string
}

export function share(params: ShareParams): void {
  // #ifdef H5
  if (navigator.share) {
    navigator.share({
      title: params.title,
      url: window.location.origin + (params.path || '')
    })
  } else {
    uni.showToast({ title: '请手动复制链接', icon: 'none' })
  }
  // #endif
}

/**
 * 获取系统信息
 */
export function getSystemInfo() {
  const info = uni.getSystemInfoSync()
  return {
    platform: PLATFORM,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    statusBarHeight: info.statusBarHeight || 0,
    safeAreaBottom: info.safeAreaInsets?.bottom || 0,
    pixelRatio: info.pixelRatio
  }
}